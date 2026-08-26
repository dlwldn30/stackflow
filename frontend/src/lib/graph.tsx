import { MarkerType, Position } from '@xyflow/react'
import type { Edge, Node } from '@xyflow/react'
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

const BADGES: Record<ComponentType, string> = {
  CLIENT: 'CL',
  CONTROLLER: 'CTL',
  SERVICE: 'SVC',
  REDIS: 'RDS',
  REPOSITORY: 'REP',
  MYSQL: 'SQL',
  POSTGRESQL: 'PG',
  RESPONSE: 'RES',
  GATEWAY: 'GTW',
  HTTP_CLIENT: 'HTTP',
  DATABASE: 'DB',
  INTERNAL: 'INT',
}

const DESCRIPTIONS: Record<ComponentType, string> = {
  CLIENT: '요청 시작',
  CONTROLLER: 'HTTP 진입점',
  SERVICE: 'Business rule',
  REDIS: 'Cache 분기',
  REPOSITORY: 'Data access',
  MYSQL: 'Persistence',
  POSTGRESQL: 'PostgreSQL 호출',
  RESPONSE: '최종 응답',
  GATEWAY: '외부 연동 경계',
  HTTP_CLIENT: '외부 HTTP 호출',
  DATABASE: '데이터베이스 호출',
  INTERNAL: '계측된 메서드',
}

const POSITIONS: Record<ComponentType, { x: number; y: number }> = {
  CLIENT: { x: 10, y: 190 },
  CONTROLLER: { x: 225, y: 72 },
  SERVICE: { x: 225, y: 306 },
  REDIS: { x: 490, y: 72 },
  REPOSITORY: { x: 490, y: 306 },
  MYSQL: { x: 755, y: 306 },
  POSTGRESQL: { x: 755, y: 306 },
  RESPONSE: { x: 1000, y: 190 },
  GATEWAY: { x: 755, y: 72 },
  HTTP_CLIENT: { x: 1000, y: 72 },
  DATABASE: { x: 755, y: 306 },
  INTERNAL: { x: 490, y: 190 },
}

const BASE_EDGES = [
  ['CLIENT', 'CONTROLLER'],
  ['CONTROLLER', 'SERVICE'],
  ['SERVICE', 'REDIS'],
  ['SERVICE', 'REPOSITORY'],
  ['REDIS', 'REPOSITORY'],
  ['REPOSITORY', 'MYSQL'],
  ['MYSQL', 'REDIS'],
  ['REDIS', 'RESPONSE'],
  ['MYSQL', 'RESPONSE'],
  ['SERVICE', 'RESPONSE'],
] as const satisfies readonly (readonly [ComponentType, ComponentType])[]

const STATUS_PRIORITY: EventStatus[] = ['TIMEOUT', 'ERROR', 'WARNING', 'SUCCESS', 'SKIPPED']

function isFailureStatus(status: EventStatus | 'IDLE' | undefined): boolean {
  return status === 'ERROR' || status === 'TIMEOUT'
}

export function buildGraph(trace: TraceDetail | null): {
  nodes: Node[]
  edges: Edge[]
  states: GraphNodeState[]
} {
  if (trace?.source === 'OPENTELEMETRY') {
    return buildSpanGraph(trace.events)
  }

  const orderedEvents = sortEventsByStartTime(trace?.events ?? [])
  const states = COMPONENT_ORDER.map((component) =>
    createNodeState(component, orderedEvents.filter((event) => event.component === component)),
  )

  const statesById = new Map(states.map((state) => [state.id, state]))
  const componentPath = buildComponentPath(orderedEvents)
  const activeEdges = new Set(componentPath.map(([source, target]) => `${source}-${target}`))

  const nodes: Node[] = states.map((state) => ({
    id: state.id,
    position: POSITIONS[state.component],
    data: {
      label: (
        <div className="flow-node__body">
          <div className="flow-node__topline">
            <span className="flow-node__badge">{BADGES[state.component]}</span>
            <span className="flow-node__status-dot" />
          </div>
          <span className="flow-node__kicker">{state.component}</span>
          <span className="flow-node__title">{state.label}</span>
          <span className="flow-node__description">{DESCRIPTIONS[state.component]}</span>
          <span className="flow-node__meta">
            {state.active ? `${state.durationMs}ms · 이벤트 ${state.visits.length}개` : '호출되지 않음'}
          </span>
        </div>
      ),
    },
    className: `flow-node flow-node--${state.status.toLowerCase()}${state.active ? ' is-active' : ''}`,
    draggable: false,
    selectable: true,
  }))

  const edges: Edge[] = BASE_EDGES.map(([source, target]) => {
    const sourceState = statesById.get(source)
    const targetState = statesById.get(target)
    const edgeId = `${source}-${target}`
    const active = activeEdges.has(edgeId)
    const failed = active && (isFailureStatus(sourceState?.status) || isFailureStatus(targetState?.status))

    return {
      id: edgeId,
      source,
      target,
      type: 'smoothstep',
      animated: active && Boolean(sourceState?.active && targetState?.active),
      className: `flow-edge${active ? ' is-active' : ''}${failed ? ' is-failed' : ''}`,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: active ? 18 : 14,
        height: active ? 18 : 14,
        color: failed ? '#c2413c' : active ? '#1f7a55' : '#9aa6b5',
      },
      zIndex: active ? 8 : 1,
      interactionWidth: 24,
    }
  })

  return { nodes, edges, states }
}

