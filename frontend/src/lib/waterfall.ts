import type { TraceEvent } from '../types/trace'

const FAILURE_COMPONENT_PRIORITY: TraceEvent['component'][] = [
  'MYSQL',
  'POSTGRESQL',
  'DATABASE',
  'REDIS',
  'HTTP_CLIENT',
  'GATEWAY',
  'REPOSITORY',
  'SERVICE',
  'CONTROLLER',
  'INTERNAL',
  'RESPONSE',
  'CLIENT',
]

export interface WaterfallSpan {
  id: string
  event: TraceEvent
  depth: number
  startOffsetMs: number
  durationMs: number
  exclusiveMs: number
  leftPercent: number
  widthPercent: number
  bottleneckRank: number | null
  serviceName: string
  parentServiceName: string | null
  crossesServiceBoundary: boolean
}

export interface WaterfallModel {
  durationMs: number
  spans: WaterfallSpan[]
  bottlenecks: WaterfallSpan[]
}

export function buildWaterfall(events: TraceEvent[]): WaterfallModel {
  if (events.length === 0) {
    return { durationMs: 0, spans: [], bottlenecks: [] }
  }

  const ordered = [...events].sort((left, right) =>
    toMillis(left.startedAt) - toMillis(right.startedAt)
      || toMillis(right.endedAt) - toMillis(left.endedAt),
  )
  const traceStart = Math.min(...ordered.map((event) => toMillis(event.startedAt)))
  const traceEnd = Math.max(...ordered.map((event) => toMillis(event.endedAt)))
  const durationMs = Math.max(1, traceEnd - traceStart, ...ordered.map((event) => event.durationMs))
  const eventsBySpanId = new Map(
    ordered.filter((event) => event.spanId).map((event) => [event.spanId as string, event]),
  )
  const depthCache = new Map<string, number>()

  const resolveDepth = (event: TraceEvent, visited = new Set<string>()): number => {
    if (!event.spanId) return 0
    const cached = depthCache.get(event.spanId)
    if (cached !== undefined) return cached
    if (!event.parentSpanId || visited.has(event.spanId)) return 0
    const parent = eventsBySpanId.get(event.parentSpanId)
    const depth = parent ? resolveDepth(parent, new Set(visited).add(event.spanId)) + 1 : 0
    depthCache.set(event.spanId, depth)
    return depth
  }

  const baseSpans = ordered.map((event) => {
    const start = toMillis(event.startedAt)
    const end = Math.max(start, toMillis(event.endedAt))
    const childIntervals = ordered
      .filter((candidate) => event.spanId && candidate.parentSpanId === event.spanId)
      .map((child) => [
        Math.max(start, toMillis(child.startedAt)),
        Math.min(end, toMillis(child.endedAt)),
      ] as const)
      .filter(([childStart, childEnd]) => childEnd > childStart)
    const measuredDuration = Math.max(0, end - start)
    const duration = Math.max(measuredDuration, event.durationMs)

    return {
      id: event.spanId ?? event.eventId,
      event,
      depth: resolveDepth(event),
      startOffsetMs: Math.max(0, start - traceStart),
      durationMs: duration,
      exclusiveMs: Math.max(0, duration - unionDuration(childIntervals)),
      leftPercent: Math.max(0, ((start - traceStart) / durationMs) * 100),
      widthPercent: Math.min(100 - Math.max(0, ((start - traceStart) / durationMs) * 100), Math.max(0.8, (duration / durationMs) * 100)),
      bottleneckRank: null,
      serviceName: event.serviceName ?? 'unknown-service',
      parentServiceName: event.parentSpanId ? eventsBySpanId.get(event.parentSpanId)?.serviceName ?? null : null,
      crossesServiceBoundary: Boolean(
        event.serviceName
          && event.parentSpanId
          && eventsBySpanId.get(event.parentSpanId)?.serviceName
          && eventsBySpanId.get(event.parentSpanId)?.serviceName !== event.serviceName,
      ),
    } satisfies WaterfallSpan
  })

  const rankedIds = [...baseSpans]
    .sort((left, right) => right.exclusiveMs - left.exclusiveMs || right.durationMs - left.durationMs)
    .slice(0, 3)
    .map((span) => span.id)
  const rankById = new Map(rankedIds.map((id, index) => [id, index + 1]))
  const spans = baseSpans.map((span) => ({ ...span, bottleneckRank: rankById.get(span.id) ?? null }))

  return {
    durationMs,
    spans,
    bottlenecks: spans.filter((span) => span.bottleneckRank !== null).sort((left, right) =>
      (left.bottleneckRank ?? 0) - (right.bottleneckRank ?? 0),
    ),
  }
}

export function getPrimaryFailureEvent(traceEvents: TraceEvent[]): TraceEvent | null {
  const failedEvents = traceEvents.filter((event) =>
    event.status === 'ERROR'
      || event.status === 'TIMEOUT'
      || (event.status === 'WARNING' && Boolean(event.errorType || event.errorMessage)),
  )
  if (failedEvents.length === 0) return null

  const nonResponseEvents = failedEvents.filter((event) => event.component !== 'RESPONSE')
  const candidates = nonResponseEvents.length > 0 ? nonResponseEvents : failedEvents
  const eventsBySpanId = new Map(
    traceEvents.filter((event) => event.spanId).map((event) => [event.spanId as string, event]),
  )

  return [...candidates].sort((left, right) => {
    const depthDifference = getSpanDepth(right, eventsBySpanId) - getSpanDepth(left, eventsBySpanId)
    if (depthDifference !== 0) return depthDifference

    const componentDifference = FAILURE_COMPONENT_PRIORITY.indexOf(left.component)
      - FAILURE_COMPONENT_PRIORITY.indexOf(right.component)
    if (componentDifference !== 0) return componentDifference

    const evidenceDifference = Number(Boolean(right.errorType || right.errorMessage))
      - Number(Boolean(left.errorType || left.errorMessage))
    if (evidenceDifference !== 0) return evidenceDifference

    return toMillis(left.startedAt) - toMillis(right.startedAt)
  })[0]
}

function getSpanDepth(event: TraceEvent, eventsBySpanId: Map<string, TraceEvent>): number {
  let depth = 0
  let parentSpanId = event.parentSpanId
  const visited = new Set<string>()

  while (parentSpanId && !visited.has(parentSpanId)) {
    visited.add(parentSpanId)
    const parent = eventsBySpanId.get(parentSpanId)
    if (!parent) break
    depth += 1
    parentSpanId = parent.parentSpanId
  }

  return depth
}

function unionDuration(intervals: readonly (readonly [number, number])[]): number {
  if (intervals.length === 0) return 0
  const ordered = [...intervals].sort((left, right) => left[0] - right[0])
  let total = 0
  let [currentStart, currentEnd] = ordered[0]
  for (const [start, end] of ordered.slice(1)) {
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end)
    } else {
      total += currentEnd - currentStart
      currentStart = start
      currentEnd = end
    }
  }
  return total + currentEnd - currentStart
}

function toMillis(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}
