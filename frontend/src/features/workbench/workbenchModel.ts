import { getTrace } from '../../api/stackflow'
import type { ApiCatalogItem, HttpMethod, ProjectController, ProjectDomain, ProjectLayer, ProjectStructure, TraceDetail, TraceEvent } from '../../types/trace'
import type { ApiDefinition, ApiMethodLike, DomainDisplayMode, DomainStructureStep, EstimatedFlowStep, LayerGroup } from './types'

export function flattenProjectApis(structure: ProjectStructure): ApiDefinition[] {
  return structure.domains.flatMap((domain) =>
    domain.endpoints.map((endpoint) => toApiDefinition(endpoint, domain.id, domain.name)),
  )
}

export function toApiDefinition(item: ApiCatalogItem, domainId: string, domainName: string): ApiDefinition {
  return {
    id: item.id,
    method: item.method,
    methodSpecified: item.methodSpecified,
    label: humanizeHandler(item.handler),
    pathTemplate: item.path,
    description: `${item.controller}.${item.handler}에서 감지했습니다.`,
    requestType: item.requestType,
    requiresProductId: item.requiresPathVariable,
    controller: item.controller,
    handler: item.handler,
    domainId,
    domainName,
    source: 'analyzed',
    buildPath: (productId) => buildPathFromTemplate(item.path, productId),
  }
}

export function buildProjectMetrics(structure: ProjectStructure) {
  const controllerCount = structure.domains.reduce((sum, domain) => sum + domain.controllers.length, 0)
  const endpointCount = structure.domains.reduce((sum, domain) => sum + domain.endpoints.length, 0)
  const infrastructureCount = new Set(structure.domains.flatMap((domain) => domain.infrastructure)).size

  return [
    { id: 'domains', label: '도메인', value: `${structure.domains.length}`, detail: '업무 영역' },
    { id: 'apis', label: 'API', value: `${endpointCount}`, detail: 'REST endpoint' },
    { id: 'controllers', label: 'Controller', value: `${controllerCount}`, detail: '요청 진입점' },
    { id: 'infrastructure', label: '인프라', value: `${infrastructureCount}`, detail: 'DB · Cache · Client' },
  ]
}

export function getControllerBasePathSummary(controllers: ProjectController[]) {
  const paths = [...new Set(controllers.flatMap((controller) =>
    controller.basePaths?.length ? controller.basePaths : [controller.basePath || '/'],
  ))]
  if (paths.length === 0) return { label: '-', fullLabel: '-' }
  return {
    label: paths.length === 1 ? paths[0] : `${paths[0]} 외 ${paths.length - 1}개`,
    fullLabel: paths.join(' · '),
  }
}

export function buildDomainStructurePath(groups: LayerGroup[], infrastructure: string[]): DomainStructureStep[] {
  const flowGroups = groups.filter((group) =>
    ['entry', 'business', 'data', 'integration'].includes(group.id) && group.classes.length > 0,
  )
  const steps: DomainStructureStep[] = flowGroups.map((group) => ({
    id: group.id,
    label: group.label,
    value: summarizeClassNames(group.classes),
    detail: `${group.classes.length}개 클래스 · ${group.description}`,
    tone: group.id as DomainStructureStep['tone'],
  }))

  if (infrastructure.length > 0) {
    steps.push({
      id: 'infrastructure',
      label: '인프라',
      value: infrastructure.join(' · '),
      detail: `${infrastructure.length}개 실행 경계`,
      tone: 'infrastructure',
    })
  }

  return steps
}

export function summarizeClassNames(classes: string[]) {
  if (classes.length <= 2) return classes.join(' · ')
  return `${classes.slice(0, 2).join(' · ')} 외 ${classes.length - 2}개`
}

export function buildCommonProjectLayers(structure: ProjectStructure): ProjectLayer[] {
  const domainClasses = new Set(
    structure.domains.flatMap((domain) => domain.layers.flatMap((layer) => layer.classes)),
  )

  return structure.layers
    .map((layer) => ({
      ...layer,
      classes: layer.classes.filter((className) => !domainClasses.has(className)),
    }))
    .filter((layer) => layer.classes.length > 0)
}

