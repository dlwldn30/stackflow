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

  it('marks sample edges touching a failed step as failed', () => {
    const graph = buildGraph(trace('SAMPLE', [
      event({ eventId: 'client', component: 'CLIENT' }),
      event({ eventId: 'controller', component: 'CONTROLLER' }),
      event({ eventId: 'service', component: 'SERVICE', status: 'ERROR' }),
      event({ eventId: 'repository', component: 'REPOSITORY' }),
    ]))

    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'CONTROLLER-SERVICE',
        className: 'flow-edge is-active is-failed',
        markerEnd: expect.objectContaining({ color: '#c2413c' }),
      }),
      expect.objectContaining({
        id: 'SERVICE-REPOSITORY',
        className: 'flow-edge is-active is-failed',
        markerEnd: expect.objectContaining({ color: '#c2413c' }),
      }),
    ]))
  })

  it('builds OpenTelemetry edges from parent span ids', () => {
    const graph = buildGraph(trace('OPENTELEMETRY', [
      event({ eventId: 'root', spanId: 'root-span', spanKind: 'SERVER' }),
      event({ eventId: 'child', spanId: 'child-span', parentSpanId: 'root-span', component: 'POSTGRESQL' }),
    ]))

    expect(graph.nodes.map((node) => node.id)).toEqual(['root-span', 'child-span'])
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'root-span', target: 'child-span' }),
    ]))
  })

  it('marks an OpenTelemetry edge into a failed child span as failed', () => {
    const graph = buildGraph(trace('OPENTELEMETRY', [
      event({ eventId: 'root', spanId: 'root-span', spanKind: 'SERVER' }),
      event({
        eventId: 'child',
        spanId: 'child-span',
        parentSpanId: 'root-span',
        component: 'POSTGRESQL',
        status: 'TIMEOUT',
      }),
    ]))

    expect(graph.edges[0]).toMatchObject({
      className: 'flow-edge is-active is-failed',
      markerEnd: { color: '#c2413c' },
    })
  })
})
