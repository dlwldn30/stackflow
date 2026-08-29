import type {
  ApiMethod,
  ExternalRequestEntry,
  HttpMethod,
  ProjectAnalysisStatus,
} from '../../types/trace'

export type AnalysisTarget = 'sample' | 'external'
export type AnalysisResultState = 'none' | 'current' | 'stale'
export type AsyncState = 'idle' | 'loading' | 'error'
export type ApiScope = 'all' | 'domain'
export type RequestOptionTab = 'query' | 'headers' | 'body'
export type TraceViewTab = 'timeline' | 'graph' | 'events'

export type StateFields<Model> = {
  [Key in keyof Model as Model[Key] extends (...args: never[]) => unknown ? never : Key]: Model[Key]
}

export type ActionFields<Model> = {
  [Key in keyof Model as Model[Key] extends (...args: never[]) => unknown ? Key : never]: Model[Key]
}
export type ScenarioValue = 'normal' | 'redis-down' | 'db-timeout' | 'service-error'

export type ApiDefinition = {
  id: string
  serviceId?: string
  method: ApiMethod
  methodSpecified: boolean
  label: string
  pathTemplate: string
  description: string
  requestType: string
  requiresProductId: boolean
  controller: string
  handler: string
  domainId: string
  domainName: string
  source: 'analyzed' | 'fallback'
  buildPath: (productId: string) => string
}

export type EstimatedFlowStep = {
  id: string
  layer: string
  label: string
  detail: string
  source: string
}

export type ExternalRequestSnapshot = {
  method: HttpMethod
  targetUrl: string
  queryParams: ExternalRequestEntry[]
  headers: ExternalRequestEntry[]
  requestBody: string
}

export type ProjectStatusContent = {
  headerSummary: string
  nextStepTitle: string
  nextStepDetail: string
  emptyDomainMessage: string
  emptyEndpointMessage: string
}

export type DomainDisplayMode = {
  label: string
  detail: string
  tone: 'runtime' | 'integration'
} | null

export type LayerGroup = {
  id: 'entry' | 'business' | 'data' | 'integration' | 'model' | 'support'
  label: string
  description: string
  layerNames: string[]
  classes: string[]
}

export type DomainStructureStep = {
  id: string
  label: string
  value: string
  detail: string
  tone: 'entry' | 'business' | 'data' | 'integration' | 'infrastructure'
}

export type ApiMethodLike = {
  method: ApiMethod
  methodSpecified: boolean
}

export type ProjectStatusCopy = Record<ProjectAnalysisStatus, ProjectStatusContent>