export function groupProjectLayers(layers: ProjectLayer[]): LayerGroup[] {
  const definitions: Array<Omit<LayerGroup, 'layerNames' | 'classes'>> = [
    { id: 'entry', label: '진입점', description: 'Controller' },
    { id: 'business', label: '비즈니스', description: 'UseCase · Service' },
    { id: 'data', label: '데이터', description: 'Repository · Store · Cache' },
    { id: 'integration', label: '외부 연동', description: 'Gateway · Client' },
    { id: 'model', label: '모델·응답', description: 'Domain · DTO' },
    { id: 'support', label: '공통 지원', description: 'Application · Error Handling' },
  ]

  return definitions.map((definition) => {
    const matchingLayers = layers.filter((layer) => getLayerGroupId(layer.name) === definition.id)
    return {
      ...definition,
      layerNames: matchingLayers.map((layer) => layer.name),
      classes: [...new Set(matchingLayers.flatMap((layer) => layer.classes))].sort(),
    }
  })
}

export function getLayerGroupId(layerName: string): LayerGroup['id'] {
  if (layerName === 'Controller') return 'entry'
  if (layerName === 'UseCase' || layerName === 'Service') return 'business'
  if (layerName === 'Repository' || layerName === 'Store' || layerName === 'Cache') return 'data'
  if (layerName === 'Gateway' || layerName === 'Client') return 'integration'
  if (layerName === 'Domain' || layerName === 'DTO') return 'model'
  return 'support'
}

export function getDomainDisplayMode(domain: ProjectDomain, isSampleProject = true): DomainDisplayMode {
  const runtimeReadySample = isSampleProject && domain.endpoints.some((endpoint) =>
    isStackFlowRuntimeApi({
      id: endpoint.id,
      method: endpoint.method,
      methodSpecified: endpoint.methodSpecified,
      label: endpoint.handler,
      pathTemplate: endpoint.path,
      description: '',
      requestType: endpoint.requestType,
      requiresProductId: endpoint.requiresPathVariable,
      controller: endpoint.controller,
      handler: endpoint.handler,
      domainId: domain.id,
      domainName: domain.name,
      source: 'analyzed',
      buildPath: (productId) => buildPathFromTemplate(endpoint.path, productId),
    }),
  )

  if (runtimeReadySample) {
    return {
      label: '요청·Trace 가능',
      detail: '이 샘플 도메인은 실제 API 요청과 Runtime Trace를 지원합니다.',
      tone: 'runtime',
    }
  }

  const domainKey = domain.name.replaceAll(/\s+/g, '').toLowerCase()
  const hasIntegrationBoundary = domain.layers.some((layer) =>
    (layer.name === 'Gateway' || layer.name === 'Client')
    && layer.classes.some((className) => className.toLowerCase().includes(domainKey)),
  )
  if (hasIntegrationBoundary) {
    return {
      label: '외부 연동 구조',
      detail: '정적 분석에서 감지한 Gateway와 Client 경계를 표시합니다.',
      tone: 'integration',
    }
  }

  return null
}

export function getDomainDescription(domain: ProjectDomain, isSampleProject = true) {
  const displayMode = getDomainDisplayMode(domain, isSampleProject)
  if (displayMode?.tone === 'runtime') {
    return `${domain.name} API의 실제 요청 경로와 cache·data 흐름을 확인합니다.`
  }
  if (displayMode?.tone === 'integration') {
    return `${domain.name} API와 Gateway·Client 외부 연동 경계를 확인합니다.`
  }
  return `${domain.name} 도메인에서 감지한 API와 layer 구조를 확인합니다.`
}

