import { describe, expect, it } from 'vitest'
import type { ComponentType, EventStatus, TraceEvent } from '../types/trace'
import { buildWaterfall, getPrimaryFailureEvent } from './waterfall'

function event(
  spanId: string,
  parentSpanId: string | null,
  startMs: number,
  endMs: number,
  component: ComponentType = 'SERVICE',
  status: EventStatus = 'SUCCESS',
): TraceEvent {
  return {
    eventId: spanId,
    traceId: 'trace',
    component,
    eventType: spanId,
    status,
    startedAt: new Date(startMs).toISOString(),
    endedAt: new Date(endMs).toISOString(),
    durationMs: endMs - startMs,
    errorType: status === 'SUCCESS' ? null : 'Failure',
    errorMessage: null,
    metadata: {},
    spanId,
    parentSpanId,
    serviceName: 'test',
    spanKind: 'INTERNAL',
  }
}

describe('buildWaterfall', () => {
  it('derives hierarchy, offsets, and exclusive time using the union of direct children', () => {
    const model = buildWaterfall([
      event('root', null, 0, 100),
      event('left', 'root', 10, 60),
      event('right', 'root', 40, 80),
      event('leaf', 'left', 20, 30),
    ])

    const root = model.spans.find((span) => span.id === 'root')
    const leaf = model.spans.find((span) => span.id === 'leaf')
    expect(root).toMatchObject({ depth: 0, startOffsetMs: 0, durationMs: 100, exclusiveMs: 30 })
    expect(leaf).toMatchObject({ depth: 2, startOffsetMs: 20, exclusiveMs: 10 })
    expect(model.bottlenecks).toHaveLength(3)
  })

  it('orders bottlenecks by exclusive time', () => {
    const model = buildWaterfall([
      event('root', null, 0, 100),
      event('database', 'root', 10, 70, 'POSTGRESQL'),
      event('cache', 'root', 72, 82, 'REDIS'),
    ])

    expect(model.bottlenecks[0].id).toBe('database')
    expect(model.bottlenecks[0].exclusiveMs).toBe(60)
  })
})

describe('getPrimaryFailureEvent', () => {
  it('selects the infrastructure cause when the same failure reaches parent spans', () => {
    const controller = event('controller', null, 0, 100, 'CONTROLLER', 'TIMEOUT')
    const database = event('database', 'controller', 10, 90, 'POSTGRESQL', 'TIMEOUT')

    expect(getPrimaryFailureEvent([controller, database])?.spanId).toBe('database')
  })

  it('prefers the deepest failure before component priority', () => {
    const database = event('database', null, 0, 100, 'POSTGRESQL', 'TIMEOUT')
    const client = event('client', 'database', 10, 90, 'HTTP_CLIENT', 'ERROR')

    expect(getPrimaryFailureEvent([database, client])?.spanId).toBe('client')
  })

  it('treats an evidenced warning as a recovered failure but ignores a normal cache miss', () => {
    const cacheMiss = { ...event('cache-miss', 'service', 0, 2, 'REDIS', 'WARNING'), errorType: null }
    const redisFallback = event('redis-down', 'service', 2, 4, 'REDIS', 'WARNING')

    expect(getPrimaryFailureEvent([cacheMiss])).toBeNull()
    expect(getPrimaryFailureEvent([cacheMiss, redisFallback])?.spanId).toBe('redis-down')
  })
})
