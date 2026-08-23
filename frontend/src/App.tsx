import { useEffect, useMemo, useRef, useState, startTransition } from 'react'
import { Background, Controls, ReactFlow } from '@xyflow/react'
import type { ReactFlowInstance } from '@xyflow/react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Braces,
  CheckCircle2,
  ChevronRight,
  Database,
  FolderOpen,
  Network,
  Plus,
  Route,
  ScanSearch,
  Send,
  Trash2,
} from 'lucide-react'
import './App.css'
import {
  analyzeProject,
  createInstrumentationProfile,
  createTraceSession,
  executeExternalRequest,
  getProjectStructure,
  getRecentTraces,
  getTrace,
  selectProjectFolder,
} from './api/stackflow'
import { EvidenceProgress } from './components/EvidenceProgress'
import { StatusBadge } from './components/StatusBadge'
import { TraceWaterfall } from './components/TraceWaterfall'
import { WorkflowTabs } from './components/WorkflowTabs'
import { buildGraph, getNodeDetail } from './lib/graph'
import { buildWaterfall, getPrimaryFailureEvent } from './lib/waterfall'
import {
  EVENT_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  STREAM_STATUS_LABEL,
  TRACE_COLLECTION_STATUS_LABEL,
  getResultStatusLabel,
} from './ui/copy'
import type { StreamStatus, ViewMode } from './ui/copy'
import type {
  ApiCatalogItem,
  ApiMethod,
  EventStatus,
  ExternalRequestEntry,
  ExternalRequestResponse,
  HttpMethod,
  InstrumentationProfile,
  ProjectAnalysisStatus,
  ProductPayload,
  ProjectDomain,
  ProjectLayer,
  ProjectStructure,
  TraceDetail,
  TraceCollectionStatus,
  TraceCollectionStatusEvent,
  TraceEvent,
  TraceStartedEvent,
  TraceSummary,
  TraceTerminalEvent,
} from './types/trace'

const SCENARIOS = [
  { value: 'normal', label: '정상 요청' },
  { value: 'redis-down', label: 'Redis 연결 실패' },
  { value: 'db-timeout', label: '모의 DB 오류' },
  { value: 'service-error', label: 'Service 오류' },
] as const

function matchesTraceEndpoint(api: ApiDefinition, trace: TraceDetail) {
  if (api.methodSpecified && api.method !== trace.method) {
    return false
  }

  const pathPattern = api.pathTemplate
    .split('/')
    .map((segment) => /^\{[^}]+\}$/.test(segment)
      ? '[^/]+'
      : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('/')

  return new RegExp(`^${pathPattern}$`).test(trace.endpoint)
}