export function buildEstimatedFlow(api: ApiDefinition, domain: ProjectDomain): EstimatedFlowStep[] {
  const layerNames = new Set(domain.layers.map((layer) => layer.name))
  const flow: EstimatedFlowStep[] = [
    {
      id: 'client',
      layer: 'Client',
      label: 'Client',
      detail: 'Spring이 처리하기 전의 요청 시작 지점입니다.',
      source: '고정 실행 경계',
    },
    {
      id: 'controller',
      layer: 'Controller',
      label: api.controller,
      detail: `${api.handler}가 ${getApiMethodLabel(api)} ${api.pathTemplate} 요청을 받습니다.`,
      source: '감지된 handler',
    },
  ]

  const serviceLikeLayer = layerNames.has('Service')
    ? 'Service'
    : layerNames.has('UseCase')
      ? 'UseCase'
      : null

  if (serviceLikeLayer) {
    const serviceClass = pickLayerClass(domain, serviceLikeLayer, api)
    flow.push({
      id: serviceLikeLayer.toLowerCase(),
      layer: serviceLikeLayer,
      label: serviceClass ?? serviceLikeLayer,
      detail: serviceLikeLayer === 'UseCase'
        ? '요청 단위 business flow를 조율하는 지점으로 예상합니다.'
        : 'business rule을 조율하는 지점으로 예상합니다.',
      source: serviceClass ? '감지된 class' : '예상 layer',
    })
  }

  if (api.requestType === 'QUERY_DETAIL' && domain.infrastructure.includes('Redis')) {
    const cacheClass = pickLayerClass(domain, 'Cache', api)
    flow.push({
      id: 'cache-read',
      layer: 'Cache',
      label: cacheClass ?? 'Redis',
      detail: '상세 조회 요청에서 cache 확인이 예상됩니다.',
      source: cacheClass ? '감지된 cache class' : '추론한 infrastructure',
    })
  }

  if (layerNames.has('Repository') || layerNames.has('Store')) {
    const layer = layerNames.has('Repository') ? 'Repository' : 'Store'
    const dataClass = pickLayerClass(domain, layer, api)
    flow.push({
      id: 'data-access',
      layer,
      label: dataClass ?? layer,
      detail: 'layer 이름을 기준으로 data access 경계를 예상합니다.',
      source: dataClass ? '감지된 class' : '예상 layer',
    })
  }

  if (layerNames.has('Gateway') || layerNames.has('Client')) {
    const layer = layerNames.has('Gateway') ? 'Gateway' : 'Client'
    const integrationClass = pickLayerClass(domain, layer, api)
    flow.push({
      id: layer.toLowerCase(),
      layer,
      label: integrationClass ?? layer,
      detail: 'class 이름을 기준으로 외부 연동 경계를 예상합니다.',
      source: integrationClass ? '감지된 class' : '예상 layer',
    })
  }

  const databaseInfrastructure = domain.infrastructure.includes('PostgreSQL')
    ? 'PostgreSQL'
    : domain.infrastructure.includes('MySQL')
      ? 'MySQL'
      : null
  if (databaseInfrastructure) {
    flow.push({
      id: databaseInfrastructure.toLowerCase(),
      layer: 'Database',
      label: databaseInfrastructure,
      detail: 'Repository 또는 Store class에서 persistence 의존성을 추론했습니다.',
      source: '추론한 infrastructure',
    })
  }

  if (api.requestType === 'CACHE_WRITE' && domain.infrastructure.includes('Redis')) {
    const cacheClass = pickLayerClass(domain, 'Cache', api)
    flow.push({
      id: 'cache-write',
      layer: 'Cache write',
      label: cacheClass ? `${cacheClass}.save` : 'Redis Save',
      detail: 'data 갱신 이후 cache 저장이 예상됩니다.',
      source: cacheClass ? '감지된 cache class' : '추론한 infrastructure',
    })
  }

  flow.push({
    id: 'response',
    layer: 'Response',
    label: 'HTTP Response',
    detail: '최종 HTTP 응답이 application을 벗어납니다.',
    source: '고정 실행 경계',
  })
  return flow
}

export function compareEstimatedAndActualFlow(estimatedFlow: EstimatedFlowStep[], events: TraceEvent[]) {
  const expectedSteps = estimatedFlow.filter((step) => step.layer !== 'Client' && step.layer !== 'Response')
  const expected = expectedSteps.map((step) => ({
    id: step.id,
    label: step.label,
    matched: events.some((event) => matchesEstimatedStep(step, event)),
  }))
  const actual = events.map((event) => ({
    id: event.spanId ?? event.eventId,
    label: event.eventType,
    expected: expectedSteps.some((step) => matchesEstimatedStep(step, event)),
  }))

  return { expected, actual }
}

