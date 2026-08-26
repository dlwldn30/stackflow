import type { ComponentType, EventStatus, GraphNodeState, TraceDetail, TraceEvent } from '../types/trace'

const COMPONENT_ORDER: ComponentType[] = [
  'CLIENT',
  'CONTROLLER',
  'SERVICE',
  'REDIS',
  'REPOSITORY',
  'MYSQL',
  'RESPONSE',
]

const LABELS: Record<ComponentType, string> = {
  CLIENT: 'Client',
  CONTROLLER: 'Controller',
  SERVICE: 'Service',
  REDIS: 'Redis',
  REPOSITORY: 'Repository',
  MYSQL: 'MySQL',
  POSTGRESQL: 'PostgreSQL',
  RESPONSE: 'Response',
  GATEWAY: 'Gateway',
  HTTP_CLIENT: 'HTTP Client',
  DATABASE: 'Database',
  INTERNAL: 'Internal',
}

const STATUS_PRIORITY: EventStatus[] = ['TIMEOUT', 'ERROR', 'WARNING', 'SUCCESS', 'SKIPPED']

export function buildGraph(trace: TraceDetail | null): {
  states: GraphNodeState[]
} {
  if (trace?.source === 'OPENTELEMETRY') {
    return { states: buildSpanStates(trace.events) }
  }

  const orderedEvents = sortEventsByStartTime(trace?.events ?? [])
  const states = COMPONENT_ORDER.map((component) =>
    createNodeState(component, orderedEvents.filter((event) => event.component === component)),
  )

  return { states }
}

function buildSpanStates(events: TraceEvent[]): GraphNodeState[] {
  const spanEvents = sortEventsByStartTime(events).filter((event) => event.spanId)
  return spanEvents.map((event) => ({
    id: event.spanId as string,
    component: event.component,
    label: event.eventType,
    status: event.status,
    durationMs: event.durationMs,
    active: true,
    visits: [event],
  } satisfies GraphNodeState))
}

export function getNodeDetail(states: GraphNodeState[], nodeId: string | null): GraphNodeState | null {
  if (!nodeId) {
    return null
  }

  return states.find((state) => state.id === nodeId) ?? null
}

function createNodeState(component: ComponentType, events: TraceEvent[]): GraphNodeState {
  if (events.length === 0) {
    return {
      id: component,
      component,
      label: LABELS[component],
      status: 'IDLE',
      durationMs: 0,
      active: false,
      visits: [],
    }
  }

  const status = STATUS_PRIORITY.find((candidate) =>
    events.some((event) => event.status === candidate),
  ) ?? 'SUCCESS'

  return {
    id: component,
    component,
    label: LABELS[component],
    status,
    durationMs: events.reduce((sum, event) => sum + event.durationMs, 0),
    active: true,
    visits: events,
  }
}

function sortEventsByStartTime(events: TraceEvent[]) {
  return events
    .slice()
    .sort((left, right) => new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime())
}
