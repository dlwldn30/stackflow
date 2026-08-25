import { describe, expect, it } from 'vitest'
import type { ComponentType, EventStatus, GraphNodeState, TraceDetail, TraceEvent, TraceSummary } from '../../types/trace'
import { buildFailurePropagationPath, filterTraceHistory, getDefaultInspectionEvent, getInspectorEvent, getKeyMetadata, getTraceOutcome, MAX_RECENT_TRACES, upsertRecentTrace } from './traceModel'

function event(
  spanId: string,
  parentSpanId: string | null,
  component: ComponentType,
  status: EventStatus = 'SUCCESS',
  spanKind = 'INTERNAL',
): TraceEvent {
  return {
    eventId: spanId,
    traceId: 'trace',
    component,
    eventType: `${component}.${spanId}`,
    status,
    startedAt: new Date(0).toISOString(),
    endedAt: new Date(10).toISOString(),
    durationMs: 10,
    errorType: status === 'SUCCESS' ? null : 'TestFailure',
    errorMessage: status === 'SUCCESS' ? null : 'failed',
    metadata: {},
    spanId,
    parentSpanId,
    serviceName: 'trace-lab',
    spanKind,
  }
}

function trace(resultStatus: EventStatus, events: TraceEvent[]): TraceDetail {
  return {
    traceId: 'trace', method: 'GET', endpoint: '/lab/products/1001', scenario: 'normal',
    startedAt: new Date(0).toISOString(), endedAt: new Date(10).toISOString(), durationMs: 10,
    httpStatus: resultStatus === 'ERROR' || resultStatus === 'TIMEOUT' ? 504 : 200,
    resultStatus, events, source: 'OPENTELEMETRY', serviceName: 'trace-lab', traceCollectionStatus: 'COMPLETED',
    responsePreview: null,
  }
}

describe('trace inspection model', () => {
  it('classifies an internal Redis error followed by success as recovered', () => {
    const redis = event('redis', 'server', 'REDIS', 'ERROR')
    expect(getTraceOutcome(trace('SUCCESS', [redis]), redis)).toBe('recovered')
  })

  it('classifies a terminal timeout as failure', () => {
    const postgres = event('postgres', 'server', 'POSTGRESQL', 'TIMEOUT')
    expect(getTraceOutcome(trace('TIMEOUT', [postgres]), postgres)).toBe('failure')
  })

  it('classifies span collection timeout separately from the HTTP result', () => {
    const timedOut = { ...trace('SUCCESS', []), traceCollectionStatus: 'TIMED_OUT' as const }
    expect(getTraceOutcome(timedOut, null)).toBe('collection_timeout')
  })

  it('selects the server span for a successful trace', () => {
    const internal = event('internal', 'server', 'SERVICE')
    const server = event('server', null, 'CONTROLLER', 'SUCCESS', 'SERVER')
    expect(getDefaultInspectionEvent(trace('SUCCESS', [internal, server]), null)?.spanId).toBe('server')
  })

  it('builds propagation from the cause to the root span', () => {
    const server = event('server', null, 'CONTROLLER', 'ERROR', 'SERVER')
    const service = event('service', 'server', 'SERVICE', 'ERROR')
    const postgres = event('postgres', 'service', 'POSTGRESQL', 'TIMEOUT')
    expect(buildFailurePropagationPath([server, service, postgres], postgres).map((item) => item.spanId))
      .toEqual(['postgres', 'service', 'server'])
  })

  it('builds a component propagation path for sample events without span ids', () => {
    const controller = { ...event('controller', null, 'CONTROLLER', 'ERROR'), spanId: null }
    const service = { ...event('service', null, 'SERVICE', 'ERROR'), spanId: null }
    const repository = { ...event('repository', null, 'REPOSITORY', 'ERROR'), spanId: null }
    const database = { ...event('database', null, 'MYSQL', 'TIMEOUT'), spanId: null }

    expect(buildFailurePropagationPath([controller, service, repository, database], database).map((item) => item.component))
      .toEqual(['MYSQL', 'REPOSITORY', 'SERVICE', 'CONTROLLER'])
  })

  it('uses the explicitly selected node event in the inspector', () => {
    const selected = event('redis', 'server', 'REDIS', 'ERROR')
    const node: GraphNodeState = {
      id: 'redis', component: 'REDIS', label: 'Redis', status: 'ERROR', durationMs: 10, active: true, visits: [selected],
    }
    expect(getInspectorEvent(node)?.spanId).toBe('redis')
  })

  it('filters recent traces by stable result categories', () => {
    const summaries: TraceSummary[] = (['SUCCESS', 'WARNING', 'ERROR', 'TIMEOUT'] as EventStatus[]).map((resultStatus, index) => ({
      traceId: String(index), endpoint: '/test', scenario: 'normal', resultStatus,
      httpStatus: 200, durationMs: 1, startedAt: new Date(0).toISOString(), traceCollectionStatus: 'COMPLETED',
    }))
    summaries.push({
      traceId: 'collection-timeout', endpoint: '/test', scenario: 'external-opentelemetry', resultStatus: 'SUCCESS',
      httpStatus: 200, durationMs: 1, startedAt: new Date(0).toISOString(), traceCollectionStatus: 'TIMED_OUT',
    })
    expect(filterTraceHistory(summaries, 'success')).toHaveLength(1)
    expect(filterTraceHistory(summaries, 'attention').map((item) => item.resultStatus)).toEqual(['WARNING', 'ERROR'])
    expect(filterTraceHistory(summaries, 'timeout')).toHaveLength(2)
  })

  it('translates curated metadata while retaining its original key', () => {
    expect(getKeyMetadata({ 'db.system.name': 'postgresql', private: 'hidden' }))
      .toEqual([{ key: 'db.system.name', label: '데이터베이스', value: 'postgresql' }])
  })

  it('keeps 25 recent traces with the newest unique trace first', () => {
    const summaries: TraceSummary[] = Array.from({ length: 30 }, (_, index) => ({
      traceId: `trace-${index}`, endpoint: '/test', scenario: 'normal', resultStatus: 'SUCCESS',
      httpStatus: 200, durationMs: index, startedAt: new Date(index).toISOString(), traceCollectionStatus: 'COMPLETED',
    }))
    const replacement = { ...summaries[10], durationMs: 999 }

    const updated = upsertRecentTrace(summaries, replacement)

    expect(updated).toHaveLength(MAX_RECENT_TRACES)
    expect(updated[0]).toEqual(replacement)
    expect(updated.filter((item) => item.traceId === replacement.traceId)).toHaveLength(1)
  })
})
