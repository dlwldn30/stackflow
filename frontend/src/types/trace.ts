export type EventStatus = 'SUCCESS' | 'WARNING' | 'ERROR' | 'TIMEOUT' | 'SKIPPED'

export type ComponentType =
  | 'CLIENT'
  | 'CONTROLLER'
  | 'SERVICE'
  | 'REDIS'
  | 'REPOSITORY'
  | 'MYSQL'
  | 'RESPONSE'

export interface TraceEvent {
  eventId: string
  traceId: string
  component: ComponentType
  eventType: string
  status: EventStatus
  startedAt: string
  endedAt: string
  durationMs: number
  errorType: string | null
  errorMessage: string | null
  metadata: Record<string, string>
}

export interface TraceDetail {
  traceId: string
  method: string
  endpoint: string
  scenario: string
  startedAt: string
  endedAt: string
  durationMs: number
  httpStatus: number
  resultStatus: EventStatus
  events: TraceEvent[]
}

export interface TraceSummary {
  traceId: string
  endpoint: string
  scenario: string
  resultStatus: EventStatus
  httpStatus: number
  durationMs: number
  startedAt: string
}

export interface ProductPayload {
  traceId: string
  scenario: string
  resultStatus: EventStatus
  cacheStatus?: string
  errorType?: string
  errorMessage?: string
  product?: {
    id: number
    name: string
    category: string
    price: number
    summary: string
  }
}

export interface GraphNodeState {
  id: string
  component: ComponentType
  label: string
  status: EventStatus | 'IDLE'
  durationMs: number
  active: boolean
  visits: TraceEvent[]
}