type ApiDefinition = {
  id: string
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

type EstimatedFlowStep = {
  id: string
  layer: string
  label: string
  detail: string
  source: string
}

type ExternalRequestSnapshot = {
  method: HttpMethod
  targetUrl: string
  queryParams: ExternalRequestEntry[]
  headers: ExternalRequestEntry[]
  requestBody: string
}

type ProjectStatusContent = {
  headerSummary: string
  nextStepTitle: string
  nextStepDetail: string
  emptyDomainMessage: string
  emptyEndpointMessage: string
}

type DomainDisplayMode = {
  label: string
  detail: string
  tone: 'runtime' | 'integration'
} | null

type LayerGroup = {
  id: 'entry' | 'business' | 'data' | 'integration' | 'model' | 'support'
  label: string
  description: string
  layerNames: string[]
  classes: string[]
}

type DomainStructureStep = {
  id: string
  label: string
  value: string
  detail: string
  tone: 'entry' | 'business' | 'data' | 'integration' | 'infrastructure'
}

type ApiMethodLike = {
  method: ApiMethod
  methodSpecified: boolean
}

const EMPTY_DOMAIN: ProjectDomain = {
  id: 'empty',
  name: '감지된 도메인 없음',
  description: '정적 분석 결과에서 사용할 수 있는 API 도메인을 찾지 못했습니다.',
  responsibilities: [],
  infrastructure: [],
  infrastructureDetails: [],
  controllers: [],
  layers: [],
  endpoints: [],
  packageRoots: [],
}

const EMPTY_API_DEFINITION: ApiDefinition = {
  id: 'empty-api',
  method: 'GET',
  methodSpecified: true,
  label: '감지된 API 없음',
  pathTemplate: '/',
  description: 'REST Controller가 있는 Spring Boot 프로젝트를 분석하세요.',
  requestType: 'NONE',
  requiresProductId: false,
  controller: 'Unavailable',
  handler: 'unavailable',
  domainId: EMPTY_DOMAIN.id,
  domainName: EMPTY_DOMAIN.name,
  source: 'analyzed',
  buildPath: () => '/',
}

const PROJECT_STATUS_CONTENT: Record<ProjectAnalysisStatus, ProjectStatusContent> = {
  SUCCESS: {
    headerSummary: '분석이 끝났습니다. 도메인과 API를 확인한 뒤 요청을 만들어 보세요.',
    nextStepTitle: '실행할 API를 하나 선택하세요.',
    nextStepDetail: '도메인과 예상 흐름을 확인한 뒤 API 요청 탭에서 요청을 실행할 수 있습니다.',
    emptyDomainMessage: '분석은 완료됐지만 묶어서 보여줄 도메인이 없습니다.',
    emptyEndpointMessage: '선택한 도메인에서 API 근거를 찾지 못했습니다.',
  },
  EMPTY: {
    headerSummary: '프로젝트는 읽었지만 REST API 매핑을 찾지 못했습니다.',
    nextStepTitle: 'Controller annotation과 패키지 구성을 확인하세요.',
    nextStepDetail: '`@RestController`와 Spring mapping annotation이 있는지 확인하고 다시 분석하세요.',
    emptyDomainMessage: '프로젝트를 읽었지만 표시할 REST API 도메인이 없습니다.',
    emptyEndpointMessage: '프로젝트를 읽었지만 표시할 endpoint 근거가 없습니다.',
  },
  FAILED: {
    headerSummary: '입력한 경로에서 Spring 소스 루트를 읽지 못했습니다.',
    nextStepTitle: '프로젝트 루트 경로를 다시 확인하세요.',
    nextStepDetail: '`src/main/java` 또는 `backend/src/main/java`가 있는 루트를 입력한 뒤 다시 분석하세요.',
    emptyDomainMessage: '분석에 실패해 도메인 근거를 만들지 못했습니다.',
    emptyEndpointMessage: '분석에 실패해 endpoint 근거를 수집하지 못했습니다.',
  },
}

const FALLBACK_API_CATALOG: ApiDefinition[] = [
  {
    id: 'product-detail',
    method: 'GET',
    methodSpecified: true,
    label: '상품 상세 조회',
    pathTemplate: '/api/products/{productId}',
    description: 'Redis cache hit/miss와 DB fallback을 확인하는 기본 상품 조회 API입니다.',
    requestType: 'QUERY_DETAIL',
    requiresProductId: true,
    controller: 'ProductController',
    handler: 'getProduct',
    domainId: 'product',
    domainName: 'Product',
    source: 'fallback',
    buildPath: (productId) => `/api/products/${productId}`,
  },
  {
    id: 'product-list',
    method: 'GET',
    methodSpecified: true,
    label: '상품 목록 조회',
    pathTemplate: '/api/products',
    description: '상품 목록을 조회하며 Redis 없이 Service -> Repository -> MySQL 경로를 확인합니다.',
    requestType: 'QUERY_LIST',
    requiresProductId: false,
    controller: 'ProductController',
    handler: 'listProducts',
    domainId: 'product',
    domainName: 'Product',
    source: 'fallback',
    buildPath: () => '/api/products',
  },
  {
    id: 'product-stock',
    method: 'GET',
    methodSpecified: true,
    label: '상품 재고 조회',
    pathTemplate: '/api/products/{productId}/stock',
    description: '상품 재고 조회 API로 DB timeout과 Service 예외 위치를 확인합니다.',
    requestType: 'QUERY_STOCK',
    requiresProductId: true,
    controller: 'ProductController',
    handler: 'getProductStock',
    domainId: 'product',
    domainName: 'Product',
    source: 'fallback',
    buildPath: (productId) => `/api/products/${productId}/stock`,
  },
  {
    id: 'cache-refresh',
    method: 'POST',
    methodSpecified: true,
    label: '상품 캐시 갱신',
    pathTemplate: '/api/products/{productId}/cache-refresh',
    description: 'DB에서 상품을 다시 읽고 Redis에 저장하는 쓰기성 요청 흐름을 확인합니다.',
    requestType: 'CACHE_WRITE',
    requiresProductId: true,
    controller: 'ProductController',
    handler: 'refreshProductCache',
    domainId: 'product',
    domainName: 'Product',
    source: 'fallback',
    buildPath: (productId) => `/api/products/${productId}/cache-refresh`,
  },
  {
    id: 'payment-list',
    method: 'GET',
    methodSpecified: true,
    label: '결제 목록 조회',
    pathTemplate: '/api/payments',
    description: 'UseCase -> Gateway -> Client 경계를 따라 외부 결제 조회 흐름을 보여주는 샘플 API입니다.',
    requestType: 'QUERY_LIST',
    requiresProductId: false,
    controller: 'PaymentController',
    handler: 'listPayments',
    domainId: 'payment',
    domainName: 'Payment',
    source: 'fallback',
    buildPath: () => '/api/payments',
  },
  {
    id: 'payment-quote',
    method: 'POST',
    methodSpecified: true,
    label: '결제 견적 생성',
    pathTemplate: '/api/payments/quote',
    description: '외부 결제 연동 경계가 Gateway와 Client로 어떻게 보이는지 보여주는 샘플 API입니다.',
    requestType: 'WRITE',
    requiresProductId: false,
    controller: 'PaymentController',
    handler: 'createPaymentQuote',
    domainId: 'payment',
    domainName: 'Payment',
    source: 'fallback',
    buildPath: () => '/api/payments/quote',
  },
]

const FALLBACK_PROJECT_STRUCTURE: ProjectStructure = {
  projectName: 'StackFlow 샘플 프로젝트',
  framework: 'Spring Boot',
  frameworkEvidence: 'StackFlow 샘플 프로젝트 metadata에서 확인했습니다.',
  analysisStatus: 'SUCCESS',
  sourceRoot: 'backend/src/main/java',
  analysisMessage: '기능을 둘러볼 수 있도록 StackFlow 샘플 프로젝트를 표시합니다.',
  analysisCoverage: {
    sourceRoots: ['backend/src/main/java'],
    scannedJavaFiles: 24,
    controllerCandidates: 2,
    detectedControllers: 2,
    detectedEndpoints: 6,
    warnings: [],
  },
  infrastructure: ['Redis', 'MySQL'],
  infrastructureDetails: [
    { name: 'Redis', detectedBy: 'sample', evidence: 'ProductCacheService and cache-refresh endpoints are part of the sample app.' },
    { name: 'MySQL', detectedBy: 'sample', evidence: 'ProductRepositoryService simulates the persistence layer in the sample app.' },
  ],
  layers: [
    { name: 'Controller', type: 'CONTROLLER', classes: ['ProductController'], evidence: 'Detected sample controller class ProductController.' },
    { name: 'Service', type: 'SERVICE', classes: ['ProductService'], evidence: 'Detected sample service class ProductService.' },
    { name: 'Cache', type: 'CACHE', classes: ['ProductCacheService'], evidence: 'Detected sample cache class ProductCacheService.' },
    { name: 'Repository', type: 'REPOSITORY', classes: ['ProductRepositoryService'], evidence: 'Detected sample repository class ProductRepositoryService.' },
    { name: 'UseCase', type: 'USECASE', classes: ['PaymentUseCase'], evidence: 'Detected sample use-case class PaymentUseCase.' },
    { name: 'Gateway', type: 'GATEWAY', classes: ['PaymentGateway'], evidence: 'Detected sample gateway class PaymentGateway.' },
    { name: 'Client', type: 'CLIENT', classes: ['PaymentClient'], evidence: 'Detected sample client class PaymentClient.' },
  ],
  domains: [
    {
      id: 'product',
      name: 'Product',
      description: '상품 조회 요청이 cache, repository, database를 어떻게 통과하는지 확인합니다.',
      responsibilities: ['QUERY_DETAIL', 'QUERY_LIST', 'QUERY_STOCK', 'CACHE_WRITE'],
      infrastructure: ['Redis', 'MySQL'],
      infrastructureDetails: [
        { name: 'Redis', detectedBy: 'sample', evidence: 'Cache read and cache refresh flows are part of the sample product domain.' },
        { name: 'MySQL', detectedBy: 'sample', evidence: 'Repository and stock lookup flows represent the sample data path.' },
      ],
      controllers: [{ name: 'ProductController', packageName: 'com.stackflow.backend.controller', basePath: '/api', endpointCount: 4, sourceFile: 'com/stackflow/backend/controller/ProductController.java' }],
      layers: [
        { name: 'Controller', type: 'CONTROLLER', classes: ['ProductController'], evidence: 'Detected sample controller class ProductController.' },
        { name: 'Service', type: 'SERVICE', classes: ['ProductService'], evidence: 'Detected sample service class ProductService.' },
        { name: 'Cache', type: 'CACHE', classes: ['ProductCacheService'], evidence: 'Detected sample cache class ProductCacheService.' },
        { name: 'Repository', type: 'REPOSITORY', classes: ['ProductRepositoryService'], evidence: 'Detected sample repository class ProductRepositoryService.' },
      ],
      endpoints: FALLBACK_API_CATALOG
        .filter((api) => api.domainId === 'product')
        .map((api) => ({
          id: api.id,
          method: api.method,
          methodSpecified: api.methodSpecified,
          path: api.pathTemplate,
          controller: api.controller,
          handler: api.handler,
          requestType: api.requestType,
          requiresPathVariable: api.requiresProductId,
          pathVariables: api.requiresProductId ? ['productId'] : [],
          sourceFile: 'com/stackflow/backend/controller/ProductController.java',
          sourceLine: 0,
        })),
      packageRoots: ['com.stackflow.backend.controller', 'com.stackflow.backend.service'],
    },
    {
      id: 'payment',
      name: 'Payment',
      description: '결제 조회와 quote 생성이 use case, gateway, client 경계를 어떻게 통과하는지 확인합니다.',
      responsibilities: ['QUERY_LIST', 'WRITE'],
      infrastructure: ['In-memory'],
      infrastructureDetails: [
        { name: 'In-memory', detectedBy: 'sample', evidence: 'Payment sample responses are returned from the in-app client without database persistence.' },
      ],
      controllers: [{ name: 'PaymentController', packageName: 'com.stackflow.backend.controller', basePath: '/api/payments', endpointCount: 2, sourceFile: 'com/stackflow/backend/controller/PaymentController.java' }],
      layers: [
        { name: 'Controller', type: 'CONTROLLER', classes: ['PaymentController'], evidence: 'Detected sample controller class PaymentController.' },
        { name: 'UseCase', type: 'USECASE', classes: ['PaymentUseCase'], evidence: 'Detected sample use-case class PaymentUseCase.' },
        { name: 'Gateway', type: 'GATEWAY', classes: ['PaymentGateway'], evidence: 'Detected sample gateway class PaymentGateway.' },
        { name: 'Client', type: 'CLIENT', classes: ['PaymentClient'], evidence: 'Detected sample client class PaymentClient.' },
      ],
      endpoints: FALLBACK_API_CATALOG
        .filter((api) => api.domainId === 'payment')
        .map((api) => ({
          id: api.id,
          method: api.method,
          methodSpecified: api.methodSpecified,
          path: api.pathTemplate,
          controller: api.controller,
          handler: api.handler,
          requestType: api.requestType,
          requiresPathVariable: api.requiresProductId,
          pathVariables: [],
          sourceFile: 'com/stackflow/backend/controller/PaymentController.java',
          sourceLine: 0,
        })),
      packageRoots: ['com.stackflow.backend.controller', 'com.stackflow.backend.service'],
    },
  ],
}

function App() {
  const [productId, setProductId] = useState('1001')
  const [projectPath, setProjectPath] = useState('')
  const [folderPickerState, setFolderPickerState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [folderPickerMessage, setFolderPickerMessage] = useState('Finder에서 프로젝트 폴더를 선택할 수 있습니다.')
  const [targetBaseUrl, setTargetBaseUrl] = useState('')
  const [queryParams, setQueryParams] = useState<ExternalRequestEntry[]>([
    createRequestEntry('page', '1', false),
  ])
  const [requestHeaders, setRequestHeaders] = useState<ExternalRequestEntry[]>([
    createRequestEntry('Authorization', '', false),
  ])
  const [requestBody, setRequestBody] = useState('{\n  "name": "Sample product"\n}')
  const [requestBodyError, setRequestBodyError] = useState<string | null>(null)
  const [externalRequestSnapshot, setExternalRequestSnapshot] = useState<ExternalRequestSnapshot | null>(null)
  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number]['value']>('normal')
  const [requestOptionTab, setRequestOptionTab] = useState<'query' | 'headers' | 'body'>('query')
  const [activeView, setActiveView] = useState<ViewMode>('project')
  const [apiCatalog, setApiCatalog] = useState<ApiDefinition[]>(FALLBACK_API_CATALOG)
  const [projectStructure, setProjectStructure] = useState<ProjectStructure>(FALLBACK_PROJECT_STRUCTURE)
  const [, setCatalogSource] = useState<'analyzed' | 'fallback'>('fallback')
  const [analysisTarget, setAnalysisTarget] = useState<'sample' | 'external'>('sample')
  const [analysisState, setAnalysisState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [analysisMessage, setAnalysisMessage] = useState('기본 StackFlow 샘플 프로젝트를 사용하고 있습니다.')
  const [selectedApiId, setSelectedApiId] = useState(FALLBACK_API_CATALOG[0].id)
  const [selectedDomainId, setSelectedDomainId] = useState(FALLBACK_PROJECT_STRUCTURE.domains[0].id)
  const [apiScope, setApiScope] = useState<'all' | 'domain'>('domain')
  const [traceDetail, setTraceDetail] = useState<TraceDetail | null>(null)
  const [recentTraces, setRecentTraces] = useState<TraceSummary[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [traceViewTab, setTraceViewTab] = useState<'timeline' | 'graph' | 'events'>('timeline')
  const [requestState, setRequestState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle')
  const [requestMessage, setRequestMessage] = useState<string>('API를 선택하고 요청을 실행하세요.')
  const [lastResponseBody, setLastResponseBody] = useState<unknown>(null)
  const [externalResponse, setExternalResponse] = useState<ExternalRequestResponse | null>(null)
  const [agentPath, setAgentPath] = useState('~/.stackflow/agents/opentelemetry-javaagent.jar')
  const [collectorBaseUrl, setCollectorBaseUrl] = useState('http://localhost:18080')
  const [instrumentationProfile, setInstrumentationProfile] = useState<InstrumentationProfile | null>(null)
  const [profileState, setProfileState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [profileMessage, setProfileMessage] = useState('Agent 경로와 수집 주소를 확인한 뒤 실행 명령을 생성하세요.')
  const [traceCollectionStatus, setTraceCollectionStatus] = useState<TraceCollectionStatus>('DISABLED')
  const activeStreamRef = useRef<EventSource | null>(null)
  const activeRunIdRef = useRef(0)
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null)

  const graph = buildGraph(traceDetail)
  const waterfall = buildWaterfall(traceDetail?.events ?? [])
  const orderedTraceEvents = [...(traceDetail?.events ?? [])].sort((left, right) =>
    Date.parse(left.startedAt) - Date.parse(right.startedAt),
  )
  const primaryFailureEvent = getPrimaryFailureEvent(traceDetail?.events ?? [])
  const primaryFailureNodeId = primaryFailureEvent?.spanId ?? primaryFailureEvent?.component ?? null
  const selectedNode = getNodeDetail(
    graph.states,
    selectedNodeId ?? primaryFailureNodeId ?? graph.states.find((state) => state.active)?.id ?? null,
  )
  const activeNodeCount = graph.states.filter((state) => state.active).length
  const latestEvent = traceDetail?.events.at(-1) ?? null
  const inspectorEvent = primaryFailureEvent ?? latestEvent
  const primaryFailureLabel = graph.states.find((state) => state.id === primaryFailureNodeId)?.label
    ?? primaryFailureEvent?.component
    ?? null
  const selectedDomain = projectStructure.domains.find((domain) => domain.id === selectedDomainId) ?? projectStructure.domains[0] ?? EMPTY_DOMAIN
  const hasDetectedDomains = projectStructure.domains.length > 0
  const hasDetectedApis = apiCatalog.length > 0
  const domainApis = apiCatalog.filter((api) => api.domainId === selectedDomain.id)
  const visibleApis = apiScope === 'all' ? apiCatalog : domainApis
  const selectedApi = visibleApis.find((api) => api.id === selectedApiId) ?? visibleApis[0] ?? EMPTY_API_DEFINITION
  const projectMetrics = buildProjectMetrics(projectStructure)
  const domainLayerGroups = groupProjectLayers(selectedDomain.layers)
  const domainStructurePath = buildDomainStructurePath(domainLayerGroups, selectedDomain.infrastructure)
  const supportingDomainGroups = domainLayerGroups.filter((group) =>
    (group.id === 'model' || group.id === 'support') && group.classes.length > 0,
  )
  const commonLayerGroups = groupProjectLayers(buildCommonProjectLayers(projectStructure))
  const commonClassCount = commonLayerGroups.reduce((sum, group) => sum + group.classes.length, 0)
  const activeRoute = graph.states.filter((state) => state.active)
  const estimatedFlow = hasDetectedApis ? buildEstimatedFlow(selectedApi, selectedDomain) : []
  const traceComparison = traceDetail?.source === 'OPENTELEMETRY'
    ? compareEstimatedAndActualFlow(estimatedFlow, traceDetail.events)
    : null
  const hasConcreteMethod = hasDetectedApis && isConcreteMethodApi(selectedApi)
  const runtimeSupported = hasDetectedApis && hasConcreteMethod && analysisTarget === 'sample' && isStackFlowRuntimeApi(selectedApi)
  const externalRunnable = hasDetectedApis && hasConcreteMethod && analysisTarget === 'external'
  const analyzeOnly = hasDetectedApis && !runtimeSupported && !externalRunnable
  const projectStatusContent = PROJECT_STATUS_CONTENT[projectStructure.analysisStatus]
  const selectedDomainDisplayMode = getDomainDisplayMode(selectedDomain, analysisTarget === 'sample')
  const hasIntegrationBoundary = selectedDomainDisplayMode?.tone === 'integration'
  const externalTraceReady = analysisTarget === 'external' && Boolean(instrumentationProfile)
  const instrumentationCommand = instrumentationProfile
    ? instrumentationProfile.commands[instrumentationProfile.buildTool.toLowerCase()]
      ?? instrumentationProfile.commands.jar
    : null
  const runtimeModeLabel = runtimeSupported
    ? '요청·Trace 가능'
    : externalRunnable
      ? externalTraceReady ? '요청 후 Trace 확인' : '외부 API 요청'
      : '정적 분석만 가능'
  const traceDisplayStatus = traceDetail?.source === 'OPENTELEMETRY' && streamStatus !== 'idle'
    ? TRACE_COLLECTION_STATUS_LABEL[traceCollectionStatus]
    : traceDetail
      ? EVENT_STATUS_LABEL[traceDetail.resultStatus]
      : STREAM_STATUS_LABEL[streamStatus]
  const traceDisplayTone = streamStatus === 'idle' && traceDetail
    ? traceDetail.resultStatus === 'SUCCESS'
      ? 'success'
      : traceDetail.resultStatus === 'WARNING'
        ? 'warning'
        : 'error'
    : streamStatus === 'completed'
      ? 'success'
      : streamStatus === 'error'
        ? 'error'
        : streamStatus === 'idle'
          ? 'neutral'
          : 'info'
  const currentResultStatus = externalResponse?.resultStatus ?? traceDetail?.resultStatus ?? 'IDLE'
  const externalPath = selectedApi.buildPath(productId)
  const externalTargetPreview = buildExternalTargetPreview(targetBaseUrl, externalPath, queryParams)
  const bodyAllowed = hasConcreteMethod && ['POST', 'PUT', 'PATCH'].includes(selectedApi.method)
  const selectedApiMethodLabel = getApiMethodLabel(selectedApi)
  const selectedApiMethodClassName = getApiMethodBadgeClassName(selectedApi)
  const graphFitKey = `${traceDetail?.traceId ?? 'empty'}-${traceDetail?.events.length ?? 0}`
  const recentEvents = useMemo(() => {
    return traceDetail?.events.slice(0, 8) ?? []
  }, [traceDetail])

  const formattedResponseBody = useMemo(() => {
    if (!lastResponseBody) {
      return null
    }

    return JSON.stringify(lastResponseBody, null, 2)
  }, [lastResponseBody])

  const formattedExternalResponseBody = useMemo(() => {
    if (!externalResponse) {
      return null
    }

    return formatResponseBody(externalResponse.responseBody)
  }, [externalResponse])

  useEffect(() => {
    void loadApiCatalog()
    void loadRecentTraces()
    return () => {
      closeActiveStream()
    }
  }, [])

  useEffect(() => {
    if (!flowInstanceRef.current) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      flowInstanceRef.current?.fitView({ padding: 0.14, duration: 180, includeHiddenNodes: true })
    })
    const settledFit = window.setTimeout(() => {
      flowInstanceRef.current?.fitView({ padding: 0.14, duration: 0, includeHiddenNodes: true })
    }, 180)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(settledFit)
    }
  }, [graphFitKey])

  async function loadApiCatalog() {
    try {
      const structure = await getProjectStructure()
      const analyzedCatalog = flattenProjectApis(structure)
      applyProjectStructure(structure, analyzedCatalog, structure.analysisMessage, 'sample')
    } catch {
      startTransition(() => {
        setProjectStructure(FALLBACK_PROJECT_STRUCTURE)
        setApiCatalog(FALLBACK_API_CATALOG)
        setCatalogSource('fallback')
        setAnalysisTarget('sample')
        setAnalysisMessage('샘플 프로젝트를 표시하고 있습니다. 직접 분석하려면 프로젝트 경로를 입력하세요.')
        setSelectedDomainId((current) =>
          FALLBACK_PROJECT_STRUCTURE.domains.some((domain) => domain.id === current)
            ? current
            : FALLBACK_PROJECT_STRUCTURE.domains[0].id,
        )
        setSelectedApiId((current) => FALLBACK_API_CATALOG.some((api) => api.id === current) ? current : FALLBACK_API_CATALOG[0].id)
      })
    }
  }

  async function analyzeProjectPath(pathOverride?: string) {
    const requestedPath = pathOverride ?? projectPath
    if (pathOverride === undefined && !requestedPath.trim()) {
      setAnalysisState('error')
      setAnalysisMessage('분석할 프로젝트 폴더를 선택하거나 절대 경로를 입력하세요. 데모는 별도 버튼으로 열 수 있습니다.')
      return
    }

    setAnalysisState('loading')
    setAnalysisMessage('프로젝트 파일과 Spring mapping을 읽고 있습니다...')
    const nextAnalysisTarget = requestedPath.trim() === '' ? 'sample' : 'external'

    try {
      const structure = await analyzeProject(requestedPath)
      const analyzedCatalog = flattenProjectApis(structure)
      applyProjectStructure(structure, analyzedCatalog, structure.analysisMessage, nextAnalysisTarget)
      setAnalysisState(structure.analysisStatus === 'FAILED' ? 'error' : 'idle')
      setActiveView('project')
    } catch (error) {
      setAnalysisState('error')
      setAnalysisMessage(error instanceof Error ? error.message : '프로젝트 분석에 실패했습니다.')
    }
  }

  async function selectLocalProjectFolder() {
    setFolderPickerState('loading')
    setFolderPickerMessage('폴더 선택창을 여는 중입니다...')

    try {
      const selection = await selectProjectFolder()
      if (!selection.supported) {
        setFolderPickerState('error')
        setFolderPickerMessage(selection.message)
        return
      }
      if (!selection.selected || !selection.projectPath) {
        setFolderPickerState('idle')
        setFolderPickerMessage(selection.message)
        return
      }

      setProjectPath(selection.projectPath)
      setFolderPickerState('idle')
      setFolderPickerMessage('선택한 경로가 입력되었습니다. 프로젝트 분석을 실행하세요.')
    } catch (error) {
      setFolderPickerState('error')
      setFolderPickerMessage(error instanceof Error ? error.message : '폴더 선택창을 열지 못했습니다.')
    }
  }

  function applyProjectStructure(
    structure: ProjectStructure,
    analyzedCatalog: ApiDefinition[],
    message: string,
    target: 'sample' | 'external',
  ) {
    if (target === 'external') {
      closeActiveStream()
    }

    startTransition(() => {
      setProjectStructure(structure)
      setApiCatalog(analyzedCatalog)
      setCatalogSource('analyzed')
      setAnalysisTarget(target)
      setApiScope(target === 'external' ? 'all' : 'domain')
      setAnalysisMessage(message)
      setSelectedDomainId((current) => structure.domains.some((domain) => domain.id === current) ? current : (structure.domains[0]?.id ?? EMPTY_DOMAIN.id))
      setSelectedApiId((current) => analyzedCatalog.some((api) => api.id === current) ? current : (analyzedCatalog[0]?.id ?? EMPTY_API_DEFINITION.id))
      if (target === 'external') {
        setInstrumentationProfile(null)
        setProfileState('idle')
        setProfileMessage('Agent 경로와 수집 주소를 확인한 뒤 실행 명령을 생성하세요.')
        setTraceCollectionStatus('DISABLED')
        setTraceDetail(null)
        setSelectedNodeId(null)
        setLastResponseBody(null)
        setExternalResponse(null)
        setStreamStatus('idle')
        setRequestState('idle')
        setRequestMessage('외부 프로젝트를 불러왔습니다. 대상 URL을 입력한 뒤 요청을 실행하세요.')
      }
      if (target === 'sample') {
        setExternalResponse(null)
        setRequestState('idle')
        setRequestMessage('API를 선택하고 요청을 실행하세요.')
      }
    })
  }

  async function generateInstrumentationProfile() {
    if (analysisTarget !== 'external' || !projectPath.trim()) {
      setProfileState('error')
      setProfileMessage('먼저 외부 Spring 프로젝트 경로를 분석하세요.')
      return
    }

    setProfileState('loading')
    setProfileMessage('분석된 클래스와 public method로 Agent 실행 설정을 만들고 있습니다...')
    try {
      const profile = await createInstrumentationProfile({
        projectPath: projectPath.trim(),
        collectorBaseUrl: collectorBaseUrl.trim(),
        agentPath: agentPath.trim(),
      })
      setInstrumentationProfile(profile)
      setProfileState('idle')
      setProfileMessage('명령을 터미널에서 실행해 대상 앱을 Agent와 함께 재시작하세요.')
    } catch (error) {
      setProfileState('error')
      setProfileMessage(error instanceof Error ? error.message : '실행 Trace 설정 생성에 실패했습니다.')
    }
  }

  function selectDomain(domain: ProjectDomain) {
    if (domain.id === EMPTY_DOMAIN.id) {
      return
    }
    setSelectedDomainId(domain.id)
    setApiScope('domain')
    setActiveView('project')
    const nextApi = apiCatalog.find((api) => api.domainId === domain.id)
    if (nextApi) {
      setSelectedApiId(nextApi.id)
      setExternalResponse(null)
    }
  }

  function selectApi(api: ApiDefinition) {
    setSelectedApiId(api.id)
    setSelectedDomainId(api.domainId)
    setExternalResponse(null)
    setActiveView('api')
  }

  function updateQueryParam(id: string, patch: Partial<ExternalRequestEntry>) {
    setQueryParams((current) => updateRequestEntries(current, id, patch))
  }

  function updateRequestHeader(id: string, patch: Partial<ExternalRequestEntry>) {
    setRequestHeaders((current) => updateRequestEntries(current, id, patch))
  }

  function removeQueryParam(id: string) {
    setQueryParams((current) => removeRequestEntry(current, id))
  }

  function removeRequestHeader(id: string) {
    setRequestHeaders((current) => removeRequestEntry(current, id))
  }

  async function loadRecentTraces() {
    try {
      const traces = await getRecentTraces()
      startTransition(() => setRecentTraces(traces))
    } catch {
      // Recent history is optional while the backend is starting.
    }
  }

  async function runRequest() {
    if (!hasDetectedApis) {
      setActiveView('project')
      setRequestState('error')
      setStreamStatus('idle')
      setRequestMessage('현재 분석 결과에는 실행할 REST API가 없습니다.')
      return
    }

    if (analyzeOnly) {
      setActiveView('api')
      setRequestState('error')
      setStreamStatus('idle')
      setRequestMessage(
        selectedApi.methodSpecified
          ? '이 API는 정적 분석만 가능합니다. Product API를 선택하면 실제 Trace를 확인할 수 있습니다.'
          : '정적 분석에서 endpoint는 찾았지만 HTTP method가 명시되지 않았습니다. 소스에서 method를 먼저 확인하세요.',
      )
      return
    }

    if (!runtimeSupported) {
      await runExternalRequest()
      return
    }

    const runId = activeRunIdRef.current + 1
    const requestMethod = selectedApi.method as HttpMethod
    activeRunIdRef.current = runId
    closeActiveStream()
    setRequestState('loading')
    setStreamStatus('connecting')
    setActiveView('runtime')
    setRequestMessage('Trace 세션을 만들고 실시간 연결을 여는 중입니다...')
    setLastResponseBody(null)
    setExternalResponse(null)

    try {
      const session = await createTraceSession()
      const traceId = session.traceId
      const endpoint = selectedApi.buildPath(productId)

      startTransition(() => {
        setTraceDetail(createPlaceholderTrace(traceId, selectedApiMethodLabel, endpoint, scenario))
        setSelectedNodeId(null)
      })

      try {
        const stream = await openTraceStream(traceId, runId)
        if (activeRunIdRef.current !== runId) {
          stream.close()
          return
        }
        activeStreamRef.current = stream
        setStreamStatus('streaming')
        setRequestMessage('실시간 연결이 열렸습니다. API 요청을 실행합니다...')
      } catch {
        if (activeRunIdRef.current !== runId) {
          return
        }
        setStreamStatus('error')
        setRequestMessage('실시간 연결을 열지 못했습니다. 요청 후 최종 Trace를 불러옵니다...')
      }

      const search = new URLSearchParams({ traceId })
      if (scenario !== 'normal') {
        search.set('scenario', scenario)
      }

      const response = await fetch(`${endpoint}?${search.toString()}`, { method: requestMethod })
      const payload = (await response.json()) as ProductPayload

      if (activeRunIdRef.current !== runId) {
        return
      }

      setLastResponseBody(payload)

      if (!payload.traceId) {
        throw new Error('응답에서 Trace ID를 받지 못했습니다.')
      }

      const finalTrace = await fetchTraceWithRetry(payload.traceId)
      if (activeRunIdRef.current !== runId) {
        return
      }

      startTransition(() => {
        setTraceDetail(finalTrace)
        const failureEvent = getPrimaryFailureEvent(finalTrace.events)
        setSelectedNodeId(
          failureEvent?.spanId
            ?? failureEvent?.component
            ?? finalTrace.events.at(-1)?.spanId
            ?? finalTrace.events.at(-1)?.component
            ?? null,
        )
        setRequestState(response.ok ? 'idle' : 'error')
        setStreamStatus(response.ok ? 'completed' : 'error')
        setRequestMessage(buildRequestMessage(finalTrace.resultStatus, payload))
        setRecentTraces((current) => {
          const next = current.filter((item) => item.traceId !== finalTrace.traceId)
          next.unshift({
            traceId: finalTrace.traceId,
            endpoint: finalTrace.endpoint,
            scenario: finalTrace.scenario,
            resultStatus: finalTrace.resultStatus,
            httpStatus: finalTrace.httpStatus,
            durationMs: finalTrace.durationMs,
            startedAt: finalTrace.startedAt,
          })
          return next.slice(0, 8)
        })
      })
    } catch (error) {
      if (activeRunIdRef.current !== runId) {
        return
      }
      setRequestState('error')
      setStreamStatus('error')
      setRequestMessage(error instanceof Error ? error.message : '요청 실행 중 오류가 발생했습니다.')
    }
  }

  async function runExternalRequest() {
    if (!externalRunnable) {
      setActiveView('api')
      setRequestState('error')
      setStreamStatus('idle')
      setRequestMessage(
        selectedApi.methodSpecified
          ? '이 샘플 API는 정적 분석만 제공합니다. Product API를 선택하면 샘플 Trace를 실행할 수 있습니다.'
          : 'endpoint의 HTTP method가 명시되지 않았습니다. 소스에서 method를 확인한 뒤 요청하세요.',
      )
      return
    }

    const normalizedTargetBaseUrl = targetBaseUrl.trim()
    const requestMethod = selectedApi.method as HttpMethod
    if (!normalizedTargetBaseUrl) {
      setActiveView('api')
      setRequestState('error')
      setStreamStatus('idle')
      setRequestMessage('외부 API를 요청하려면 대상 기본 URL을 입력하세요.')
      return
    }

    const captureTrace = externalTraceReady
    const runId = activeRunIdRef.current + 1
    activeRunIdRef.current = runId
    closeActiveStream()
    setActiveView('api')
    setRequestState('loading')
    setStreamStatus('idle')
    setTraceCollectionStatus(captureTrace ? 'PENDING' : 'DISABLED')
    setTraceDetail(null)
    setSelectedNodeId(null)
    setLastResponseBody(null)
    setExternalResponse(null)
    setExternalRequestSnapshot(null)
    setRequestBodyError(null)

    const nextRequestBody = bodyAllowed ? requestBody.trim() : ''
    if (nextRequestBody) {
      try {
        JSON.parse(nextRequestBody)
      } catch {
        setRequestState('error')
        setRequestBodyError('요청 본문은 올바른 JSON 형식이어야 합니다.')
        setRequestMessage('JSON 요청 본문을 수정한 뒤 다시 실행하세요.')
        return
      }
    }

    const requestSnapshot: ExternalRequestSnapshot = {
      method: requestMethod,
      targetUrl: externalTargetPreview,
      queryParams,
      headers: requestHeaders,
      requestBody: nextRequestBody,
    }

    setRequestMessage(`${selectedApiMethodLabel} ${externalTargetPreview} 요청 중...`)

    try {
      const payload = await executeExternalRequest({
        targetBaseUrl: normalizedTargetBaseUrl,
        method: requestMethod,
        path: externalPath,
        queryParams: toEnabledEntries(queryParams),
        headers: toEnabledEntries(requestHeaders),
        requestBody: nextRequestBody || null,
        captureTrace,
      })
      startTransition(() => {
        setExternalResponse(payload)
        setLastResponseBody(parseResponseBody(payload.responseBody))
        setExternalRequestSnapshot(requestSnapshot)
        setRequestState(payload.resultStatus === 'SUCCESS' ? 'idle' : 'error')
        setTraceCollectionStatus(payload.traceCollectionStatus)
        setRequestMessage(buildExternalRequestMessage(payload))
      })

      if (payload.traceId) {
        const traceId = payload.traceId
        setTraceDetail(createPlaceholderTrace(
          traceId,
          selectedApiMethodLabel,
          externalPath,
          'external-opentelemetry',
          'OPENTELEMETRY',
          instrumentationProfile?.serviceName ?? projectStructure.projectName,
        ))
        setStreamStatus('connecting')
        setActiveView('runtime')
        setRequestMessage('외부 요청은 완료됐습니다. OpenTelemetry span을 기다리고 있습니다...')
        try {
          const stream = await openTraceStream(traceId, runId)
          if (activeRunIdRef.current !== runId) {
            stream.close()
            return
          }
          activeStreamRef.current = stream
        } catch {
          setStreamStatus('error')
          setRequestMessage('Trace 실시간 연결을 열지 못했습니다. Agent와 수집 주소를 확인하세요.')
        }
      }
    } catch (error) {
      setRequestState('error')
      setRequestMessage(error instanceof Error ? error.message : '외부 API 요청 중 오류가 발생했습니다.')
    }
  }

  async function openTraceStream(traceId: string, runId: number) {
    let terminalReceived = false

    return await new Promise<EventSource>((resolve, reject) => {
      const stream = new EventSource(`/api/traces/${traceId}/stream`)
      let opened = false
      let resolved = false
      const fallbackTimer = window.setTimeout(() => {
        if (!resolved && stream.readyState !== EventSource.CLOSED) {
          resolved = true
          opened = true
          resolve(stream)
        }
      }, 1500)

      const finalizeResolve = () => {
        if (resolved) {
          return
        }

        resolved = true
        opened = true
        window.clearTimeout(fallbackTimer)
        resolve(stream)
      }

      const finalizeReject = (error: Error) => {
        if (resolved) {
          return
        }

        resolved = true
        window.clearTimeout(fallbackTimer)
        reject(error)
      }

      const onOpen = () => {
        finalizeResolve()
      }

      const onReady = () => {
        finalizeResolve()
      }

      const onStarted = (rawEvent: MessageEvent<string>) => {
        if (activeRunIdRef.current !== runId) {
          return
        }
        const payload = JSON.parse(rawEvent.data) as TraceStartedEvent
        startTransition(() => {
          setStreamStatus('streaming')
          setTraceDetail((current) => {
            if (!current || current.traceId !== payload.traceId) {
              return current
            }

            return {
              ...current,
              method: payload.method,
              endpoint: payload.endpoint,
              scenario: payload.scenario,
              startedAt: payload.timestamp,
            }
          })
          setRequestMessage('실행 이벤트를 수집하고 있습니다...')
        })
      }

      const onTraceEvent = (rawEvent: MessageEvent<string>) => {
        if (activeRunIdRef.current !== runId) {
          return
        }
        const payload = JSON.parse(rawEvent.data) as TraceEvent
        startTransition(() => {
          setTraceDetail((current) => {
            if (!current || current.traceId !== payload.traceId) {
              return current
            }

            return {
              ...current,
              events: current.events.some((event) =>
                event.eventId === payload.eventId || Boolean(payload.spanId && event.spanId === payload.spanId),
              ) ? current.events : [...current.events, payload],
              endedAt: payload.endedAt,
            }
          })
          setSelectedNodeId(payload.spanId ?? payload.component)
        })
      }

      const onCollectionStatus = (rawEvent: MessageEvent<string>) => {
        if (activeRunIdRef.current !== runId) {
          return
        }
        const payload = JSON.parse(rawEvent.data) as TraceCollectionStatusEvent
        setTraceCollectionStatus(payload.status)
        if (payload.status === 'PENDING') {
          setStreamStatus('connecting')
        } else if (payload.status === 'COLLECTING') {
          setStreamStatus('streaming')
        } else if (payload.status === 'COMPLETED') {
          setStreamStatus('completed')
        } else if (payload.status === 'TIMED_OUT') {
          terminalReceived = true
          setStreamStatus('error')
        }
        setRequestMessage(payload.message)
      }

      const onTerminal = (rawEvent: MessageEvent<string>, nextStatus: 'completed' | 'error') => {
        terminalReceived = true
        if (activeRunIdRef.current !== runId) {
          return
        }
        const payload = JSON.parse(rawEvent.data) as TraceTerminalEvent
        startTransition(() => {
          setStreamStatus(nextStatus)
          setTraceDetail((current) => {
            if (!current || current.traceId !== payload.traceId) {
              return current
            }

            return {
              ...current,
              endedAt: payload.timestamp,
              durationMs: payload.durationMs,
              httpStatus: payload.httpStatus,
              resultStatus: payload.resultStatus,
            }
          })
          setRequestMessage(
            nextStatus === 'completed'
              ? 'Trace 수집이 완료됐습니다. 상세 결과를 정리합니다...'
              : `${payload.errorType ?? '알 수 없는 지점'}에서 Trace가 실패했습니다. 상세 결과를 정리합니다...`,
          )
        })
        void fetchTraceWithRetry(payload.traceId).then((detail) => {
          if (activeRunIdRef.current !== runId) return
          setTraceDetail(detail)
          const failureEvent = getPrimaryFailureEvent(detail.events)
          setSelectedNodeId(
            failureEvent?.spanId
              ?? failureEvent?.component
              ?? detail.events[0]?.spanId
              ?? detail.events[0]?.component
              ?? null,
          )
          void loadRecentTraces()
        }).catch(() => undefined)
      }

      const onError = () => {
        stream.close()
        if (terminalReceived) {
          return
        }

        if (activeRunIdRef.current !== runId) {
          return
        }

        if (!opened) {
          finalizeReject(new Error('실시간 연결을 열지 못했습니다.'))
          return
        }

        startTransition(() => {
          setStreamStatus('error')
        })
      }

      stream.addEventListener('open', onOpen as EventListener)
      stream.addEventListener('stream_ready', onReady as EventListener)
      stream.addEventListener('trace_started', onStarted as EventListener)
      stream.addEventListener('trace_event', onTraceEvent as EventListener)
      stream.addEventListener('trace_collection_status', onCollectionStatus as EventListener)
      stream.addEventListener('trace_completed', ((event: Event) => onTerminal(event as MessageEvent<string>, 'completed')) as EventListener)
      stream.addEventListener('trace_failed', ((event: Event) => onTerminal(event as MessageEvent<string>, 'error')) as EventListener)
      stream.addEventListener('error', onError as EventListener)
    })
  }

  function closeActiveStream() {
    activeStreamRef.current?.close()
    activeStreamRef.current = null
  }

  async function selectTrace(traceId: string) {
    closeActiveStream()
    const detail = await fetchTraceWithRetry(traceId)
    const matchingApi = apiCatalog.find((api) => matchesTraceEndpoint(api, detail))
    startTransition(() => {
      setTraceDetail(detail)
      setSelectedNodeId(null)
      if (matchingApi) {
        setSelectedApiId(matchingApi.id)
        setSelectedDomainId(matchingApi.domainId)
      }
      setLastResponseBody(null)
      setStreamStatus('idle')
      setRequestState('idle')
      setRequestMessage(`기록에서 Trace ${detail.traceId.slice(0, 8)}를 불러왔습니다.`)
    })
  }

  return (
    <main className="app-shell">
      <header className={`topbar topbar--${activeView}`}>
        <div className="topbar__brand">
          <span className="topbar__mark" aria-hidden="true">SF</span>
          <div>
            <strong>StackFlow</strong>
            <span>{projectStructure.projectName}</span>
          </div>
        </div>
        <EvidenceProgress
          activeView={activeView}
          analysisReady={projectStructure.analysisStatus === 'SUCCESS'}
          requestReady={hasDetectedApis && hasConcreteMethod}
          traceReady={Boolean(traceDetail)}
        />
        {activeView === 'runtime' ? (
          <div className="topbar__trace-meta">
            <span><small>Trace ID</small><strong>{traceDetail?.traceId.slice(0, 8) ?? '대기'}</strong></span>
            <span><small>결과</small><strong>{getResultStatusLabel(currentResultStatus)}</strong></span>
            <span><small>상태</small><strong>{traceDisplayStatus}</strong></span>
            <span><small>이벤트</small><strong>{traceDetail?.events.length ?? 0}</strong></span>
          </div>
        ) : (
          <StatusBadge tone={projectStructure.analysisStatus === 'SUCCESS' ? 'success' : projectStructure.analysisStatus === 'FAILED' ? 'error' : 'warning'}>
            {PROJECT_STATUS_LABEL[projectStructure.analysisStatus]}
          </StatusBadge>
        )}
      </header>

      <WorkflowTabs
        activeView={activeView}
        hasDetectedApis={hasDetectedApis}
        traceAvailable={Boolean(traceDetail)}
        externalProject={analysisTarget === 'external'}
        onChange={setActiveView}
      />

      <section className={`workspace workspace--${activeView}`}>
        <aside className="left-panel control-rail">
          <div className="panel-card control-card">
            <div className="panel-header control-header">
              <div>
                <span className="section-label">
                  {activeView === 'project' ? '프로젝트 탐색' : activeView === 'api' ? 'API 선택' : 'Trace 기록'}
                </span>
                <h2>
                  {activeView === 'project' ? '프로젝트 열기' : activeView === 'api' ? apiScope === 'all' ? '전체 API' : selectedDomain.name : '최근 Trace'}
                </h2>
                <p>
                  {activeView === 'project'
                    ? 'Spring Boot 루트 폴더를 선택하세요.'
                    : activeView === 'api'
                      ? '실행하거나 확인할 endpoint를 선택하세요.'
                      : '이전 실행 기록을 다시 확인할 수 있습니다.'}
                </p>
              </div>
              <StatusBadge tone={activeView === 'project' && analysisTarget === 'external' ? 'success' : 'info'}>
                {activeView === 'project'
                  ? (analysisTarget === 'external' ? '외부 프로젝트' : '샘플')
                  : activeView === 'api'
                    ? `${visibleApis.length}개 API`
                    : `${recentTraces.length}개 기록`}
              </StatusBadge>
            </div>

            {activeView === 'project' ? (
              <section className="setup-step setup-step--project">
              <div className="setup-step__head">
                <ScanSearch size={18} aria-hidden="true" />
                <div>
                  <strong>분석할 프로젝트</strong>
                  <small>build.gradle 또는 pom.xml이 있는 폴더를 선택합니다.</small>
                </div>
              </div>

              <div className="project-path-form">
                <div className="project-path-input-row">
                  <label className="field">
                    <span>프로젝트 루트 경로</span>
                    <input
                      value={projectPath}
                      onChange={(event) => {
                        setProjectPath(event.target.value)
                        setFolderPickerState('idle')
                      }}
                      placeholder="/Users/jiwoo/Desktop/my-spring-project"
                    />
                  </label>
                  <button
                    className="folder-picker-button"
                    type="button"
                    onClick={() => void selectLocalProjectFolder()}
                    disabled={folderPickerState === 'loading' || analysisState === 'loading'}
                  >
                    <FolderOpen size={16} aria-hidden="true" />
                    {folderPickerState === 'loading' ? '선택 중' : '폴더 선택'}
                  </button>
                </div>
                <p className={`project-path-help ${folderPickerState === 'error' ? 'project-path-help--error' : ''}`}>
                  {folderPickerMessage}
                </p>
                <div className="project-primary-actions">
                  <button
                    className="analyze-button"
                    type="button"
                    onClick={() => void analyzeProjectPath()}
                    disabled={analysisState === 'loading' || !projectPath.trim()}
                  >
                    <ScanSearch size={17} aria-hidden="true" />
                    {analysisState === 'loading' ? '분석 중' : '프로젝트 분석'}
                  </button>
                  <button className="sample-project-button" type="button" onClick={() => void analyzeProjectPath('')} disabled={analysisState === 'loading'}>
                    데모 프로젝트
                  </button>
                </div>

                <div className={`analysis-summary analysis-summary--${analysisState === 'error' ? 'failed' : projectStructure.analysisStatus.toLowerCase()}`}>
                  {analysisState !== 'error' && projectStructure.analysisStatus === 'SUCCESS' ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertCircle size={18} aria-hidden="true" />}
                  <div>
                    <span>{analysisTarget === 'external' ? projectStructure.projectName : 'StackFlow 샘플'}</span>
                    <strong>
                      {analysisState === 'error'
                        ? analysisMessage
                        : projectStructure.analysisStatus === 'SUCCESS'
                          ? `도메인 ${projectStructure.domains.length}개 · API ${apiCatalog.length}개`
                          : PROJECT_STATUS_LABEL[projectStructure.analysisStatus]}
                    </strong>
                  </div>
                  {hasDetectedApis && analysisState !== 'error' ? (
                    <button type="button" onClick={() => setActiveView('api')}>
                      API 보기
                      <ArrowRight size={15} aria-hidden="true" />
                    </button>
                  ) : null}
                  <details>
                    <summary>기술 메시지</summary>
                    <p>{analysisMessage}</p>
                    <p>{projectStructure.analysisMessage}</p>
                  </details>
                </div>
              </div>

              <div className="domain-compact">
                <div className="section-row domain-compact__head">
                  <span className="section-label">도메인</span>
                  <span>{projectStructure.domains.length}개</span>
                </div>
                <div className="domain-list domain-list--compact">
                  {hasDetectedDomains ? (
                    projectStructure.domains.map((domain) => {
                      const displayMode = getDomainDisplayMode(domain, analysisTarget === 'sample')

                      return (
                        <button
                          key={domain.id}
                          type="button"
                          className={`domain-item${selectedDomainId === domain.id ? ' is-selected' : ''}`}
                          onClick={() => selectDomain(domain)}
                        >
                          <div className="domain-item__title">
                            <strong>{domain.name}</strong>
                            <small>{domain.endpoints.length}개 API</small>
                          </div>
                          {displayMode ? (
                            <span className={`domain-mode-badge domain-mode-badge--${displayMode.tone}`}>
                              {displayMode.label}
                            </span>
                          ) : null}
                          <em>{domain.controllers.map((controller) => controller.name).join(', ')}</em>
                        </button>
                      )
                    })
                  ) : (
                    <p className="empty-copy">분석 결과에서 API 도메인을 찾지 못했습니다.</p>
                  )}
                </div>
              </div>
              </section>
            ) : null}

            {activeView === 'api' ? (
              <>
                <section className="setup-step setup-step--endpoint">
              <div className="setup-step__head">
                <ChevronRight size={18} aria-hidden="true" />
                <div>
                  <strong>Endpoint 선택</strong>
                  <small>전체 API를 보거나 선택한 도메인만 좁혀서 확인합니다.</small>
                </div>
              </div>

              <div className="api-scope-control" role="group" aria-label="API 표시 범위">
                <button type="button" className={apiScope === 'all' ? 'is-active' : ''} onClick={() => setApiScope('all')}>
                  전체 API <strong>{apiCatalog.length}</strong>
                </button>
                <button type="button" className={apiScope === 'domain' ? 'is-active' : ''} onClick={() => setApiScope('domain')}>
                  {selectedDomain.name} <strong>{domainApis.length}</strong>
                </button>
              </div>

              <div className="section-row">
                <span className="section-label">API 목록</span>
                <span>{apiScope === 'all' ? `전체 ${apiCatalog.length}개` : `${selectedDomain.name} ${domainApis.length}개 · 전체 ${apiCatalog.length}개`}</span>
              </div>
              <div className="api-list api-list--catalog">
                {hasDetectedApis ? (
                  visibleApis.map((api) => (
                    <button
                      key={api.id}
                      type="button"
                      className={`api-item${selectedApi.id === api.id ? ' is-selected' : ''}`}
                      onClick={() => selectApi(api)}
                    >
                      <span className={getApiMethodBadgeClassName(api)}>{getApiMethodLabel(api)}</span>
                      <div>
                        <strong>{api.label}</strong>
                        <span>{api.pathTemplate}</span>
                        <p>{api.requestType} · {api.description}</p>
                        <span className="api-item__handler">{api.controller}.{api.handler}</span>
                        {!api.methodSpecified ? (
                          <span className="api-item__handler">정적 분석만 가능 · HTTP method 미지정</span>
                        ) : null}
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="empty-copy">요청하거나 Trace를 확인할 REST API가 없습니다.</p>
                )}
              </div>
                </section>

                <section className="setup-step setup-step--run">
              <div className="request-context-bar">
                <button type="button" onClick={() => setActiveView('project')}>
                  <ArrowLeft size={15} aria-hidden="true" />
                  프로젝트 구조
                </button>
                <span>
                  <strong>{selectedDomain.name}</strong>
                  {selectedApiMethodLabel} {selectedApi.pathTemplate}
                </span>
              </div>
              <div className="setup-step__head">
                <Send size={18} aria-hidden="true" />
                <div>
                  <strong>{runtimeSupported || externalTraceReady ? 'API 요청과 Trace 실행' : '외부 API 요청'}</strong>
                  <small>
                    {runtimeSupported
                      ? '실시간 연결을 연 뒤 선택한 API를 실행합니다.'
                      : externalTraceReady
                        ? '요청에 traceparent를 넣고 Java Agent가 보낸 실제 span을 수집합니다.'
                        : 'StackFlow backend proxy를 통해 선택한 endpoint를 호출합니다.'}
                  </small>
                </div>
              </div>

              <div className="selected-request">
                <span className={selectedApiMethodClassName}>{selectedApiMethodLabel}</span>
                <div>
                  <strong>{selectedApi.label}</strong>
                  <small>{selectedApi.pathTemplate}</small>
                  {!selectedApi.methodSpecified ? <small>HTTP method가 명시되지 않아 정적 분석만 가능합니다.</small> : null}
                </div>
                <span className={`pill pill--inline ${runtimeSupported ? 'pill--success' : 'pill--warning'}`}>
                      {runtimeModeLabel}
                </span>
              </div>

              <div className="request-form">
                {externalRunnable ? (
                  <>
                    <div className="request-block request-block--basic">
                      <div className="request-block__head">
                        <span>요청 대상</span>
                        <small>기본값은 공개 URL만 허용합니다.</small>
                      </div>
                      <label className="field">
                        <span>대상 기본 URL</span>
                        <input
                          value={targetBaseUrl}
                          onChange={(event) => setTargetBaseUrl(event.target.value)}
                          placeholder="https://api.example.com"
                        />
                      </label>
                      {selectedApi.requiresProductId ? (
                        <label className="field">
                          <span>Path variable 값</span>
                          <input value={productId} onChange={(event) => setProductId(event.target.value)} />
                        </label>
                      ) : null}
                      <details className="security-note">
                        <summary>로컬·사설 URL 요청 안내</summary>
                        <p>로컬 앱을 호출하려면 backend에서 private target 허용 설정을 켜야 합니다.</p>
                      </details>
                    </div>
                    <div className="request-options">
                      <div className="request-option-tabs" role="tablist" aria-label="요청 옵션">
                        <button type="button" role="tab" aria-selected={requestOptionTab === 'query'} className={requestOptionTab === 'query' ? 'is-active' : ''} onClick={() => setRequestOptionTab('query')}>
                          Query <span>{countEnabledEntries(queryParams)}</span>
                        </button>
                        <button type="button" role="tab" aria-selected={requestOptionTab === 'headers'} className={requestOptionTab === 'headers' ? 'is-active' : ''} onClick={() => setRequestOptionTab('headers')}>
                          Header <span>{countEnabledEntries(requestHeaders)}</span>
                        </button>
                        <button type="button" role="tab" aria-selected={requestOptionTab === 'body'} className={requestOptionTab === 'body' ? 'is-active' : ''} onClick={() => setRequestOptionTab('body')}>
                          Body <span>{bodyAllowed ? 'JSON' : '-'}</span>
                        </button>
                      </div>
                      {requestOptionTab === 'query' ? (
                        <div className="request-editor">
                          <div className="request-editor__head">
                            <span>쿼리 파라미터</span>
                            <button type="button" onClick={() => setQueryParams((current) => [...current, createRequestEntry('', '', true)])}>
                              <Plus size={14} aria-hidden="true" />
                              항목 추가
                            </button>
                          </div>
                          <div className="request-entry-list">
                            {queryParams.map((entry) => (
                              <div key={entry.id} className={`request-entry${entry.enabled ? '' : ' is-disabled'}`}>
                                <label className="entry-toggle">
                                  <input
                                    type="checkbox"
                                    checked={entry.enabled}
                                    onChange={(event) => updateQueryParam(entry.id, { enabled: event.target.checked })}
                                  />
                                  <span>{entry.enabled ? '사용' : '제외'}</span>
                                </label>
                                <input
                                  value={entry.key}
                                  onChange={(event) => updateQueryParam(entry.id, { key: event.target.value })}
                                  placeholder="key"
                                />
                                <input
                                  value={entry.value}
                                  onChange={(event) => updateQueryParam(entry.id, { value: event.target.value })}
                                  placeholder="value"
                                />
                                <button type="button" onClick={() => removeQueryParam(entry.id)} aria-label="쿼리 파라미터 삭제">
                                  <Trash2 size={14} aria-hidden="true" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {requestOptionTab === 'headers' ? (
                        <div className="request-editor">
                          <div className="request-editor__head">
                            <span>요청 헤더</span>
                            <button type="button" onClick={() => setRequestHeaders((current) => [...current, createRequestEntry('', '', true)])}>
                              <Plus size={14} aria-hidden="true" />
                              항목 추가
                            </button>
                          </div>
                          <div className="request-entry-list">
                            {requestHeaders.map((entry) => (
                              <div key={entry.id} className={`request-entry${entry.enabled ? '' : ' is-disabled'}`}>
                                <label className="entry-toggle">
                                  <input
                                    type="checkbox"
                                    checked={entry.enabled}
                                    onChange={(event) => updateRequestHeader(entry.id, { enabled: event.target.checked })}
                                  />
                                  <span>{entry.enabled ? '사용' : '제외'}</span>
                                </label>
                                <input
                                  value={entry.key}
                                  onChange={(event) => updateRequestHeader(entry.id, { key: event.target.value })}
                                  placeholder="Authorization"
                                />
                                <input
                                  value={entry.value}
                                  onChange={(event) => updateRequestHeader(entry.id, { value: event.target.value })}
                                  placeholder="Bearer token"
                                />
                                <button type="button" onClick={() => removeRequestHeader(entry.id)} aria-label="요청 헤더 삭제">
                                  <Trash2 size={14} aria-hidden="true" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {requestOptionTab === 'body' ? (
                        <label className={`field request-body-field${bodyAllowed ? '' : ' is-disabled'}`}>
                          <span>{bodyAllowed ? 'JSON 요청 본문' : '이 HTTP method는 요청 본문을 사용하지 않습니다'}</span>
                          <textarea
                            value={requestBody}
                            onChange={(event) => {
                              setRequestBody(event.target.value)
                              setRequestBodyError(null)
                            }}
                            disabled={!bodyAllowed}
                            rows={6}
                          />
                        </label>
                      ) : null}
                    </div>
                    <div className="request-preview request-preview--send">
                      <span>실행할 요청</span>
                      <div>
                        <span className={selectedApiMethodClassName}>{selectedApiMethodLabel}</span>
                        <strong>{externalTargetPreview}</strong>
                      </div>
                    </div>
                    {requestBodyError ? <p className="request-message request-message--error">{requestBodyError}</p> : null}
                  </>
                ) : null}
                {selectedApi.requiresProductId && !externalRunnable ? (
                  <label className="field">
                    <span>Product ID</span>
                    <input value={productId} onChange={(event) => setProductId(event.target.value)} />
                  </label>
                ) : null}
                {runtimeSupported ? (
                  <label className="field">
                    <span>실행 시나리오</span>
                    <select value={scenario} onChange={(event) => setScenario(event.target.value as (typeof SCENARIOS)[number]['value'])}>
                      {SCENARIOS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button className="run-button" type="button" onClick={() => void runRequest()} disabled={requestState === 'loading' || !hasDetectedApis || analyzeOnly}>
                  <Send size={17} aria-hidden="true" />
                  {requestState === 'loading'
                    ? (runtimeSupported ? 'Trace 수집 중...' : '외부 API 요청 중...')
                    : runtimeSupported
                      ? '요청 보내고 Trace 보기'
                    : externalRunnable
                        ? externalTraceReady ? '요청 보내고 Trace 보기' : '외부 API 요청'
                        : '정적 분석만 가능'}
                </button>
                <p className="request-message">{requestMessage}</p>

                <section className="request-result-panel" aria-label="API 응답">
                  <div className="section-row">
                    <div>
                      <span className="section-label">응답</span>
                      <strong>{externalRunnable ? '외부 HTTP 결과' : '실행 결과'}</strong>
                    </div>
                    <span className={`pill pill--inline pill--${((externalRunnable ? externalResponse?.resultStatus : traceDetail?.resultStatus) ?? 'idle').toLowerCase()}`}>
                      {externalRunnable
                        ? externalResponse ? `HTTP ${externalResponse.httpStatus || '-'}` : '대기'
                        : traceDetail ? `HTTP ${traceDetail.httpStatus || '-'}` : '대기'}
                    </span>
                  </div>
                  {externalRunnable ? (
                    externalResponse ? (
                      <>
                        <div className="request-result-meta">
                          <span><strong>{externalResponse.durationMs}ms</strong>소요 시간</span>
                          <span><strong>{externalResponse.contentType || '-'}</strong>Content-Type</span>
                          <span><strong>{externalResponse.traceId?.slice(0, 8) || '-'}</strong>Trace ID</span>
                        </div>
                        {externalResponse.errorMessage ? <p className="external-error">{externalResponse.errorMessage}</p> : null}
                        {formattedExternalResponseBody ? (
                          <pre className="response-body response-body--external">{formattedExternalResponseBody}</pre>
                        ) : <p className="empty-copy">대상 API가 빈 응답 본문을 반환했습니다.</p>}
                      </>
                    ) : <p className="empty-copy">대상 URL을 입력하고 요청을 보내면 여기에 응답이 표시됩니다.</p>
                  ) : formattedResponseBody ? (
                    <>
                      <div className="request-result-meta">
                        <span><strong>{traceDetail?.durationMs ?? 0}ms</strong>소요 시간</span>
                        <span><strong>{traceDetail?.events.length ?? 0}</strong>실행 이벤트</span>
                        <span><strong>{traceDetail?.traceId.slice(0, 8) ?? '-'}</strong>Trace ID</span>
                      </div>
                      <pre className="response-body response-body--external">{formattedResponseBody}</pre>
                    </>
                  ) : <p className="empty-copy">요청을 실행하면 JSON 응답이 여기에 표시됩니다.</p>}
                </section>
              </div>
                </section>
              </>
            ) : null}
          </div>

          {activeView === 'runtime' ? (
            <div className="panel-card recent-card">
            <div className="panel-header">
              <h2>최근 Trace</h2>
              <span>{recentTraces.length}</span>
            </div>
            <div className="trace-list">
              {recentTraces.length === 0 ? (
                <p className="empty-copy">아직 수집된 Trace가 없습니다.</p>
              ) : (
                recentTraces.map((trace) => (
                  <button
                    key={trace.traceId}
                    type="button"
                    className={`trace-item${traceDetail?.traceId === trace.traceId ? ' is-selected' : ''}`}
                    onClick={() => void selectTrace(trace.traceId)}
                  >
                    <div>
                      <strong>{trace.endpoint}</strong>
                      <span>{trace.traceId.slice(0, 8)}</span>
                    </div>
                    <div>
                      <span className={`pill pill--inline pill--${trace.resultStatus.toLowerCase()}`}>{EVENT_STATUS_LABEL[trace.resultStatus]}</span>
                      <span>{trace.durationMs}ms</span>
                    </div>
                  </button>
                ))
              )}
            </div>
            </div>
          ) : null}
        </aside>

        <section className="graph-panel">
          {activeView === 'project' ? (
            <div className="panel-card panel-card--map">
              <header className="project-overview-head">
                <div className="project-overview-title">
                  <span className="section-label">분석된 프로젝트</span>
                  <div>
                    <h2>{projectStructure.projectName}</h2>
                    <StatusBadge tone={projectStructure.analysisStatus === 'SUCCESS' ? 'success' : projectStructure.analysisStatus === 'FAILED' ? 'error' : 'warning'}>
                      {PROJECT_STATUS_LABEL[projectStructure.analysisStatus]}
                    </StatusBadge>
                  </div>
                  <p>
                    {projectStructure.framework} · source root {projectStructure.analysisCoverage.sourceRoots.length}개 · Java {projectStructure.analysisCoverage.scannedJavaFiles}개
                  </p>
                </div>
                <p>{projectStatusContent.headerSummary}</p>
              </header>

              <section className="project-metric-strip" aria-label="프로젝트 분석 요약">
                {projectMetrics.map((metric) => (
                  <article key={metric.id}>
                    <span className="project-metric-icon" aria-hidden="true">
                      {metric.id === 'domains' ? <Boxes size={17} /> : metric.id === 'apis' ? <Braces size={17} /> : metric.id === 'controllers' ? <Network size={17} /> : <Database size={17} />}
                    </span>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                    <small>{metric.detail}</small>
                  </article>
                ))}
              </section>

              <div className="map-board" aria-label="분석된 프로젝트 구조">
                <section className="map-column map-column--domain-detail">
                  <header className="domain-focus-head">
                    <div>
                      <span className="section-label">선택한 도메인</span>
                      <div className="domain-focus-title">
                        <strong>{hasDetectedDomains ? selectedDomain.name : '감지된 도메인 없음'}</strong>
                        {hasDetectedDomains && selectedDomainDisplayMode ? (
                          <span className={`domain-mode-badge domain-mode-badge--${selectedDomainDisplayMode.tone}`}>
                            {selectedDomainDisplayMode.label}
                          </span>
                        ) : null}
                      </div>
                      <p>{hasDetectedDomains ? getDomainDescription(selectedDomain, analysisTarget === 'sample') : projectStatusContent.headerSummary}</p>
                    </div>
                    {selectedDomain.endpoints.length > 0 ? (
                      <button className="domain-primary-action" type="button" onClick={() => setActiveView('api')}>
                        선택한 API로 요청
                        <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    ) : null}
                  </header>

                  <div className="domain-identity-strip">
                    <span>
                      <small>Controller</small>
                      <strong>{selectedDomain.controllers.map((controller) => controller.name).join(', ') || '감지되지 않음'}</strong>
                    </span>
                    <span>
                      <small>Base path</small>
                      <strong>{selectedDomain.controllers.map((controller) => controller.basePath || '/').join(' · ') || '-'}</strong>
                    </span>
                    <span>
                      <small>Endpoint</small>
                      <strong>{selectedDomain.endpoints.length}개</strong>
                    </span>
                  </div>

                  <section className="domain-structure-section" aria-label="도메인 구조 경로">
                    <div className="section-row">
                      <div>
                        <span className="section-label">구조 경로</span>
                        <strong>코드에서 감지한 주요 역할</strong>
                      </div>
                      <span>실제 실행 순서는 Trace에서 확인합니다.</span>
                    </div>
                    {domainStructurePath.length > 0 ? (
                      <div className="domain-structure-path">
                        {domainStructurePath.map((step) => (
                          <article key={step.id} className={`domain-structure-step domain-structure-step--${step.tone}`}>
                            <span>{step.label}</span>
                            <strong>{step.value}</strong>
                            <small>{step.detail}</small>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-copy">이 도메인에서 역할이 명확한 클래스를 찾지 못했습니다.</p>
                    )}
                    {supportingDomainGroups.length > 0 ? (
                      <div className="domain-supporting-groups">
                        {supportingDomainGroups.map((group) => (
                          <span key={group.id}>
                            <strong>{group.label}</strong>
                            {group.classes.length}개
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </section>

                  <div className="section-row map-endpoint-head">
                    <div>
                      <span className="section-label">감지된 API</span>
                      <strong>{selectedApiMethodLabel} {selectedApi.pathTemplate}</strong>
                    </div>
                    <span>{selectedDomain.endpoints.length}개</span>
                  </div>
                  <div className="map-endpoint-list">
                    {selectedDomain.endpoints.length > 0 ? (
                      selectedDomain.endpoints.map((endpoint) => (
                        <button
                          key={endpoint.id}
                          type="button"
                          className={`map-endpoint-card${selectedApi.id === endpoint.id ? ' is-selected' : ''}`}
                          onClick={() => {
                            setSelectedApiId(endpoint.id)
                            setExternalResponse(null)
                          }}
                        >
                          <span className={getApiMethodBadgeClassName(endpoint)}>{getApiMethodLabel(endpoint)}</span>
                          <span className="map-endpoint-card__content">
                            <strong>{endpoint.path}</strong>
                            <small>{endpoint.controller}.{endpoint.handler}</small>
                            {!endpoint.methodSpecified ? <small>정적 분석만 가능 · HTTP method 미지정</small> : null}
                          </span>
                          <ChevronRight size={16} aria-hidden="true" />
                        </button>
                      ))
                    ) : (
                      <p className="empty-copy">{projectStatusContent.emptyEndpointMessage}</p>
                    )}
                  </div>
                </section>
              </div>
            </div>
          ) : null}

          {activeView === 'api' ? (
            <div className="panel-card panel-card--api-flow">
              <details className="request-flow-disclosure">
                <summary>
                  <span>
                    <span className="section-label">보조 정보</span>
                    <strong>예상 호출 경로</strong>
                    <small>{selectedApiMethodLabel} {selectedApi.pathTemplate} · 코드 구조 기반</small>
                  </span>
                  <span>{estimatedFlow.length}단계</span>
                </summary>
                <div className="request-flow-content">
              <div className="api-flow-summary">
                <span>
                  <strong>도메인</strong>
                  {selectedDomain.name}
                </span>
                <span>
                  <strong>Handler</strong>
                  {selectedApi.controller}.{selectedApi.handler}
                </span>
                <span>
                  <strong>요청 유형</strong>
                  {selectedApi.requestType}
                </span>
                <span>
                  <strong>근거 수준</strong>
                  {hasIntegrationBoundary ? '외부 연동 경계 포함' : '코드 구조 기반 예상'}
                </span>
              </div>

              <div className="estimated-flow" aria-label="예상 API 흐름">
                {estimatedFlow.length > 0 ? (
                  estimatedFlow.map((step, index) => (
                    <article key={step.id} className="estimated-step">
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <em>{step.layer}</em>
                        <strong>{step.label}</strong>
                      </div>
                      <small>
                        {step.detail}
                        <b>{step.source}</b>
                      </small>
                    </article>
                  ))
                ) : (
                  <p className="empty-copy">REST API를 찾지 못해 예상 요청 경로를 만들 수 없습니다.</p>
                )}
              </div>

              <div className="analysis-boundary">
                <strong>
                  {runtimeSupported
                    ? '이 API는 요청 후 실제 Trace를 확인할 수 있습니다.'
                    : !selectedApi.methodSpecified
                      ? 'Handler mapping에 HTTP method가 없어 정적 분석만 제공합니다.'
                      : externalRunnable && externalTraceReady
                        ? '외부 요청에 Trace Context를 연결해 실제 span을 수집합니다.'
                        : externalRunnable
                          ? '실행 명령을 생성하고 Agent로 대상 앱을 재시작하세요.'
                      : hasIntegrationBoundary
                      ? '외부 연동 경계를 정적 분석으로 표시합니다.'
                      : '이 샘플 API는 정적 분석만 제공합니다.'}
                </strong>
                <p>
                  {runtimeSupported
                    ? '왼쪽 요청 설정에서 API를 실행하면 Trace 탭으로 이동합니다.'
                    : !selectedApi.methodSpecified
                      ? 'StackFlow는 HTTP method를 임의로 추측하지 않습니다. 소스에서 method를 확인하세요.'
                      : externalRunnable && externalTraceReady
                        ? '요청 시 traceparent를 강제로 주입하고 같은 trace ID의 OTLP span을 기다립니다.'
                        : externalRunnable
                          ? '프로젝트 구조 탭의 실행 Trace 설정에서 재실행 명령을 만들 수 있습니다.'
                      : hasIntegrationBoundary
                      ? 'Gateway와 Client는 naming과 package 구조에서 감지한 외부 호출 경계입니다.'
                      : 'Product 샘플 API를 선택하면 내장 Runtime Trace를 실행할 수 있습니다.'}
                </p>
              </div>
                </div>
              </details>
            </div>
          ) : null}

          {activeView === 'runtime' ? (
            <div className="panel-card panel-card--graph">
              <div className="graph-head">
                <div>
                  <span className="section-label">실제 실행 결과 · Runtime Trace</span>
                  <h2>{selectedDomain.name} 요청 흐름</h2>
                  <p>
                    {traceDetail
                      ? `${traceDetail.method} ${traceDetail.endpoint} · HTTP ${traceDetail.httpStatus || '-'}`
                      : runtimeSupported
                        ? `${selectedApiMethodLabel} ${selectedApi.pathTemplate} 요청을 실행하면 실제 흐름이 표시됩니다.`
                        : externalTraceReady
                          ? `${selectedApiMethodLabel} ${selectedApi.pathTemplate} 요청 후 실제 OpenTelemetry span을 표시합니다.`
                        : !selectedApi.methodSpecified
                          ? 'HTTP method가 명시되지 않아 정적 분석만 가능합니다.'
                          : '프로젝트 구조에서 Agent 실행 설정을 먼저 생성하세요.'}
                  </p>
                </div>
                <StatusBadge tone={traceDisplayTone}>
                  {traceDisplayStatus}
                </StatusBadge>
              </div>

              {!traceDetail ? (
                <div className="trace-empty-state">
                  <Route size={34} aria-hidden="true" />
                  <strong>먼저 API 요청을 실행하세요</strong>
                  <p>{analysisTarget === 'external' ? 'Agent로 대상 앱을 재시작한 뒤 API 요청을 보내면 실제 부모·자식 span을 확인할 수 있습니다.' : '실행 가능한 Product API를 보내면 Controller부터 Response까지 실제 호출 경로를 확인할 수 있습니다.'}</p>
                  <button type="button" onClick={() => setActiveView('api')}>
                    API 요청으로 이동
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <>
              <div className="graph-context" aria-label="현재 Trace 정보">
                <span>
                  <strong>도메인</strong>
                  {selectedDomain.name}
                </span>
                <span>
                  <strong>{traceDetail.source === 'OPENTELEMETRY' ? 'Service' : 'Controller'}</strong>
                  {traceDetail.source === 'OPENTELEMETRY' ? traceDetail.serviceName ?? '-' : selectedApi.controller}
                </span>
                <span>
                  <strong>Endpoint</strong>
                  {traceDetail.method} {traceDetail.endpoint}
                </span>
                <span>
                  <strong>확인 목표</strong>
                  첫 실패 지점 찾기
                </span>
              </div>

              {primaryFailureEvent ? (
                <section className="trace-failure-summary" aria-label="첫 실패 지점">
                  <AlertCircle size={18} aria-hidden="true" />
                  <div>
                    <span>첫 실패 지점</span>
                    <strong>{primaryFailureLabel} · {primaryFailureEvent.errorType ?? EVENT_STATUS_LABEL[primaryFailureEvent.status]}</strong>
                    <p>{primaryFailureEvent.errorMessage ?? `${primaryFailureEvent.eventType} 실행 중 실패했습니다.`}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedNodeId(primaryFailureNodeId)}>
                    상세 보기
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                </section>
              ) : null}

              <div className="trace-view-tabs" role="tablist" aria-label="Trace 보기 방식">
                <button type="button" role="tab" aria-selected={traceViewTab === 'timeline'} className={traceViewTab === 'timeline' ? 'is-active' : ''} onClick={() => setTraceViewTab('timeline')}>
                  타임라인
                </button>
                <button type="button" role="tab" aria-selected={traceViewTab === 'graph'} className={traceViewTab === 'graph' ? 'is-active' : ''} onClick={() => setTraceViewTab('graph')}>
                  그래프
                </button>
                <button type="button" role="tab" aria-selected={traceViewTab === 'events'} className={traceViewTab === 'events' ? 'is-active' : ''} onClick={() => setTraceViewTab('events')}>
                  이벤트 <span>{traceDetail.events.length}</span>
                </button>
              </div>

              {traceViewTab === 'timeline' ? (
                <TraceWaterfall
                  model={waterfall}
                  selectedSpanId={selectedNode?.id ?? null}
                  onSelectSpan={setSelectedNodeId}
                />
              ) : null}

              {traceViewTab === 'graph' ? (
                <>
              {traceComparison ? (
                <section className="trace-comparison" aria-label="예상 흐름과 실제 Trace 비교">
                  <div>
                    <span className="section-label">정적 예상 단계</span>
                    {traceComparison.expected.map((item) => (
                      <p key={item.id} className={item.matched ? 'is-matched' : 'is-missing'}>
                        <strong>{item.label}</strong>
                        <span>{item.matched ? '실제 호출 확인' : '실행되지 않은 예상 단계'}</span>
                      </p>
                    ))}
                  </div>
                  <div>
                    <span className="section-label">실제 OpenTelemetry span</span>
                    {traceComparison.actual.map((item) => (
                      <p key={item.id} className={item.expected ? 'is-matched' : 'is-unexpected'}>
                        <strong>{item.label}</strong>
                        <span>{item.expected ? '예상 흐름과 일치' : '예상에 없던 실제 호출'}</span>
                      </p>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className={`flow-route${traceDetail.source === 'OPENTELEMETRY' ? ' flow-route--spans' : ''}`}>
                {graph.states.map((state) => (
                  <button
                    key={state.id}
                    type="button"
                    className={`route-step route-step--${state.status.toLowerCase()}${state.active ? ' is-active' : ''}${selectedNode?.id === state.id ? ' is-selected' : ''}`}
                    onClick={() => setSelectedNodeId(state.id)}
                  >
                    <span>{state.label}</span>
                    <strong>{state.active ? `${state.durationMs}ms` : '대기'}</strong>
                  </button>
                ))}
              </div>

              <div className="graph-toolbar">
                <div>
                  <span>{traceDetail.events.length}개 실행 이벤트</span>
                  <strong>{activeRoute.length > 0 ? activeRoute.map((state) => state.label).join(' → ') : '실행된 경로가 없습니다'}</strong>
                </div>
                <div className="legend-strip" aria-label="그래프 상태 범례">
                  <span className="legend-chip legend-chip--success">성공</span>
                  <span className="legend-chip legend-chip--warning">주의</span>
                  <span className="legend-chip legend-chip--error">실패</span>
                  <span className="legend-chip legend-chip--idle">대기</span>
                </div>
              </div>

              <div className="graph-surface">
                {traceDetail.source === 'SAMPLE' ? (
                  <div className="graph-lanes" aria-hidden="true">
                    <span>client</span>
                    <span>application</span>
                    <span>cache</span>
                    <span>data</span>
                    <span>response</span>
                  </div>
                ) : null}
                <ReactFlow
                  key={traceDetail?.traceId ?? 'empty-flow'}
                  fitView
                  fitViewOptions={{ padding: 0.16 }}
                  onInit={(instance) => {
                    flowInstanceRef.current = instance
                    window.requestAnimationFrame(() => {
                      instance.fitView({ padding: 0.14, duration: 120, includeHiddenNodes: true })
                    })
                    window.setTimeout(() => {
                      instance.fitView({ padding: 0.14, duration: 0, includeHiddenNodes: true })
                    }, 180)
                  }}
                  nodes={graph.nodes}
                  edges={graph.edges}
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  nodesConnectable={false}
                  nodesDraggable={false}
                  elementsSelectable
                  minZoom={0.35}
                  maxZoom={1.35}
                  proOptions={{ hideAttribution: true }}
                >
                  <Controls showInteractive={false} />
                  <Background gap={20} size={1} />
                </ReactFlow>
              </div>
                </>
              ) : null}

              {traceViewTab === 'events' ? (
                <section className="trace-event-table" aria-label="시간순 Trace 이벤트">
                  <header>
                    <span>시작</span>
                    <span>Span</span>
                    <span>구성 요소</span>
                    <span>소요 시간</span>
                    <span>상태</span>
                  </header>
                  {orderedTraceEvents.map((event) => (
                    <button
                      key={event.eventId}
                      type="button"
                      className={selectedNode?.id === (event.spanId ?? event.component) ? 'is-selected' : ''}
                      onClick={() => setSelectedNodeId(event.spanId ?? event.component)}
                    >
                      <span>{new Date(event.startedAt).toLocaleTimeString('ko-KR', { hour12: false, fractionalSecondDigits: 3 })}</span>
                      <strong>{event.eventType}</strong>
                      <span>{event.component}</span>
                      <span>{event.durationMs}ms</span>
                      <StatusBadge tone={event.status === 'SUCCESS' ? 'success' : event.status === 'WARNING' ? 'warning' : 'error'}>
                        {EVENT_STATUS_LABEL[event.status]}
                      </StatusBadge>
                    </button>
                  ))}
                </section>
              ) : null}
                </>
              )}
            </div>
          ) : null}
        </section>

        <aside className="right-panel inspector-rail">
          {activeView === 'project' ? (
            <div className="panel-card inspector-workbench">
              <div className="panel-header">
                <div>
                  <span className="section-label">상세 정보</span>
                  <h2>분석 근거</h2>
                  <p>{hasDetectedDomains ? `${selectedDomain.name} 도메인에 연결된 코드 근거입니다.` : projectStatusContent.headerSummary}</p>
                </div>
                <StatusBadge tone="neutral">{hasDetectedDomains ? selectedDomain.name : projectStructure.projectName}</StatusBadge>
              </div>
              <div className="evidence-scope-strip">
                <span><strong>{selectedDomain.layers.flatMap((layer) => layer.classes).length}</strong>개 클래스</span>
                <span><strong>{selectedDomain.infrastructure.length}</strong>개 인프라</span>
              </div>

              {analysisTarget === 'external' && projectStructure.analysisStatus === 'SUCCESS' ? (
                <details className="inspector-disclosure">
                  <summary>
                    <span>
                      <strong>실행 Trace 설정</strong>
                      <small>Java Agent 재실행 명령</small>
                    </span>
                    <StatusBadge tone={instrumentationProfile ? 'success' : profileState === 'error' ? 'error' : 'neutral'}>
                      {instrumentationProfile ? '명령 생성 완료' : 'Agent 설정 필요'}
                    </StatusBadge>
                  </summary>
                  <div className="instrumentation-setup">
                    <p className="instrumentation-setup__intro">
                      소스 수정 없이 Java Agent로 대상 앱을 재시작합니다.
                    </p>
                    <label className="field">
                      <span>OpenTelemetry Java Agent JAR</span>
                      <input value={agentPath} onChange={(event) => setAgentPath(event.target.value)} />
                    </label>
                    <label className="field">
                      <span>StackFlow 수집 주소</span>
                      <input value={collectorBaseUrl} onChange={(event) => setCollectorBaseUrl(event.target.value)} />
                    </label>
                    <div className="instrumentation-setup__actions">
                      <button type="button" onClick={() => void generateInstrumentationProfile()} disabled={profileState === 'loading'}>
                        <ScanSearch size={15} aria-hidden="true" />
                        {profileState === 'loading' ? '설정 생성 중' : '실행 명령 생성'}
                      </button>
                      <a href="https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases" target="_blank" rel="noreferrer">
                        공식 Agent 다운로드
                      </a>
                    </div>
                    <p className={profileState === 'error' ? 'external-error' : 'empty-copy'}>{profileMessage}</p>
                    {instrumentationProfile && instrumentationCommand ? (
                      <div className="instrumentation-profile">
                        <div className="evidence-grid">
                          <span><strong>Build</strong>{instrumentationProfile.buildTool}</span>
                          <span><strong>계측 클래스</strong>{instrumentationProfile.instrumentedClasses.length}개</span>
                          <span><strong>public method</strong>{instrumentationProfile.instrumentedMethodCount}개</span>
                        </div>
                        <pre className="instrumentation-command">{instrumentationCommand}</pre>
                        <details>
                          <summary>계측 대상과 환경 변수 보기</summary>
                          <p>{instrumentationProfile.instrumentedClasses.join('\n') || '추가 method 계측 대상 없음'}</p>
                          <pre className="instrumentation-command">{Object.entries(instrumentationProfile.environment).map(([key, value]) => `${key}=${value}`).join('\n')}</pre>
                        </details>
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}

              <details className="inspector-disclosure">
                <summary>
                  <span><strong>클래스 근거</strong><small>역할별로 분류된 코드</small></span>
                  <strong>{selectedDomain.layers.flatMap((layer) => layer.classes).length}개</strong>
                </summary>
                <LayerEvidenceList groups={domainLayerGroups} emptyMessage="이 도메인에 확실히 연결된 클래스가 없습니다." />
              </details>

              <details className="inspector-disclosure project-common-evidence">
                <summary>
                  <span><strong>프로젝트 공통 클래스</strong><small>도메인 미귀속 근거</small></span>
                  <strong>{commonClassCount}개</strong>
                </summary>
                <p>특정 도메인 관계가 확실하지 않은 클래스입니다.</p>
                <LayerEvidenceList groups={commonLayerGroups} emptyMessage="도메인 밖에 남은 공통 클래스가 없습니다." />
              </details>

              <details className="inspector-disclosure coverage-evidence">
                <summary>
                  <span>
                    <strong>분석 범위와 누락 가능성</strong>
                    <small>source root {projectStructure.analysisCoverage.sourceRoots.length}개 · Java {projectStructure.analysisCoverage.scannedJavaFiles}개</small>
                  </span>
                  <StatusBadge tone={projectStructure.analysisCoverage.warnings.length > 0 ? 'warning' : 'success'}>
                    {projectStructure.analysisCoverage.warnings.length > 0 ? `경고 ${projectStructure.analysisCoverage.warnings.length}개` : '경고 없음'}
                  </StatusBadge>
                </summary>
                <div className="coverage-evidence__body">
                  <div className="coverage-metrics" aria-label="분석 범위 수치">
                    <span><strong>{projectStructure.analysisCoverage.scannedJavaFiles}</strong>Java 파일</span>
                    <span><strong>{projectStructure.analysisCoverage.controllerCandidates}</strong>Controller 후보</span>
                    <span><strong>{projectStructure.analysisCoverage.detectedControllers}</strong>감지 Controller</span>
                    <span><strong>{projectStructure.analysisCoverage.detectedEndpoints}</strong>감지 API</span>
                  </div>
                  <div className="coverage-source-roots">
                    <strong>탐색한 source root</strong>
                    {projectStructure.analysisCoverage.sourceRoots.length > 0 ? (
                      <ul>{projectStructure.analysisCoverage.sourceRoots.map((root) => <li key={root}>{root}</li>)}</ul>
                    ) : <p>감지된 Java source root가 없습니다.</p>}
                  </div>
                  {projectStructure.analysisCoverage.warnings.length > 0 ? (
                    <div className="coverage-warnings">
                      <strong>누락 가능성</strong>
                      <ul>{projectStructure.analysisCoverage.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                    </div>
                  ) : <p className="coverage-complete">현재 지원 범위에서 별도 경고가 없습니다.</p>}
                </div>
              </details>

              <details className="inspector-disclosure source-evidence">
                <summary><span><strong>소스 분석 근거</strong><small>경로·패키지·탐지 규칙</small></span></summary>
                <dl>
                  <div><dt>프로젝트</dt><dd>{projectStructure.projectName} · {projectStructure.framework}</dd></div>
                  <div><dt>소스 루트</dt><dd>{projectStructure.sourceRoot || '-'}</dd></div>
                  <div><dt>소스 파일</dt><dd>{selectedDomain.controllers.map((controller) => controller.sourceFile).join(' / ') || '-'}</dd></div>
                  <div><dt>패키지</dt><dd>{selectedDomain.packageRoots.join(' / ') || '-'}</dd></div>
                  <div><dt>Layer 근거</dt><dd>{selectedDomain.layers.map((layer) => layer.evidence).join(' / ') || '-'}</dd></div>
                  <div><dt>Infra 근거</dt><dd>{selectedDomain.infrastructureDetails.map((item) => `${item.name}: ${item.evidence}`).join(' / ') || '-'}</dd></div>
                </dl>
              </details>
            </div>
          ) : null}

          {activeView === 'api' ? (
            <div className="panel-card inspector-workbench">
              <div className="panel-header">
                <div>
                  <span className="section-label">선택한 API 근거</span>
                  <h2>{selectedApi.label}</h2>
                  <p>{selectedApi.description}</p>
                </div>
                <span className={`pill pill--inline ${runtimeSupported ? 'pill--success' : 'pill--warning'}`}>
                  {runtimeModeLabel}
                </span>
              </div>
              <div className="insight-list">
                <article>
                  <span>Handler</span>
                  <strong>{selectedApi.controller}.{selectedApi.handler}</strong>
                  <p>{selectedApiMethodLabel} {selectedApi.pathTemplate}</p>
                </article>
                <article>
                  <span>예상 경로</span>
                  <strong>{estimatedFlow.map((step) => step.label).join(' → ')}</strong>
                  <p>{hasIntegrationBoundary ? 'UseCase, Gateway, Client를 분리해 외부 연동 경계를 표시합니다.' : '감지된 domain layer의 클래스 이름을 기준으로 구성합니다.'}</p>
                </article>
                <article>
                  <span>실행 가능 범위</span>
                  <strong>{runtimeSupported || externalTraceReady ? '실제 Trace 가능' : !selectedApi.methodSpecified ? '정적 분석만 가능' : externalRunnable ? 'Agent 설정 필요' : hasIntegrationBoundary ? '외부 연동 구조만 표시' : '정적 분석만 가능'}</strong>
                  <p>{runtimeSupported ? '요청을 실행하면 Trace 탭에서 실제 흐름을 확인할 수 있습니다.' : externalTraceReady ? 'traceparent와 OTLP로 외부 앱의 실제 span을 연결합니다.' : !selectedApi.methodSpecified ? 'Controller method에 HTTP verb가 명시되지 않았습니다.' : externalRunnable ? '프로젝트 구조에서 실행 명령을 생성하고 대상 앱을 재시작하세요.' : hasIntegrationBoundary ? '이 샘플 API는 연동 계층을 정적으로 설명합니다.' : '이 API는 현재 정적 분석만 제공합니다.'}</p>
                </article>
              </div>
              {externalRunnable ? (
                <section className="inspector-section response-card external-response-card">
                  <div className="section-row">
                    <span className="section-label">외부 HTTP 결과</span>
                    <span className={`pill pill--inline pill--${(externalResponse?.resultStatus ?? 'idle').toLowerCase()}`}>
                      {externalResponse ? `HTTP ${externalResponse.httpStatus || '-'}` : '대기'}
                    </span>
                  </div>
                  {externalResponse ? (
                    <>
                      <article className="evidence-block evidence-block--request">
                        <header>
                          <span>보낸 요청</span>
                          <strong>{externalRequestSnapshot?.method ?? (selectedApi.methodSpecified ? selectedApi.method : selectedApiMethodLabel)}</strong>
                        </header>
                        <p>{externalRequestSnapshot?.targetUrl ?? externalTargetPreview}</p>
                        <div className="evidence-grid">
                          <span>
                            <strong>Query</strong>
                            {countEnabledEntries(externalRequestSnapshot?.queryParams ?? [])}
                          </span>
                          <span>
                            <strong>Header</strong>
                            {countEnabledEntries(externalRequestSnapshot?.headers ?? [])}
                          </span>
                          <span>
                            <strong>Body</strong>
                            {externalRequestSnapshot?.requestBody ? '사용' : '없음'}
                          </span>
                        </div>
                      </article>
                      <article className="evidence-block evidence-block--response">
                        <header>
                          <span>받은 응답</span>
                          <strong>HTTP {externalResponse.httpStatus || '-'}</strong>
                        </header>
                        <div className="evidence-grid">
                          <span>
                            <strong>소요 시간</strong>
                            {externalResponse.durationMs}ms
                          </span>
                          <span>
                            <strong>Content-Type</strong>
                            {externalResponse.contentType || '-'}
                          </span>
                          {externalResponse.traceId ? (
                            <span>
                              <strong>Trace</strong>
                              {externalResponse.traceId.slice(0, 8)} · {TRACE_COLLECTION_STATUS_LABEL[traceCollectionStatus]}
                            </span>
                          ) : null}
                        </div>
                      </article>
                      {externalResponse.errorMessage ? (
                        <p className="external-error">{externalResponse.errorMessage}</p>
                      ) : null}
                      {formattedExternalResponseBody ? (
                        <pre className="response-body response-body--external">{formattedExternalResponseBody}</pre>
                      ) : (
                        <p className="empty-copy">대상 API가 빈 응답 본문을 반환했습니다.</p>
                      )}
                    </>
                  ) : (
                    <p className="empty-copy">대상 기본 URL을 입력하고 요청을 실행하면 응답을 확인할 수 있습니다.</p>
                  )}
                </section>
              ) : null}
              {!externalRunnable ? (
                <section className="inspector-section response-card external-response-card">
                  <div className="section-row">
                    <span className="section-label">응답</span>
                    <span className={`pill pill--inline pill--${(traceDetail?.resultStatus ?? 'idle').toLowerCase()}`}>
                      {traceDetail ? `HTTP ${traceDetail.httpStatus || '-'}` : '대기'}
                    </span>
                  </div>
                  {formattedResponseBody ? (
                    <>
                      <article className="evidence-block evidence-block--response">
                        <header>
                          <span>받은 응답</span>
                          <strong>{traceDetail?.durationMs ?? 0}ms</strong>
                        </header>
                        <div className="evidence-grid">
                          <span>
                            <strong>Trace</strong>
                            {traceDetail?.traceId.slice(0, 8) ?? '-'}
                          </span>
                          <span>
                            <strong>이벤트</strong>
                            {traceDetail?.events.length ?? 0}
                          </span>
                          <span>
                            <strong>결과</strong>
                            {traceDetail ? EVENT_STATUS_LABEL[traceDetail.resultStatus] : '대기'}
                          </span>
                        </div>
                      </article>
                      <pre className="response-body response-body--external">{formattedResponseBody}</pre>
                    </>
                  ) : (
                    <p className="empty-copy">선택한 API를 실행하면 JSON 응답이 표시됩니다.</p>
                  )}
                </section>
              ) : null}
            </div>
          ) : null}

          {activeView === 'runtime' ? (
            <>
              <div className="panel-card inspector-workbench">
                <div className="panel-header">
                  <div>
                    <span className="section-label">실행 근거</span>
                    <h2>{inspectorEvent ? inspectorEvent.component : 'Trace 대기'}</h2>
                    <p>{inspectorEvent ? inspectorEvent.eventType : 'API 요청을 실행한 뒤 그래프 node를 선택하세요.'}</p>
                  </div>
                  <span className={`pill pill--inline pill--${(traceDetail?.resultStatus ?? 'success').toLowerCase()}`}>
                    HTTP {traceDetail?.httpStatus || '-'}
                  </span>
                </div>

                <div className="runtime-meter runtime-meter--compact">
                  <span>{traceDetail ? `${traceDetail.durationMs}ms` : '0ms'}</span>
                  <span>{activeNodeCount}개 활성 node</span>
                </div>

                <section className="inspector-section response-card">
                  <div className="section-row">
                    <span className="section-label">응답 JSON</span>
                    <span>{traceDetail ? EVENT_STATUS_LABEL[traceDetail.resultStatus] : '대기'}</span>
                  </div>
                  {formattedResponseBody ? (
                    <pre className="response-body">{formattedResponseBody}</pre>
                  ) : (
                    <p className="empty-copy">요청을 실행하면 응답 본문이 표시됩니다.</p>
                  )}
                </section>

                <section className="inspector-section inspector-card">
                  <div className="section-row">
                    <span className="section-label">선택한 node 근거</span>
                    {selectedNode ? (
                      <span className={`pill pill--inline pill--${selectedNode.status.toLowerCase()}`}>
                        {EVENT_STATUS_LABEL[selectedNode.status]}
                      </span>
                    ) : null}
                  </div>
                  {!selectedNode ? (
                    <p className="empty-copy">그래프에서 확인할 실행 node를 선택하세요.</p>
                  ) : (
                    <div className="detail-stack">
                      <div className="detail-summary">
                        <strong>{selectedNode.label}</strong>
                        <span>총 {selectedNode.durationMs}ms</span>
                      </div>
                      <div className="detail-grid">
                        <div>
                          <span>Trace ID</span>
                          <strong>{traceDetail?.traceId ?? '-'}</strong>
                        </div>
                        <div>
                          <span>호출 횟수</span>
                          <strong>{selectedNode.visits.length}</strong>
                        </div>
                      </div>
                      <div className="visit-list">
                        {selectedNode.visits.length === 0 ? (
                          <p className="empty-copy">현재 Trace에서 이 node는 호출되지 않았습니다.</p>
                        ) : (
                          selectedNode.visits.map((event) => (
                            <article key={event.eventId} className="visit-card">
                              <header>
                                <strong>{event.eventType}</strong>
                                <span className={`pill pill--inline pill--${event.status.toLowerCase()}`}>{EVENT_STATUS_LABEL[event.status]}</span>
                              </header>
                              <dl>
                                <div>
                                  <dt>소요 시간</dt>
                                  <dd>{event.durationMs}ms</dd>
                                </div>
                                <div>
                                  <dt>오류 유형</dt>
                                  <dd>{event.errorType ?? '-'}</dd>
                                </div>
                                <div>
                                  <dt>오류 메시지</dt>
                                  <dd>{event.errorMessage ?? '-'}</dd>
                                </div>
                                {event.spanId ? (
                                  <div>
                                    <dt>Span / Parent</dt>
                                    <dd>{event.spanId} / {event.parentSpanId ?? 'root'}</dd>
                                  </div>
                                ) : null}
                                {event.serviceName ? (
                                  <div>
                                    <dt>Service / Kind</dt>
                                    <dd>{event.serviceName} / {event.spanKind ?? '-'}</dd>
                                  </div>
                                ) : null}
                              </dl>
                              <div className="metadata-list">
                                {Object.keys(event.metadata).length === 0 ? (
                                  <span className="metadata-item">metadata 없음</span>
                                ) : (
                                  Object.entries(event.metadata).map(([key, value]) => (
                                    <span key={key} className="metadata-item">
                                      {key}: {value}
                                    </span>
                                  ))
                                )}
                              </div>
                            </article>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </section>
              </div>

              <div className="panel-card timeline-card timeline-card--compact">
                <div className="panel-header">
                  <div>
                    <h2>실행 이벤트</h2>
                    <p>발생 시간순으로 표시합니다.</p>
                  </div>
                  <span>{recentEvents.length}</span>
                </div>
                <div className="timeline-list">
                {recentEvents.length === 0 ? (
                  <p className="empty-copy">아직 수집된 실행 이벤트가 없습니다.</p>
                ) : (
                  recentEvents.map((event, index) => (
                    <article key={event.eventId} className="timeline-item">
                      <div className="timeline-item__marker">
                        <span>{index + 1}</span>
                      </div>
                      <div className="timeline-item__body">
                        <header>
                          <strong>{event.component}</strong>
                          <span className={`pill pill--inline pill--${event.status.toLowerCase()}`}>{EVENT_STATUS_LABEL[event.status]}</span>
                        </header>
                        <p>{event.eventType}</p>
                        <div className="timeline-item__meta">
                          <span>{event.durationMs}ms</span>
                          <span>{new Date(event.startedAt).toLocaleTimeString()}</span>
                          <span>{event.errorType ?? '오류 없음'}</span>
                        </div>
                      </div>
                    </article>
                  ))
                )}
                </div>
              </div>
            </>
          ) : null}
        </aside>
      </section>
    </main>
  )
}

function LayerEvidenceList({ groups, emptyMessage }: { groups: LayerGroup[]; emptyMessage: string }) {
  const populatedGroups = groups.filter((group) => group.classes.length > 0)

  if (populatedGroups.length === 0) {
    return <p className="empty-copy">{emptyMessage}</p>
  }

  return (
    <div className="layer-evidence-list">
      {populatedGroups.map((group) => {
        const previewClasses = group.classes.slice(0, 5)
        const remainingClasses = group.classes.slice(5)

        return (
          <details key={group.id} className="layer-evidence-group">
            <summary>
              <span>{group.label}</span>
              <strong>{group.classes.length}</strong>
            </summary>
            <small>{group.layerNames.join(' · ')}</small>
            <div className="layer-class-list">
              {previewClasses.map((className) => <code key={className}>{className}</code>)}
            </div>
            {remainingClasses.length > 0 ? (
              <details className="layer-evidence-more">
                <summary>{remainingClasses.length}개 더 보기</summary>
                <div className="layer-class-list">
                  {remainingClasses.map((className) => <code key={className}>{className}</code>)}
                </div>
              </details>
            ) : null}
          </details>
        )
      })}
    </div>
  )
}

function flattenProjectApis(structure: ProjectStructure): ApiDefinition[] {
  return structure.domains.flatMap((domain) =>
    domain.endpoints.map((endpoint) => toApiDefinition(endpoint, domain.id, domain.name)),
  )
}

function toApiDefinition(item: ApiCatalogItem, domainId: string, domainName: string): ApiDefinition {
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

function buildProjectMetrics(structure: ProjectStructure) {
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

function buildDomainStructurePath(groups: LayerGroup[], infrastructure: string[]): DomainStructureStep[] {
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

function summarizeClassNames(classes: string[]) {
  if (classes.length <= 2) return classes.join(' · ')
  return `${classes.slice(0, 2).join(' · ')} 외 ${classes.length - 2}개`
}

function buildCommonProjectLayers(structure: ProjectStructure): ProjectLayer[] {
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

function groupProjectLayers(layers: ProjectLayer[]): LayerGroup[] {
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

function getLayerGroupId(layerName: string): LayerGroup['id'] {
  if (layerName === 'Controller') return 'entry'
  if (layerName === 'UseCase' || layerName === 'Service') return 'business'
  if (layerName === 'Repository' || layerName === 'Store' || layerName === 'Cache') return 'data'
  if (layerName === 'Gateway' || layerName === 'Client') return 'integration'
  if (layerName === 'Domain' || layerName === 'DTO') return 'model'
  return 'support'
}

function getDomainDisplayMode(domain: ProjectDomain, isSampleProject = true): DomainDisplayMode {
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

function getDomainDescription(domain: ProjectDomain, isSampleProject = true) {
  const displayMode = getDomainDisplayMode(domain, isSampleProject)
  if (displayMode?.tone === 'runtime') {
    return `${domain.name} API의 실제 요청 경로와 cache·data 흐름을 확인합니다.`
  }
  if (displayMode?.tone === 'integration') {
    return `${domain.name} API와 Gateway·Client 외부 연동 경계를 확인합니다.`
  }
  return `${domain.name} 도메인에서 감지한 API와 layer 구조를 확인합니다.`
}

function buildEstimatedFlow(api: ApiDefinition, domain: ProjectDomain): EstimatedFlowStep[] {
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

function compareEstimatedAndActualFlow(estimatedFlow: EstimatedFlowStep[], events: TraceEvent[]) {
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

function matchesEstimatedStep(step: EstimatedFlowStep, event: TraceEvent) {
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

function pickLayerClass(domain: ProjectDomain, layerName: string, api: ApiDefinition) {
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

function isConcreteMethodApi(api: ApiDefinition): api is ApiDefinition & { method: HttpMethod; methodSpecified: true } {
  return api.methodSpecified && api.method !== 'UNSPECIFIED'
}

function getApiMethodLabel(api: ApiMethodLike) {
  return api.methodSpecified ? api.method : 'N/A'
}

function getApiMethodBadgeClassName(api: ApiMethodLike) {
  if (!api.methodSpecified) {
    return 'method-badge method-badge--unspecified'
  }

  return `method-badge method-badge--${api.method.toLowerCase()}`
}

function stripLayerSuffix(className: string) {
  return className.replace(/(Controller|RepositoryService|Repository|CacheService|CatalogStore|Service|Store|Response)$/u, '')
}

function isStackFlowRuntimeApi(api: ApiDefinition) {
  return api.controller === 'ProductController' && api.pathTemplate.startsWith('/api/products')
}

function buildPathFromTemplate(pathTemplate: string, pathVariableValue: string) {
  return pathTemplate.replaceAll(/\{[^}/]+}/g, encodeURIComponent(pathVariableValue))
}

function humanizeHandler(handler: string) {
  return handler
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (first) => first.toUpperCase())
}

function createPlaceholderTrace(
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
  }
}

async function fetchTraceWithRetry(traceId: string) {
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

function buildRequestMessage(resultStatus: EventStatus, payload: ProductPayload) {
  if (payload.errorMessage) {
    return `${EVENT_STATUS_LABEL[resultStatus]}: ${payload.errorMessage}`
  }

  if (payload.cacheStatus) {
    return `${EVENT_STATUS_LABEL[resultStatus]}: cache ${payload.cacheStatus}를 포함한 상품 흐름을 수집했습니다.`
  }

  return `${EVENT_STATUS_LABEL[resultStatus]}: 요청 흐름을 수집했습니다.`
}

function buildExternalRequestMessage(response: ExternalRequestResponse) {
  if (response.errorMessage) {
    return `실패: ${response.errorMessage}`
  }

  return `${response.method} ${response.targetUrl} · HTTP ${response.httpStatus} · ${response.durationMs}ms`
}

function createRequestEntry(key: string, value: string, enabled: boolean): ExternalRequestEntry {
  return {
    id: crypto.randomUUID(),
    key,
    value,
    enabled,
  }
}

function updateRequestEntries(
  entries: ExternalRequestEntry[],
  id: string,
  patch: Partial<ExternalRequestEntry>,
) {
  return entries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry)
}

function removeRequestEntry(entries: ExternalRequestEntry[], id: string) {
  if (entries.length <= 1) {
    return entries.map((entry) => entry.id === id ? { ...entry, key: '', value: '', enabled: false } : entry)
  }

  return entries.filter((entry) => entry.id !== id)
}

function toEnabledEntries(entries: ExternalRequestEntry[]) {
  return entries
    .filter((entry) => entry.enabled && entry.key.trim())
    .map((entry) => ({
      key: entry.key.trim(),
      value: entry.value,
      enabled: true,
    }))
}

function countEnabledEntries(entries: ExternalRequestEntry[]) {
  return toEnabledEntries(entries).length
}

function buildExternalTargetPreview(targetBaseUrl: string, path: string, queryParams: ExternalRequestEntry[]) {
  const normalizedBase = targetBaseUrl.trim().replace(/\/+$/u, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const search = new URLSearchParams()

  toEnabledEntries(queryParams).forEach((entry) => {
    search.append(entry.key, entry.value)
  })

  const queryString = search.toString()
  return `${normalizedBase || 'https://api.example.com'}${normalizedPath}${queryString ? `?${queryString}` : ''}`
}

function formatResponseBody(responseBody: string) {
  if (!responseBody) {
    return ''
  }

  try {
    return JSON.stringify(JSON.parse(responseBody), null, 2)
  } catch {
    return responseBody
  }
}

function parseResponseBody(responseBody: string): unknown {
  if (!responseBody) {
    return null
  }

  try {
    return JSON.parse(responseBody)
  } catch {
    return responseBody
  }
}

export default App
