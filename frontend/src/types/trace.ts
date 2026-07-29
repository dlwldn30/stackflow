export type EventStatus = 'SUCCESS' | 'WARNING' | 'ERROR' | 'TIMEOUT' | 'SKIPPED'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

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

export interface TraceSessionResponse {
  traceId: string
}

export interface ExternalRequestResponse {
  method: string
  targetUrl: string
  httpStatus: number
  durationMs: number
  resultStatus: 'SUCCESS' | 'ERROR'
  contentType: string
  responseBody: string
  errorMessage: string | null
}

export interface TraceStartedEvent {
  traceId: string
  method: string
  endpoint: string
  scenario: string
  timestamp: string
}

export interface TraceTerminalEvent {
  traceId: string
  resultStatus: EventStatus
  httpStatus: number
  durationMs: number
  errorType: string | null
  errorMessage: string | null
  timestamp: string
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

export interface ApiCatalogItem {
  id: string
  method: HttpMethod
  path: string
  controller: string
  handler: string
  requestType: string
  requiresPathVariable: boolean
  pathVariables: string[]
}

export interface ProjectController {
  name: string
  packageName: string
  basePath: string
  endpointCount: number
}

export interface ProjectLayer {
  name: string
  type: string
  classes: string[]
}

export interface ProjectDomain {
  id: string
  name: string
  description: string
  responsibilities: string[]
  infrastructure: string[]
  controllers: ProjectController[]
  layers: ProjectLayer[]
  endpoints: ApiCatalogItem[]
}

export interface ProjectStructure {
  projectName: string
  framework: string
  infrastructure: string[]
  layers: ProjectLayer[]
  domains: ProjectDomain[]
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
