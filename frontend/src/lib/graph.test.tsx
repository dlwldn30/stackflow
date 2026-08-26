import { describe, expect, it } from 'vitest'
import { buildGraph, getNodeDetail } from './graph'
import type { TraceDetail, TraceEvent } from '../types/trace'

function event(overrides: Partial<TraceEvent>): TraceEvent {
  return {
    eventId: 'event-1',
    traceId: 'trace-1',
    component: 'CONTROLLER',
    eventType: 'ProductController.getProduct',
    status: 'SUCCESS',
    startedAt: '2026-08-23T00:00:00.000Z',
    endedAt: '2026-08-23T00:00:00.010Z',
    durationMs: 10,
    errorType: null,
    errorMessage: null,
    metadata: {},
    spanId: null,
    parentSpanId: null,
    serviceName: 'sample',
    spanKind: 'INTERNAL',
    stackTrace: null,
    stackTraceTruncated: false,
    ...overrides,
  }
}

function trace(source: TraceDetail['source'], events: TraceEvent[]): TraceDetail {
  return {
    traceId: 'trace-1',
    method: 'GET',
    endpoint: '/api/products/1001',
    scenario: 'test',
    startedAt: '2026-08-23T00:00:00.000Z',
    endedAt: '2026-08-23T00:00:00.020Z',
    durationMs: 20,
    httpStatus: 200,
    resultStatus: 'SUCCESS',
    events,
    source,
    serviceName: 'sample',
    traceCollectionStatus: source === 'OPENTELEMETRY' ? 'COMPLETED' : 'DISABLED',
    responsePreview: null,
  }
}

describe('buildGraph', () => {
  it('promotes timeout over success for the same sample component', () => {
    const graph = buildGraph(trace('SAMPLE', [
      event({ eventId: 'success', component: 'MYSQL' }),
      event({ eventId: 'timeout', component: 'MYSQL', status: 'TIMEOUT' }),
    ]))

    const mysql = getNodeDetail(graph.states, 'MYSQL')
    expect(mysql).toMatchObject({
      active: true,
      status: 'TIMEOUT',
    })
    expect(mysql?.visits).toHaveLength(2)
  })

  it('builds selectable OpenTelemetry span states', () => {
    const graph = buildGraph(trace('OPENTELEMETRY', [
      event({ eventId: 'root', spanId: 'root-span', spanKind: 'SERVER' }),
      event({ eventId: 'child', spanId: 'child-span', parentSpanId: 'root-span', component: 'POSTGRESQL' }),
    ]))

    expect(graph.states.map((node) => node.id)).toEqual(['root-span', 'child-span'])
    expect(getNodeDetail(graph.states, 'child-span')).toMatchObject({
      component: 'POSTGRESQL',
      active: true,
    })
  })
})
