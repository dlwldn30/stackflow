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
  RESPONSE: 'Response',
}

const POSITIONS: Record<ComponentType, { x: number; y: number }> = {
  CLIENT: { x: 30, y: 140 },
  CONTROLLER: { x: 250, y: 50 },
  SERVICE: { x: 250, y: 230 },
  REDIS: { x: 500, y: 50 },
  REPOSITORY: { x: 500, y: 230 },
  MYSQL: { x: 760, y: 230 },
  RESPONSE: { x: 980, y: 140 },
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

export function buildGraph(trace: TraceDetail | null): {
  nodes: Node[]
  edges: Edge[]
  states: GraphNodeState[]
} {
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
          <span className="flow-node__title">{state.label}</span>
          <span className="flow-node__meta">
            {state.active ? `${state.durationMs}ms` : 'idle'}
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

    return {
      id: edgeId,
      source,
      target,
      animated: active && Boolean(sourceState?.active && targetState?.active),
      className: `flow-edge${active ? ' is-active' : ''}`,
    }
  })

  return { nodes, edges, states }
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
