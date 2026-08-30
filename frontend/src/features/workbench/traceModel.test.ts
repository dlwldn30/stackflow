import { describe, expect, it } from 'vitest'
import type { ComponentType, EventStatus, GraphNodeState, TraceDetail, TraceEvent, TraceSummary } from '../../types/trace'
import { buildFailurePropagationPath, buildTraceOutcomePresentation, filterTraceHistory, getDefaultInspectionEvent, getExceptionLocation, getInspectorEvent, getKeyMetadata, getTraceCollectionPresentation, MAX_RECENT_TRACES, resolveCodeLocation, upsertRecentTrace } from './traceModel'

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
    stackTrace: null,
    stackTraceTruncated: false,
  }
}

function trace(resultStatus: EventStatus, events: TraceEvent[]): TraceDetail {
  return {
    traceId: 'trace', method: 'GET', endpoint: '/lab/products/1001', scenario: 'normal',
    startedAt: new Date(0).toISOString(), endedAt: new Date(10).toISOString(), durationMs: 10,
    httpStatus: resultStatus === 'ERROR' || resultStatus === 'TIMEOUT' ? 504 : 200,
    resultStatus, events, source: 'OPENTELEMETRY', serviceName: 'trace-lab', serviceNames: ['trace-lab'], traceCollectionStatus: 'COMPLETED',
    responsePreview: null,
  }
}

describe('trace inspection model', () => {
  it('classifies an internal Redis error followed by success as recovered', () => {
    const redis = event('redis', 'server', 'REDIS', 'ERROR')
    expect(buildTraceOutcomePresentation(trace('SUCCESS', [redis]), redis).outcome).toBe('recovered')
  })

  it('classifies a terminal timeout as failure', () => {
    const postgres = event('postgres', 'server', 'POSTGRESQL', 'TIMEOUT')
    expect(buildTraceOutcomePresentation(trace('TIMEOUT', [postgres]), postgres).outcome).toBe('failure')
  })

  it('keeps a successful HTTP result when span collection times out', () => {
    const timedOut = { ...trace('SUCCESS', []), traceCollectionStatus: 'TIMED_OUT' as const }
    expect(buildTraceOutcomePresentation(timedOut, null)).toMatchObject({
      outcome: 'success',
      resultLabel: 'HTTP 요청 성공',
      collectionTimedOut: true,
    })
  })

  it('keeps collection lifecycle labels independent from the HTTP result', () => {
    expect(getTraceCollectionPresentation('streaming', 'COLLECTING', true)).toEqual({ label: '수집 중', tone: 'info' })
    expect(getTraceCollectionPresentation('error', 'TIMED_OUT', true)).toEqual({ label: 'Span 수집 시간 초과', tone: 'warning' })
    expect(getTraceCollectionPresentation('idle', 'COMPLETED', true)).toEqual({ label: '수집 완료', tone: 'success' })
    expect(getTraceCollectionPresentation('idle', 'DISABLED', false)).toEqual({ label: 'Trace 대기', tone: 'neutral' })
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

  it('resolves legacy code attributes without changing their source keys', () => {
    const metadata = {
      'code.namespace': 'com.example.product.ProductService',
      'code.function': 'lookupProduct',
      'code.filepath': '/workspace/ProductService.java',
      'code.lineno': '73',
    }

    expect(resolveCodeLocation(metadata)).toEqual({
      className: 'com.example.product.ProductService',
      functionName: 'lookupProduct',
      filePath: '/workspace/ProductService.java',
      lineNumber: '73',
    })
    expect(Object.keys(metadata)).toEqual([
      'code.namespace', 'code.function', 'code.filepath', 'code.lineno',
    ])
  })

  it('splits a stable fully-qualified function name into class and method', () => {
    expect(getExceptionLocation({
      'code.function.name': 'com.example.product.ProductService.lookupProduct',
      'code.file.path': '/workspace/ProductService.java',
      'code.line.number': '73',
    })).toEqual([
      { key: 'class', label: '클래스', value: 'com.example.product.ProductService' },
      { key: 'method', label: '메서드', value: 'lookupProduct' },
      { key: 'file', label: '소스 파일', value: '/workspace/ProductService.java' },
      { key: 'line', label: '라인', value: '73' },
    ])
  })

  it('prefers stable code attributes when legacy attributes are also present', () => {
    expect(resolveCodeLocation({
      'code.namespace': 'com.example.product.ProductService',
      'code.function.name': 'com.example.product.ProductService.findCurrent',
      'code.function': 'findLegacy',
      'code.file.path': '/workspace/Current.java',
      'code.filepath': '/workspace/Legacy.java',
      'code.line.number': '42',
      'code.lineno': '12',
    })).toEqual({
      className: 'com.example.product.ProductService',
      functionName: 'findCurrent',
      filePath: '/workspace/Current.java',
      lineNumber: '42',
    })
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
