export type EventStatus = 'SUCCESS' | 'WARNING' | 'ERROR' | 'TIMEOUT' | 'SKIPPED'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
export type ApiMethod = HttpMethod | 'UNSPECIFIED'
export type TraceSource = 'SAMPLE' | 'OPENTELEMETRY'
export type TraceCollectionStatus = 'DISABLED' | 'PENDING' | 'COLLECTING' | 'COMPLETED' | 'TIMED_OUT'

export type ComponentType =
  | 'CLIENT'
  | 'CONTROLLER'
  | 'SERVICE'
  | 'REDIS'
  | 'REPOSITORY'
  | 'MYSQL'
  | 'POSTGRESQL'
  | 'RESPONSE'
  | 'GATEWAY'
  | 'HTTP_CLIENT'
  | 'DATABASE'
  | 'INTERNAL'

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
  spanId: string | null
  parentSpanId: string | null
  serviceName: string | null
  spanKind: string | null
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
  source: TraceSource
  serviceName: string | null
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

export interface ExternalRequestEntry {
  id: string
  key: string
  value: string
  enabled: boolean
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
  traceId: string | null
  traceCollectionStatus: TraceCollectionStatus
}

export interface TraceCollectionStatusEvent {
  traceId: string
  status: TraceCollectionStatus
  message: string
  timestamp: string
}

export interface InstrumentationProfile {
  projectName: string
  serviceName: string
  buildTool: string
  collectorEndpoint: string
  agentPath: string
  instrumentedClasses: string[]
  instrumentedMethodCount: number
  methodsInclude: string
  environment: Record<string, string>
  commands: Record<string, string>
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
  method: ApiMethod
  methodSpecified: boolean
  path: string
  controller: string
  handler: string
  requestType: string
  requiresPathVariable: boolean
  pathVariables: string[]
  sourceFile: string
  sourceLine: number
}

export type ProjectAnalysisStatus = 'SUCCESS' | 'EMPTY' | 'FAILED'

export interface ProjectEvidenceItem {
  name: string
  detectedBy: string
  evidence: string
}

export interface ProjectController {
  name: string
  packageName: string
  basePath: string
  endpointCount: number
  sourceFile: string
}

export interface ProjectLayer {
  name: string
  type: string
  classes: string[]
  evidence: string
}

export interface ProjectDomain {
  id: string
  name: string
  description: string
  responsibilities: string[]
  infrastructure: string[]
  infrastructureDetails: ProjectEvidenceItem[]
  controllers: ProjectController[]
  layers: ProjectLayer[]
  endpoints: ApiCatalogItem[]
  packageRoots: string[]
}

export interface AnalysisCoverage {
  sourceRoots: string[]
  scannedJavaFiles: number
  controllerCandidates: number
  detectedControllers: number
  detectedEndpoints: number
  warnings: string[]
}

export interface ProjectStructure {
  projectName: string
  framework: string
  frameworkEvidence: string
  analysisStatus: ProjectAnalysisStatus
  sourceRoot: string
  analysisMessage: string
  analysisCoverage: AnalysisCoverage
  infrastructure: string[]
  infrastructureDetails: ProjectEvidenceItem[]
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