export function matchesEstimatedStep(step: EstimatedFlowStep, event: TraceEvent) {
  const componentMatches: Record<string, TraceEvent['component'][]> = {
    Controller: ['CONTROLLER'],
    Service: ['SERVICE', 'INTERNAL'],
    UseCase: ['SERVICE', 'INTERNAL'],
    Repository: ['REPOSITORY', 'DATABASE'],
    Store: ['REPOSITORY', 'DATABASE'],
    Cache: ['REDIS'],
    'Cache write': ['REDIS'],
    Database: ['DATABASE', 'MYSQL', 'POSTGRESQL'],
    Gateway: ['GATEWAY', 'HTTP_CLIENT'],
  }
  const normalizedLabel = step.label.toLowerCase()
  const eventEvidence = [event.eventType, event.metadata['code.namespace'], event.metadata['code.function.name']]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (componentMatches[step.layer] ?? []).includes(event.component)
    || (normalizedLabel.length > 2 && eventEvidence.includes(normalizedLabel))
}

export function pickLayerClass(domain: ProjectDomain, layerName: string, api: ApiDefinition) {
  const layer = domain.layers.find((item) => item.name === layerName)
  if (!layer || layer.classes.length === 0) {
    return null
  }

  const domainKey = domain.name.replaceAll(/\s+/g, '').toLowerCase()
  const handlerKey = api.handler.toLowerCase()
  const exactDomainClass = layer.classes.find((className) => className.toLowerCase().includes(domainKey))
  if (exactDomainClass) {
    return exactDomainClass
  }

  return layer.classes.find((className) => handlerKey.includes(stripLayerSuffix(className).toLowerCase())) ?? layer.classes[0]
}

export function isConcreteMethodApi(api: ApiDefinition): api is ApiDefinition & { method: HttpMethod; methodSpecified: true } {
  return api.methodSpecified && api.method !== 'UNSPECIFIED'
}

export function getApiMethodLabel(api: ApiMethodLike) {
  return api.methodSpecified ? api.method : 'N/A'
}

export function getApiMethodBadgeClassName(api: ApiMethodLike) {
  if (!api.methodSpecified) {
    return 'method-badge method-badge--unspecified'
  }

  return `method-badge method-badge--${api.method.toLowerCase()}`
}

export function stripLayerSuffix(className: string) {
  return className.replace(/(Controller|RepositoryService|Repository|CacheService|CatalogStore|Service|Store|Response)$/u, '')
}

export function isStackFlowRuntimeApi(api: ApiDefinition) {
  return api.controller === 'ProductController' && api.pathTemplate.startsWith('/api/products')
}

export function buildPathFromTemplate(pathTemplate: string, pathVariableValue: string) {
  return pathTemplate.replaceAll(/\{[^}/]+}/g, encodeURIComponent(pathVariableValue))
}

export function humanizeHandler(handler: string) {
  return handler
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (first) => first.toUpperCase())
}

export function createPlaceholderTrace(
  traceId: string,
  method: string,
  endpoint: string,
  scenario: string,
  source: TraceDetail['source'] = 'SAMPLE',
  serviceName: string | null = 'stackflow-sample',
): TraceDetail {
  const now = new Date().toISOString()
  return {
    traceId,
    method,
    endpoint,
    scenario,
    startedAt: now,
    endedAt: now,
    durationMs: 0,
    httpStatus: 0,
    resultStatus: 'SUCCESS',
    events: [],
    source,
    serviceName,
    traceCollectionStatus: source === 'OPENTELEMETRY' ? 'PENDING' : 'DISABLED',
    responsePreview: null,
  }
}

export async function fetchTraceWithRetry(traceId: string) {
  const attempts = 5

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await getTrace(traceId)
    } catch {
      // The final stream event can arrive just before the trace is stored.
    }

    await new Promise((resolve) => window.setTimeout(resolve, 220))
  }

  throw new Error('Trace 상세 정보를 불러오지 못했습니다.')
}

export function formatProfileLastSeen(lastSeenAt: string | null | undefined) {
  if (!lastSeenAt) return '확인되지 않음'
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(lastSeenAt))
}