function buildSpanGraph(events: TraceEvent[]): {
  nodes: Node[]
  edges: Edge[]
  states: GraphNodeState[]
} {
  const spanEvents = sortEventsByStartTime(events).filter((event) => event.spanId)
  const eventsBySpanId = new Map(spanEvents.map((event) => [event.spanId as string, event]))
  const positions = buildSpanTreePositions(spanEvents, eventsBySpanId)
  const states = spanEvents.map((event) => ({
    id: event.spanId as string,
    component: event.component,
    label: event.eventType,
    status: event.status,
    durationMs: event.durationMs,
    active: true,
    visits: [event],
  } satisfies GraphNodeState))

  const nodes: Node[] = states.map((state) => {
    const event = state.visits[0]
    return {
      id: state.id,
      position: positions.get(state.id) ?? { x: 0, y: 0 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        label: (
          <div className="flow-node__body">
            <div className="flow-node__topline">
              <span className="flow-node__badge">{BADGES[state.component]}</span>
              <span className="flow-node__status-dot" />
            </div>
            <span className="flow-node__kicker">{event.spanKind ?? state.component}</span>
            <span className="flow-node__title">{state.label}</span>
            <span className="flow-node__description">{event.serviceName ?? DESCRIPTIONS[state.component]}</span>
            <span className="flow-node__meta">{state.durationMs}ms</span>
          </div>
        ),
      },
      className: `flow-node flow-node--${state.status.toLowerCase()} is-active`,
      draggable: false,
      selectable: true,
    }
  })

  const edges: Edge[] = spanEvents.flatMap((event) => {
    if (!event.spanId || !event.parentSpanId || !eventsBySpanId.has(event.parentSpanId)) {
      return []
    }
    const failed = isFailureStatus(event.status)
    return [{
      id: `${event.parentSpanId}-${event.spanId}`,
      source: event.parentSpanId,
      target: event.spanId,
      type: 'smoothstep',
      animated: false,
      className: `flow-edge is-active${failed ? ' is-failed' : ''}`,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: failed ? '#c2413c' : '#1f7a55',
      },
      zIndex: 0,
      interactionWidth: 16,
    }]
  })

  return { nodes, edges, states }
}

function buildSpanTreePositions(
  events: TraceEvent[],
  eventsBySpanId: Map<string, TraceEvent>,
): Map<string, { x: number; y: number }> {
  const horizontalGap = 280
  const verticalGap = 170
  const childrenByParent = new Map<string, string[]>()

  for (const event of events) {
    if (!event.spanId || !event.parentSpanId || !eventsBySpanId.has(event.parentSpanId)) continue
    const children = childrenByParent.get(event.parentSpanId) ?? []
    children.push(event.spanId)
    childrenByParent.set(event.parentSpanId, children)
  }

  const roots = events
    .filter((event) => event.spanId && (!event.parentSpanId || !eventsBySpanId.has(event.parentSpanId)))
    .map((event) => event.spanId as string)
  const positions = new Map<string, { x: number; y: number }>()
  const positioned = new Set<string>()
  let nextLeafRow = 0

  const placeSpan = (spanId: string, depth: number, ancestors: Set<string>): number => {
    const existing = positions.get(spanId)
    if (existing) return existing.y

    if (ancestors.has(spanId)) {
      const y = nextLeafRow * verticalGap
      nextLeafRow += 1
      positions.set(spanId, { x: depth * horizontalGap, y })
      positioned.add(spanId)
      return y
    }

    const children = (childrenByParent.get(spanId) ?? []).filter((childId) => !positioned.has(childId))
    const nextAncestors = new Set(ancestors).add(spanId)
    const childRows = children.map((childId) => placeSpan(childId, depth + 1, nextAncestors))
    const y = childRows.length > 0
      ? childRows.reduce((sum, childY) => sum + childY, 0) / childRows.length
      : nextLeafRow++ * verticalGap

    positions.set(spanId, { x: depth * horizontalGap, y })
    positioned.add(spanId)
    return y
  }

  roots.forEach((spanId) => placeSpan(spanId, 0, new Set()))
  events.forEach((event) => {
    if (event.spanId && !positioned.has(event.spanId)) placeSpan(event.spanId, 0, new Set())
  })

  return positions
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

function buildComponentPath(events: TraceEvent[]): Array<[ComponentType, ComponentType]> {
  const path: Array<[ComponentType, ComponentType]> = []
  for (let index = 0; index < events.length - 1; index += 1) {
    const current = events[index]
    const next = events[index + 1]
    if (current.component !== next.component) {
      path.push([current.component, next.component])
    }
  }
  return path
}

function sortEventsByStartTime(events: TraceEvent[]) {
  return events
    .slice()
    .sort((left, right) => new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime())
}
