import { useEffect, useMemo, useRef, useState, startTransition } from 'react'
import type { ChangeEvent } from 'react'
import { Background, Controls, ReactFlow } from '@xyflow/react'
import type { ReactFlowInstance } from '@xyflow/react'
import './App.css'
import { buildGraph, getNodeDetail } from './lib/graph'
import type {
  ApiCatalogItem,
  ApiMethod,
  EventStatus,
  ExternalRequestEntry,
  ExternalRequestResponse,
  HttpMethod,
  ProjectAnalysisStatus,
  ProductPayload,
  ProjectDomain,
  ProjectStructure,
  TraceDetail,
  TraceEvent,
  TraceSessionResponse,
  TraceStartedEvent,
  TraceSummary,
  TraceTerminalEvent,
} from './types/trace'

const SCENARIOS = [
  { value: 'normal', label: 'Normal' },
  { value: 'redis-down', label: 'Redis Down' },
  { value: 'db-timeout', label: 'DB Timeout' },
  { value: 'service-error', label: 'Service Error' },
] as const

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

type ViewMode = 'project' | 'api' | 'runtime'

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

type SelectedFolderInfo = {
  name: string
  fileCount: number
  sampleFiles: string[]
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

type ApiMethodLike = {
  method: ApiMethod
  methodSpecified: boolean
}

const EMPTY_DOMAIN: ProjectDomain = {
  id: 'empty',
  name: 'No domain detected',
  description: 'Static analysis completed without a usable API domain.',
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
  label: 'No API detected',
  pathTemplate: '/',
  description: 'Analyze a Spring Boot project with REST controllers to populate this view.',
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
    headerSummary: 'Analysis completed. Review the detected map here, then move to Request to inspect one API.',
    nextStepTitle: 'Review detected APIs, then move to Request.',
    nextStepDetail: 'Pick a detected domain or endpoint, confirm the estimated flow, and continue in Request when you are ready to execute one API.',
    emptyDomainMessage: 'Analysis completed, but no grouped domain is available to show in this panel.',
    emptyEndpointMessage: 'Analysis completed, but no endpoint evidence is available for the selected domain.',
  },
  EMPTY: {
    headerSummary: 'Project files were read successfully, but no REST API mappings were detected.',
    nextStepTitle: 'Check controller annotations, package layout, and naming conventions.',
    nextStepDetail: 'Verify that the project exposes `@RestController` endpoints and uses explicit Spring role names such as Controller, Service or UseCase, and Repository or Store.',
    emptyDomainMessage: 'The project was read successfully, but StackFlow did not find any REST API domain to map.',
    emptyEndpointMessage: 'The project was read successfully, but StackFlow did not find any REST endpoint evidence to list here.',
  },
  FAILED: {
    headerSummary: 'Analysis could not read the requested Spring source path.',
    nextStepTitle: 'Verify the project root and that `src/main/java` or `backend/src/main/java` exists.',
    nextStepDetail: 'Fix the project path first, then run analysis again so StackFlow can inspect controllers, mappings, and supporting layers.',
    emptyDomainMessage: 'Analysis failed before StackFlow could build any project domain evidence.',
    emptyEndpointMessage: 'Analysis failed before StackFlow could collect any endpoint evidence.',
  },
}

const VIEW_MODES: Array<{
  id: ViewMode
  label: string
  title: string
  description: string
}> = [
  {
    id: 'project',
    label: 'Project',
    title: 'See structure only',
    description: 'Domains, layers, controllers, and infrastructure from static Spring analysis.',
  },
  {
    id: 'api',
    label: 'Request',
    title: 'Send one API call',
    description: 'Pick an endpoint, edit request options, and inspect the HTTP response.',
  },
  {
    id: 'runtime',
    label: 'Trace',
    title: 'Inspect the flow',
    description: 'Open the graph only when you need runtime events and the failing node.',
  },
]

const FALLBACK_API_CATALOG: ApiDefinition[] = [
  {
    id: 'product-detail',
    method: 'GET',
    methodSpecified: true,
    label: 'Product detail',
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
    label: 'Product list',
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
    label: 'Product stock',
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
    label: 'Refresh cache',
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
    label: 'Payment list',
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
    label: 'Create payment quote',
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
  projectName: 'StackFlow sample project',
  framework: 'Spring Boot',
  frameworkEvidence: 'Bundled StackFlow sample project metadata.',
  analysisStatus: 'SUCCESS',
  sourceRoot: 'backend/src/main/java',
  analysisMessage: 'Showing the bundled StackFlow sample project for exploration.',
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
      endpoints: FALLBACK_API_CATALOG.map((api) => ({
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
  const [selectedFolderInfo, setSelectedFolderInfo] = useState<SelectedFolderInfo | null>(null)
  const [targetBaseUrl, setTargetBaseUrl] = useState('http://localhost:8081')
  const [queryParams, setQueryParams] = useState<ExternalRequestEntry[]>([
    createRequestEntry('page', '1', false),
  ])
  const [requestHeaders, setRequestHeaders] = useState<ExternalRequestEntry[]>([
    createRequestEntry('Authorization', 'Bearer local-token', false),
  ])
  const [requestBody, setRequestBody] = useState('{\n  "name": "Sample product"\n}')
  const [requestBodyError, setRequestBodyError] = useState<string | null>(null)
  const [externalRequestSnapshot, setExternalRequestSnapshot] = useState<ExternalRequestSnapshot | null>(null)
  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number]['value']>('normal')
  const [activeView, setActiveView] = useState<ViewMode>('project')
  const [apiCatalog, setApiCatalog] = useState<ApiDefinition[]>(FALLBACK_API_CATALOG)
  const [projectStructure, setProjectStructure] = useState<ProjectStructure>(FALLBACK_PROJECT_STRUCTURE)
  const [catalogSource, setCatalogSource] = useState<'analyzed' | 'fallback'>('fallback')
  const [analysisTarget, setAnalysisTarget] = useState<'sample' | 'external'>('sample')
  const [analysisState, setAnalysisState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [analysisMessage, setAnalysisMessage] = useState('Using the default StackFlow backend project.')
  const [selectedApiId, setSelectedApiId] = useState(FALLBACK_API_CATALOG[0].id)
  const [selectedDomainId, setSelectedDomainId] = useState(FALLBACK_PROJECT_STRUCTURE.domains[0].id)
  const [traceDetail, setTraceDetail] = useState<TraceDetail | null>(null)
  const [recentTraces, setRecentTraces] = useState<TraceSummary[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [requestState, setRequestState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [streamStatus, setStreamStatus] = useState<'idle' | 'connecting' | 'streaming' | 'completed' | 'error'>('idle')
  const [requestMessage, setRequestMessage] = useState<string>('Open a live stream and run a request.')
  const [lastResponseBody, setLastResponseBody] = useState<unknown>(null)
  const [externalResponse, setExternalResponse] = useState<ExternalRequestResponse | null>(null)
  const activeStreamRef = useRef<EventSource | null>(null)
  const activeRunIdRef = useRef(0)
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)

  const graph = buildGraph(traceDetail)
  const selectedNode = getNodeDetail(graph.states, selectedNodeId ?? graph.states.find((state) => state.active)?.id ?? null)
  const activeNodeCount = graph.states.filter((state) => state.active).length
  const latestEvent = traceDetail?.events.at(-1) ?? null
  const selectedDomain = projectStructure.domains.find((domain) => domain.id === selectedDomainId) ?? projectStructure.domains[0] ?? EMPTY_DOMAIN
  const hasDetectedDomains = projectStructure.domains.length > 0
  const hasDetectedApis = apiCatalog.length > 0
  const domainApis = apiCatalog.filter((api) => api.domainId === selectedDomain.id)
  const visibleApis = domainApis.length > 0 ? domainApis : apiCatalog
  const selectedApi = visibleApis.find((api) => api.id === selectedApiId) ?? visibleApis[0] ?? EMPTY_API_DEFINITION
  const projectFacts = buildProjectFacts(projectStructure)
  const activeRoute = graph.states.filter((state) => state.active)
  const estimatedFlow = hasDetectedApis ? buildEstimatedFlow(selectedApi, selectedDomain) : []
  const hasConcreteMethod = hasDetectedApis && isConcreteMethodApi(selectedApi)
  const runtimeSupported = hasDetectedApis && hasConcreteMethod && analysisTarget === 'sample' && isStackFlowRuntimeApi(selectedApi)
  const externalRunnable = hasDetectedApis && hasConcreteMethod && analysisTarget === 'external'
  const analyzeOnly = hasDetectedApis && !runtimeSupported && !externalRunnable
  const projectStatusContent = PROJECT_STATUS_CONTENT[projectStructure.analysisStatus]
  const hasIntegrationBoundary = selectedDomain.layers.some((layer) => layer.name === 'Gateway' || layer.name === 'Client')
  const selectedDomainDisplayMode = getDomainDisplayMode(selectedDomain)
  const runtimeModeLabel = runtimeSupported ? 'Run trace' : externalRunnable ? 'Run target' : 'Analyze only'
  const currentResultStatus = externalResponse?.resultStatus ?? traceDetail?.resultStatus ?? 'IDLE'
  const externalPath = selectedApi.buildPath(productId)
  const externalTargetPreview = buildExternalTargetPreview(targetBaseUrl, externalPath, queryParams)
  const bodyAllowed = hasConcreteMethod && ['POST', 'PUT', 'PATCH'].includes(selectedApi.method)
  const selectedApiMethodLabel = getApiMethodLabel(selectedApi)
  const selectedApiMethodClassName = getApiMethodBadgeClassName(selectedApi)
  const graphFitKey = `${traceDetail?.traceId ?? 'empty'}-${traceDetail?.events.length ?? 0}`
  const workflowSteps = [
    {
      number: '01',
      title: 'Read project map',
      detail: `${projectStructure.projectName} · ${projectStructure.domains.length} domain`,
      state: activeView === 'project' || analysisState === 'loading' ? 'active' : catalogSource === 'analyzed' ? 'done' : 'warning',
    },
    {
      number: '02',
      title: 'Choose endpoint',
      detail: `${selectedApiMethodLabel} ${selectedApi.pathTemplate}`,
      state: activeView === 'api' ? 'active' : 'done',
    },
    {
      number: '03',
      title: requestState === 'loading' ? (runtimeSupported ? 'Streaming request' : 'Calling target API') : runtimeModeLabel,
      detail: requestState === 'loading'
        ? runtimeSupported ? 'SSE events are arriving' : targetBaseUrl
        : selectedApi.requestType,
      state: activeView === 'runtime' || requestState === 'loading' ? 'active' : traceDetail || externalResponse ? 'done' : 'idle',
    },
    {
      number: '04',
      title: 'Inspect result',
      detail: selectedNode ? `${selectedNode.label} node selected` : externalResponse ? `HTTP ${externalResponse.httpStatus || '-'}` : traceDetail ? 'Select a graph node' : 'Waiting for result',
      state: activeView === 'runtime' && selectedNode ? 'active' : traceDetail || externalResponse ? 'done' : 'idle',
    },
  ]

  const recentEvents = useMemo(() => {
    return traceDetail?.events.slice().reverse().slice(0, 6) ?? []
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
      flowInstanceRef.current?.fitView({ padding: 0.18, duration: 280, includeHiddenNodes: true })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [graphFitKey])

  async function loadApiCatalog() {
    try {
      const response = await fetch('/api/project/structure')
      if (!response.ok) {
        throw new Error('Project structure request failed.')
      }

      const structure = (await response.json()) as ProjectStructure
      const analyzedCatalog = flattenProjectApis(structure)
      applyProjectStructure(structure, analyzedCatalog, structure.analysisMessage, 'sample')
    } catch {
      startTransition(() => {
        setProjectStructure(FALLBACK_PROJECT_STRUCTURE)
        setApiCatalog(FALLBACK_API_CATALOG)
        setCatalogSource('fallback')
        setAnalysisTarget('sample')
        setAnalysisMessage('Showing the bundled StackFlow sample project. Enter a project path to analyze your own Spring Boot app.')
        setSelectedDomainId((current) =>
          FALLBACK_PROJECT_STRUCTURE.domains.some((domain) => domain.id === current)
            ? current
            : FALLBACK_PROJECT_STRUCTURE.domains[0].id,
        )
        setSelectedApiId((current) => FALLBACK_API_CATALOG.some((api) => api.id === current) ? current : FALLBACK_API_CATALOG[0].id)
      })
    }
  }

  async function analyzeProjectPath() {
    setAnalysisState('loading')
    setAnalysisMessage('Reading project files and Spring mappings...')
    const nextAnalysisTarget = projectPath.trim() === '' ? 'sample' : 'external'

    try {
      const response = await fetch('/api/project/structure/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath }),
      })
      if (!response.ok) {
        throw new Error('Project analysis request failed.')
      }

      const structure = (await response.json()) as ProjectStructure
      const analyzedCatalog = flattenProjectApis(structure)
      applyProjectStructure(structure, analyzedCatalog, structure.analysisMessage, nextAnalysisTarget)
      setAnalysisState(structure.analysisStatus === 'FAILED' ? 'error' : 'idle')
      setActiveView('project')
    } catch (error) {
      setAnalysisState('error')
      setAnalysisMessage(error instanceof Error ? error.message : 'Project analysis failed.')
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
      setAnalysisMessage(message)
      setSelectedDomainId((current) => structure.domains.some((domain) => domain.id === current) ? current : (structure.domains[0]?.id ?? EMPTY_DOMAIN.id))
      setSelectedApiId((current) => analyzedCatalog.some((api) => api.id === current) ? current : (analyzedCatalog[0]?.id ?? EMPTY_API_DEFINITION.id))
      if (target === 'external') {
        setTraceDetail(null)
        setSelectedNodeId(null)
        setLastResponseBody(null)
        setExternalResponse(null)
        setStreamStatus('idle')
        setRequestState('idle')
        setRequestMessage('External project loaded. Enter a target base URL, then run the selected endpoint.')
      }
      if (target === 'sample') {
        setExternalResponse(null)
        setRequestState('idle')
        setRequestMessage('Open a live stream and run a request.')
      }
    })
  }

  function selectDomain(domain: ProjectDomain) {
    if (domain.id === EMPTY_DOMAIN.id) {
      return
    }
    setSelectedDomainId(domain.id)
    setActiveView('project')
    const nextApi = apiCatalog.find((api) => api.domainId === domain.id)
    if (nextApi) {
      setSelectedApiId(nextApi.id)
      setExternalResponse(null)
    }
  }

  function updateQueryParam(id: string, patch: Partial<ExternalRequestEntry>) {
    setQueryParams((current) => updateRequestEntries(current, id, patch))
  }

  function updateRequestHeader(id: string, patch: Partial<ExternalRequestEntry>) {
    setRequestHeaders((current) => updateRequestEntries(current, id, patch))
  }

  function handleFolderSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) {
      return
    }

    const firstPath = files[0].webkitRelativePath || files[0].name
    const rootName = firstPath.split('/')[0] || 'Selected folder'
    setSelectedFolderInfo({
      name: rootName,
      fileCount: files.length,
      sampleFiles: files.slice(0, 4).map((file) => file.webkitRelativePath || file.name),
    })
    event.target.value = ''
  }

  function removeQueryParam(id: string) {
    setQueryParams((current) => removeRequestEntry(current, id))
  }

  function removeRequestHeader(id: string) {
    setRequestHeaders((current) => removeRequestEntry(current, id))
  }

  async function loadRecentTraces() {
    const response = await fetch('/api/traces')
    if (!response.ok) {
      return
    }

    const traces = (await response.json()) as TraceSummary[]
    startTransition(() => {
      setRecentTraces(traces)
    })
  }

  async function runRequest() {
    if (!hasDetectedApis) {
      setActiveView('project')
      setRequestState('error')
      setStreamStatus('idle')
      setRequestMessage('No detected REST API is available to run from the current analysis result.')
      return
    }

    if (analyzeOnly) {
      setActiveView('api')
      setRequestState('error')
      setStreamStatus('idle')
      setRequestMessage(
        selectedApi.methodSpecified
          ? 'This sample API is analysis-only. Switch to Product endpoints for runtime trace, or use an external target to execute requests.'
          : 'This endpoint was detected from static analysis, but the HTTP method was not explicit. Review the code first, then run it outside StackFlow.',
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
    setRequestMessage('Creating trace session and opening live stream...')
    setLastResponseBody(null)
    setExternalResponse(null)

    try {
      const sessionResponse = await fetch('/api/traces/session', { method: 'POST' })
      if (!sessionResponse.ok) {
        throw new Error('Trace session could not be created.')
      }

      const session = (await sessionResponse.json()) as TraceSessionResponse
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
        setRequestMessage('Live stream connected. Running request through StackFlow...')
      } catch {
        if (activeRunIdRef.current !== runId) {
          return
        }
        setStreamStatus('error')
        setRequestMessage('Live stream unavailable. Running request and falling back to final trace load...')
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
        throw new Error('Request did not return a trace id.')
      }

      const finalTrace = await fetchTraceWithRetry(payload.traceId)
      if (activeRunIdRef.current !== runId) {
        return
      }

      startTransition(() => {
        setTraceDetail(finalTrace)
        setSelectedNodeId((current) => current ?? finalTrace.events.at(-1)?.component ?? null)
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
      setRequestMessage(error instanceof Error ? error.message : 'Request failed unexpectedly.')
    }
  }

  async function runExternalRequest() {
    if (!externalRunnable) {
      setActiveView('api')
      setRequestState('error')
      setStreamStatus('idle')
      setRequestMessage(
        selectedApi.methodSpecified
          ? 'This API is analysis-only. Configure runtime instrumentation before tracing external project internals.'
          : 'This endpoint was detected from static analysis, but the HTTP method was not explicit. Confirm the verb in source before sending a request.',
      )
      return
    }

    const normalizedTargetBaseUrl = targetBaseUrl.trim()
    const requestMethod = selectedApi.method as HttpMethod
    if (!normalizedTargetBaseUrl) {
      setActiveView('api')
      setRequestState('error')
      setStreamStatus('idle')
      setRequestMessage('Target base URL is required before running an external endpoint.')
      return
    }

    closeActiveStream()
    setActiveView('api')
    setRequestState('loading')
    setStreamStatus('idle')
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
        setRequestBodyError('Request body must be valid JSON before running this endpoint.')
        setRequestMessage('Fix the JSON request body before running the external request.')
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

    setRequestMessage(`Calling ${selectedApiMethodLabel} ${externalTargetPreview}...`)

    try {
      const response = await fetch('/api/external/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetBaseUrl: normalizedTargetBaseUrl,
          method: requestMethod,
          path: externalPath,
          queryParams: toEnabledEntries(queryParams),
          headers: toEnabledEntries(requestHeaders),
          requestBody: nextRequestBody || null,
        }),
      })
      if (!response.ok) {
        throw new Error('External request proxy failed.')
      }

      const payload = (await response.json()) as ExternalRequestResponse
      startTransition(() => {
        setExternalResponse(payload)
        setExternalRequestSnapshot(requestSnapshot)
        setRequestState(payload.resultStatus === 'SUCCESS' ? 'idle' : 'error')
        setRequestMessage(buildExternalRequestMessage(payload))
      })
    } catch (error) {
      setRequestState('error')
      setRequestMessage(error instanceof Error ? error.message : 'External request failed unexpectedly.')
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
          setRequestMessage('Receiving live events...')
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
              events: [...current.events, payload],
              endedAt: payload.endedAt,
            }
          })
          setSelectedNodeId(payload.component)
        })
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
              ? 'Live trace completed. Finalizing detail view...'
              : `Live trace failed at ${payload.errorType ?? 'unknown component'}. Finalizing detail view...`,
          )
        })
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
          finalizeReject(new Error('Live stream could not be opened.'))
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
    startTransition(() => {
      setTraceDetail(detail)
      setSelectedNodeId(null)
      setLastResponseBody(null)
      setStreamStatus('idle')
      setRequestState('idle')
      setRequestMessage(`Loaded trace ${detail.traceId.slice(0, 8)} from history.`)
    })
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__mark">SF</span>
          <div>
            <strong>StackFlow</strong>
            <span>Map a Spring project, run one endpoint, inspect the failure node.</span>
          </div>
        </div>
        <div className="topbar__meta">
          <div>
            <span>Trace</span>
            <strong>{traceDetail?.traceId.slice(0, 8) ?? 'waiting'}</strong>
          </div>
          <div>
            <span>Result</span>
            <strong className={`status-text status-text--${currentResultStatus.toLowerCase()}`}>
              {currentResultStatus}
            </strong>
          </div>
          <div>
            <span>Stream</span>
            <strong>{streamStatus.toUpperCase()}</strong>
          </div>
          <div>
            <span>Events</span>
            <strong>{traceDetail?.events.length ?? 0}</strong>
          </div>
        </div>
      </header>

      <nav className="workflow-rail" aria-label="StackFlow workflow">
        {workflowSteps.map((step) => (
          <div key={step.number} className={`workflow-step workflow-step--${step.state}`}>
            <span>{step.number}</span>
            <div>
              <strong>{step.title}</strong>
              <small>{step.detail}</small>
            </div>
          </div>
        ))}
      </nav>

      <nav className="view-switcher" aria-label="StackFlow view modes">
        {VIEW_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={`view-switcher__item${activeView === mode.id ? ' is-active' : ''}${((analysisTarget === 'external' && mode.id === 'runtime') || (!hasDetectedApis && mode.id !== 'project')) ? ' is-disabled' : ''}`}
            disabled={(analysisTarget === 'external' && mode.id === 'runtime') || (!hasDetectedApis && mode.id !== 'project')}
            onClick={() => setActiveView(mode.id)}
          >
            <span>{mode.label}</span>
            <strong>{mode.title}</strong>
            <small>
              {analysisTarget === 'external' && mode.id === 'runtime'
                ? 'Instrumentation is required before external internals can be traced.'
                : !hasDetectedApis && mode.id !== 'project'
                  ? 'Analyze a project with detected REST APIs before this view becomes available.'
                : mode.description}
            </small>
          </button>
        ))}
      </nav>

      <section className={`workspace workspace--${activeView}`}>
        <aside className="left-panel control-rail">
          <div className="panel-card control-card">
            <div className="panel-header">
              <div>
                <span className="section-label">Operator runbook</span>
                <h2>Map, estimate, then trace</h2>
                <p>Static analysis and actual runtime evidence stay separated.</p>
              </div>
              <span className={`pill pill--${catalogSource === 'analyzed' ? 'success' : 'warning'}`}>{catalogSource}</span>
            </div>

            <section className="setup-step setup-step--project">
              <div className="setup-step__head">
                <span>01</span>
                <div>
                  <strong>Project structure</strong>
                  <small>Paste a Spring Boot project path, then let StackFlow map it.</small>
                </div>
              </div>

              <div className="project-path-form">
                <label className="field">
                  <span>Project root path</span>
                  <input
                    value={projectPath}
                    onChange={(event) => setProjectPath(event.target.value)}
                    placeholder="/Users/jiwoo/Desktop/my-spring-project"
                  />
                </label>
                <div className="folder-picker-row">
                  <button
                    className="folder-picker-button"
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                  >
                    Browse folder
                  </button>
                  <input
                    ref={folderInputRef}
                    className="folder-picker-input"
                    type="file"
                    multiple
                    onChange={handleFolderSelection}
                    {...{ webkitdirectory: '', directory: '' }}
                  />
                  <p>Browser mode can preview the chosen folder, but cannot read its absolute path. Paste the root path above to run backend analysis.</p>
                </div>
                {selectedFolderInfo ? (
                  <div className="folder-selection-card">
                    <div>
                      <span>Selected folder</span>
                      <strong>{selectedFolderInfo.name}</strong>
                    </div>
                    <span>{selectedFolderInfo.fileCount} files detected</span>
                    <ul>
                      {selectedFolderInfo.sampleFiles.map((file) => (
                        <li key={file}>{file}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <button
                  className="analyze-button"
                  type="button"
                  onClick={() => void analyzeProjectPath()}
                  disabled={analysisState === 'loading'}
                >
                  {analysisState === 'loading' ? 'Analyzing project...' : 'Analyze project'}
                </button>
                <p className={`analysis-message analysis-message--${analysisState}`}>{analysisMessage}</p>
                <p className="analysis-submessage">{projectStatusContent.headerSummary}</p>
                <p className="analysis-submessage analysis-submessage--detail">{projectStructure.analysisMessage}</p>
              </div>

              <div className="project-strip" aria-label="Detected project summary">
                {projectFacts.map((item) => (
                  <span key={item.label}>
                    <strong>{item.label}</strong>
                    {item.value}
                  </span>
                ))}
              </div>

              <div className="domain-compact">
                <div className="domain-list domain-list--compact">
                  {hasDetectedDomains ? (
                    projectStructure.domains.map((domain) => {
                      const displayMode = getDomainDisplayMode(domain)

                      return (
                        <button
                          key={domain.id}
                          type="button"
                          className={`domain-item${selectedDomainId === domain.id ? ' is-selected' : ''}`}
                          onClick={() => selectDomain(domain)}
                        >
                          <div className="domain-item__title">
                            <strong>{domain.name}</strong>
                            <small>{domain.endpoints.length} APIs</small>
                          </div>
                          {displayMode ? (
                            <span className={`domain-mode-badge domain-mode-badge--${displayMode.tone}`}>
                              {displayMode.label}
                            </span>
                          ) : null}
                          <span>{domain.description}</span>
                          <em>{domain.controllers.map((controller) => controller.name).join(', ')}</em>
                        </button>
                      )
                    })
                  ) : (
                    <p className="empty-copy">No API domain was detected in this analysis result.</p>
                  )}
                </div>
                <div className="layer-stack">
                  {selectedDomain.layers.map((layer) => (
                    <span key={layer.name}>
                      {layer.name}
                      <small>{layer.classes.length}</small>
                    </span>
                  ))}
                </div>
                <div className="domain-meta">
                  <span>{selectedDomain.responsibilities.join(' / ') || 'No responsibilities detected'}</span>
                  <span>{selectedDomain.infrastructure.join(' / ') || 'No infrastructure detected'}</span>
                </div>
              </div>
            </section>

            <section className="setup-step setup-step--endpoint">
              <div className="setup-step__head">
                <span>02</span>
                <div>
                  <strong>Choose endpoint</strong>
                  <small>Only APIs in the selected domain are shown here.</small>
                </div>
              </div>

              <div className="section-row">
                <span className="section-label">API catalog</span>
                <span>{visibleApis.length} / {apiCatalog.length} endpoints</span>
              </div>
              <div className="api-list api-list--catalog">
                {hasDetectedApis ? (
                  visibleApis.map((api) => (
                    <button
                      key={api.id}
                      type="button"
                      className={`api-item${selectedApi.id === api.id ? ' is-selected' : ''}`}
                      onClick={() => {
                        setSelectedApiId(api.id)
                        setExternalResponse(null)
                        setActiveView('api')
                      }}
                    >
                      <span className={getApiMethodBadgeClassName(api)}>{getApiMethodLabel(api)}</span>
                      <div>
                        <strong>{api.label}</strong>
                        <span>{api.pathTemplate}</span>
                        <p>{api.requestType} · {api.description}</p>
                        <span className="api-item__handler">{api.controller}.{api.handler}</span>
                        {!api.methodSpecified ? (
                          <span className="api-item__handler">Static analysis only · HTTP method not explicit</span>
                        ) : null}
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="empty-copy">No detected REST API is available for request or trace views.</p>
                )}
              </div>
            </section>

            <section className="setup-step setup-step--run">
              <div className="setup-step__head">
                <span>03</span>
                <div>
                  <strong>{runtimeSupported ? 'Run live trace' : 'Run endpoint'}</strong>
                  <small>
                    {runtimeSupported
                      ? 'The stream opens first, then the selected API request runs.'
                      : 'Call the selected endpoint through the StackFlow backend proxy.'}
                  </small>
                </div>
              </div>

              <div className="selected-request">
                <span className={selectedApiMethodClassName}>{selectedApiMethodLabel}</span>
                <div>
                  <strong>{selectedApi.label}</strong>
                  <small>{selectedApi.pathTemplate}</small>
                  {!selectedApi.methodSpecified ? <small>Detected from static analysis only. HTTP method was not explicit.</small> : null}
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
                        <span>Basic request</span>
                        <small>Choose the target app and required path value.</small>
                      </div>
                      <label className="field">
                        <span>Target base URL</span>
                        <input
                          value={targetBaseUrl}
                          onChange={(event) => setTargetBaseUrl(event.target.value)}
                          placeholder="http://localhost:8081"
                        />
                      </label>
                      {selectedApi.requiresProductId ? (
                        <label className="field">
                          <span>Path variable value</span>
                          <input value={productId} onChange={(event) => setProductId(event.target.value)} />
                        </label>
                      ) : null}
                    </div>
                    <details className="advanced-request">
                      <summary>
                        <span>Advanced request options</span>
                        <small>{countEnabledEntries(queryParams)} query / {countEnabledEntries(requestHeaders)} headers / {bodyAllowed ? 'body available' : 'no body'}</small>
                      </summary>
                      <div className="advanced-request__body">
                        <div className="request-editor">
                          <div className="request-editor__head">
                            <span>Query params</span>
                            <button type="button" onClick={() => setQueryParams((current) => [...current, createRequestEntry('', '', true)])}>
                              Add query
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
                                  <span>{entry.enabled ? 'on' : 'off'}</span>
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
                                <button type="button" onClick={() => removeQueryParam(entry.id)} aria-label="Remove query parameter">
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="request-editor">
                          <div className="request-editor__head">
                            <span>Headers</span>
                            <button type="button" onClick={() => setRequestHeaders((current) => [...current, createRequestEntry('', '', true)])}>
                              Add header
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
                                  <span>{entry.enabled ? 'on' : 'off'}</span>
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
                                <button type="button" onClick={() => removeRequestHeader(entry.id)} aria-label="Remove request header">
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <label className={`field request-body-field${bodyAllowed ? '' : ' is-disabled'}`}>
                          <span>{bodyAllowed ? 'JSON body' : 'JSON body unavailable for this method'}</span>
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
                      </div>
                    </details>
                    <div className="request-preview request-preview--send">
                      <span>Request to be sent</span>
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
                    <span>Failure scenario</span>
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
                  {requestState === 'loading'
                    ? (runtimeSupported ? 'Streaming events...' : 'Calling target...')
                    : runtimeSupported
                      ? 'Run runtime trace'
                      : externalRunnable
                        ? 'Run external request'
                        : 'Analyze only'}
                </button>
                <p className="request-message">{requestMessage}</p>
              </div>
            </section>
          </div>

          <div className="panel-card recent-card">
            <div className="panel-header">
              <h2>Recent traces</h2>
              <span>{recentTraces.length}</span>
            </div>
            <div className="trace-list">
              {recentTraces.length === 0 ? (
                <p className="empty-copy">No trace captured yet.</p>
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
                      <span className={`pill pill--inline pill--${trace.resultStatus.toLowerCase()}`}>{trace.resultStatus}</span>
                      <span>{trace.durationMs}ms</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="graph-panel">
          {activeView === 'project' ? (
            <div className="panel-card panel-card--map">
              <div className="graph-head">
                <div>
                  <span className="section-label">Project · static map</span>
                  <h2>{projectStructure.projectName}</h2>
                  <p>Start here. Keep this screen for structure only, then switch to Request when you want to run an API.</p>
                </div>
                <span className={`pill pill--inline ${projectStructure.analysisStatus === 'SUCCESS' ? 'pill--success' : 'pill--warning'}`}>
                  {projectStructure.analysisStatus}
                </span>
              </div>

              <div className="map-board" aria-label="Detected project map">
                <section className="map-column map-column--summary">
                  <span className="section-label">Detected summary</span>
                  <div className="project-strip project-strip--map">
                    {projectFacts.map((item) => (
                      <span key={item.label}>
                        <strong>{item.label}</strong>
                        {item.value}
                      </span>
                    ))}
                  </div>
                  {projectStructure.analysisStatus !== 'FAILED' ? (
                    <article className="analysis-guide-card">
                      <strong>Best read with explicit Spring roles</strong>
                      <p>Use names like Controller, Service or UseCase, Cache, Repository or Store, Gateway, and Client so the static map stays explainable.</p>
                      <small>Reference: docs/stackflow-analysis-convention.md</small>
                    </article>
                  ) : null}
                  <div className="map-domain-list">
                    {hasDetectedDomains ? (
                      projectStructure.domains.map((domain) => {
                        const displayMode = getDomainDisplayMode(domain)

                        return (
                          <button
                            key={domain.id}
                            type="button"
                            className={`map-domain-card${selectedDomain.id === domain.id ? ' is-selected' : ''}`}
                            onClick={() => selectDomain(domain)}
                          >
                            <strong>{domain.name}</strong>
                            {displayMode ? (
                              <span className={`domain-mode-badge domain-mode-badge--${displayMode.tone}`}>
                                {displayMode.label}
                              </span>
                            ) : null}
                            <span>{domain.endpoints.length} APIs</span>
                            <small>{domain.description}</small>
                          </button>
                        )
                      })
                    ) : (
                      <p className="empty-copy">{projectStatusContent.emptyDomainMessage}</p>
                    )}
                  </div>
                </section>

                <section className="map-column map-column--domain-detail">
                  <div className="map-detail-head">
                    <div>
                      <span className="section-label">Selected domain</span>
                      <strong>{hasDetectedDomains ? selectedDomain.name : 'No detected domain'}</strong>
                      <p>{hasDetectedDomains ? selectedDomain.description : projectStatusContent.headerSummary}</p>
                      {hasDetectedDomains && selectedDomainDisplayMode ? (
                        <small className="map-detail-mode">{selectedDomainDisplayMode.detail}</small>
                      ) : null}
                    </div>
                    <span className={`pill pill--inline ${projectStructure.analysisStatus === 'SUCCESS' ? 'pill--success' : 'pill--warning'}`}>{selectedDomain.endpoints.length} APIs</span>
                  </div>
                  <div className="map-node-grid">
                    <article className="map-node-card">
                      <strong>Controllers</strong>
                      <span>{selectedDomain.controllers.map((controller) => controller.name).join(', ') || 'Not detected'}</span>
                      <small>{selectedDomain.controllers.map((controller) => `${controller.basePath || '/'} · ${controller.endpointCount} endpoints`).join(' / ')}</small>
                      <small>{selectedDomain.controllers.map((controller) => controller.sourceFile).join(' / ')}</small>
                    </article>
                    <article className="map-node-card">
                      <strong>Layers</strong>
                      <span>{selectedDomain.layers.map((layer) => layer.name).join(' -> ') || 'Not detected'}</span>
                      <small>{selectedDomain.layers.flatMap((layer) => layer.classes).join(', ')}</small>
                      <small>{selectedDomain.layers.map((layer) => layer.evidence).join(' / ')}</small>
                    </article>
                    <article className="map-node-card map-node-card--infra">
                      <strong>Infrastructure</strong>
                      <span>{selectedDomain.infrastructure.join(' / ') || 'Not detected'}</span>
                      <small>{selectedDomain.infrastructureDetails.map((item) => `${item.name}: ${item.evidence}`).join(' / ') || 'No infrastructure evidence recorded.'}</small>
                    </article>
                    <article className="map-node-card">
                      <strong>Responsibilities</strong>
                      <span>{selectedDomain.responsibilities.join(' / ') || 'Not detected'}</span>
                      <small>{selectedDomain.packageRoots.join(' / ') || 'Use Request view to inspect one selected endpoint.'}</small>
                    </article>
                  </div>
                  <div className="map-endpoint-list">
                    {selectedDomain.endpoints.length > 0 ? (
                      selectedDomain.endpoints.map((endpoint) => (
                        <article key={endpoint.id} className="map-endpoint-card">
                          <strong>{getApiMethodLabel(endpoint)} {endpoint.path}</strong>
                          <span>{endpoint.controller}.{endpoint.handler}</span>
                          {!endpoint.methodSpecified ? <small>Static analysis only · HTTP method not explicit</small> : null}
                          <small>{endpoint.sourceFile}:{endpoint.sourceLine || '?'}</small>
                        </article>
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
              <div className="graph-head">
                <div>
                  <span className="section-label">Request path · estimated</span>
                  <h2>{selectedApiMethodLabel} {selectedApi.pathTemplate}</h2>
                  <p>Use this as a preview. Actual node timing lives in the Trace view.</p>
                </div>
                <span className={`pill pill--inline ${runtimeSupported ? 'pill--success' : 'pill--warning'}`}>
                  {runtimeModeLabel}
                </span>
              </div>

              <div className="api-flow-summary">
                <span>
                  <strong>Domain</strong>
                  {selectedDomain.name}
                </span>
                <span>
                  <strong>Handler</strong>
                  {selectedApi.controller}.{selectedApi.handler}
                </span>
                <span>
                  <strong>Request type</strong>
                  {selectedApi.requestType}
                </span>
                <span>
                  <strong>Evidence level</strong>
                  {hasIntegrationBoundary ? 'Estimated with integration boundary' : 'Estimated from code shape'}
                </span>
              </div>

              <div className="estimated-flow" aria-label="Estimated API flow">
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
                  <p className="empty-copy">No estimated request path is available because the analysis did not detect any REST API.</p>
                )}
              </div>

              <div className="analysis-boundary">
                <strong>
                  {runtimeSupported
                    ? 'Send the request here, then inspect Trace when needed.'
                    : !selectedApi.methodSpecified
                      ? 'This flow is static only because the handler mapping did not declare an explicit HTTP method.'
                      : hasIntegrationBoundary
                      ? 'This flow highlights static integration boundaries, not live provider calls.'
                      : 'External internals are not traced yet.'}
                </strong>
                <p>
                  {runtimeSupported
                    ? 'The Request view keeps response checking separate from graph inspection.'
                    : !selectedApi.methodSpecified
                      ? 'StackFlow can show the endpoint boundary from source analysis, but it will not guess a runnable verb for request or trace execution.'
                      : hasIntegrationBoundary
                      ? 'Gateway and Client layers show where StackFlow expects an outbound payment or provider boundary, based on naming and package shape.'
                      : 'External project internals require a future Spring Boot starter or agent before StackFlow can show actual node events.'}
                </p>
              </div>
            </div>
          ) : null}

          {activeView === 'runtime' ? (
            <div className="panel-card panel-card--graph">
              <div className="graph-head">
                <div>
                  <span className="section-label">Runtime Trace · actual</span>
                  <h2>{selectedDomain.name} request flow</h2>
                  <p>
                    {traceDetail
                      ? `${traceDetail.method} ${traceDetail.endpoint} · HTTP ${traceDetail.httpStatus || '-'}`
                      : runtimeSupported
                        ? `Run ${selectedApiMethodLabel} ${selectedApi.pathTemplate} to activate the live graph.`
                        : !selectedApi.methodSpecified
                          ? 'This selected API is analysis-only because the handler mapping did not declare an explicit HTTP method.'
                          : 'This selected API is analysis-only. Runtime instrumentation is not connected.'}
                  </p>
                </div>
                <span className={`pill pill--inline pill--${streamStatus === 'completed' ? 'success' : streamStatus === 'streaming' ? 'loading' : streamStatus}`}>
                  {streamStatus.toUpperCase()}
                </span>
              </div>

              <div className="graph-context" aria-label="Current graph context">
                <span>
                  <strong>Domain</strong>
                  {selectedDomain.name}
                </span>
                <span>
                  <strong>Controller</strong>
                  {selectedApi.controller}
                </span>
                <span>
                  <strong>Endpoint</strong>
                  {selectedApiMethodLabel} {selectedApi.pathTemplate}
                </span>
                <span>
                  <strong>Trace goal</strong>
                  Find the first failing node
                </span>
              </div>

              <div className="flow-route">
                {graph.states.map((state) => (
                  <button
                    key={state.id}
                    type="button"
                    className={`route-step route-step--${state.status.toLowerCase()}${state.active ? ' is-active' : ''}${selectedNode?.id === state.id ? ' is-selected' : ''}`}
                    onClick={() => setSelectedNodeId(state.id)}
                  >
                    <span>{state.label}</span>
                    <strong>{state.active ? `${state.durationMs}ms` : 'idle'}</strong>
                  </button>
                ))}
              </div>

              <div className="graph-toolbar">
                <div>
                  <span>{traceDetail?.events.length ?? 0} live events</span>
                  <strong>{activeRoute.length > 0 ? activeRoute.map((state) => state.label).join(' -> ') : 'Run a request to activate the path'}</strong>
                </div>
                <div className="legend-strip" aria-label="Graph status legend">
                  <span className="legend-chip legend-chip--success">success</span>
                  <span className="legend-chip legend-chip--warning">warning</span>
                  <span className="legend-chip legend-chip--error">error</span>
                  <span className="legend-chip legend-chip--idle">idle</span>
                </div>
              </div>

              <div className="graph-surface">
                <div className="graph-lanes" aria-hidden="true">
                  <span>client</span>
                  <span>application</span>
                  <span>cache</span>
                  <span>data</span>
                  <span>response</span>
                </div>
                <ReactFlow
                  key={traceDetail?.traceId ?? 'empty-flow'}
                  fitView
                  fitViewOptions={{ padding: 0.16 }}
                  onInit={(instance) => {
                    flowInstanceRef.current = instance
                    window.requestAnimationFrame(() => {
                      instance.fitView({ padding: 0.18, duration: 180, includeHiddenNodes: true })
                    })
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
            </div>
          ) : null}
        </section>

        <aside className="right-panel inspector-rail">
          {activeView === 'project' ? (
            <div className="panel-card inspector-workbench">
              <div className="panel-header">
                <div>
                  <span className="section-label">Project evidence</span>
                  <h2>{hasDetectedDomains ? selectedDomain.name : projectStructure.projectName}</h2>
                  <p>{projectStatusContent.headerSummary}</p>
                </div>
                <span className={`pill pill--inline ${projectStructure.analysisStatus === 'SUCCESS' ? 'pill--success' : 'pill--warning'}`}>{projectStructure.analysisStatus}</span>
              </div>
              <div className="insight-list">
                <article>
                  <span>Project</span>
                  <strong>{projectStructure.projectName}</strong>
                  <p>{projectStructure.framework}</p>
                  <p>{projectStructure.frameworkEvidence}</p>
                </article>
                <article>
                  <span>Domain APIs</span>
                  <strong>{selectedDomain.endpoints.length}</strong>
                  <p>{selectedDomain.responsibilities.join(' / ') || 'No request type detected'}</p>
                </article>
                <article>
                  <span>Detected infra</span>
                  <strong>{selectedDomain.infrastructure.join(' / ') || 'None'}</strong>
                  <p>{selectedDomain.infrastructureDetails.map((item) => `${item.detectedBy}: ${item.evidence}`).join(' / ') || 'Based on class names and endpoint paths.'}</p>
                </article>
                <article>
                  <span>Analysis source</span>
                  <strong>{projectStructure.analysisStatus}</strong>
                  <p>{projectStructure.sourceRoot}</p>
                </article>
                <article className="insight-list__next-step">
                  <span>Next step</span>
                  <strong>{projectStatusContent.nextStepTitle}</strong>
                  <p>{projectStatusContent.nextStepDetail}</p>
                </article>
              </div>
            </div>
          ) : null}

          {activeView === 'api' ? (
            <div className="panel-card inspector-workbench">
              <div className="panel-header">
                <div>
                  <span className="section-label">API evidence</span>
                  <h2>{selectedApi.label}</h2>
                  <p>{selectedApi.description}</p>
                </div>
                <span className={`pill pill--inline ${runtimeSupported ? 'pill--success' : 'pill--warning'}`}>
                  {runtimeModeLabel}
                </span>
              </div>
              <div className="insight-list">
                <article>
                  <span>Selected handler</span>
                  <strong>{selectedApi.controller}.{selectedApi.handler}</strong>
                  <p>{selectedApiMethodLabel} {selectedApi.pathTemplate}</p>
                </article>
                <article>
                  <span>Estimated path</span>
                  <strong>{estimatedFlow.map((step) => step.label).join(' -> ')}</strong>
                  <p>{hasIntegrationBoundary ? 'UseCase, Gateway, and Client are shown separately so outbound integration boundaries stay visible in the estimated path.' : 'Class names come from detected domain layers where available.'}</p>
                </article>
                <article>
                  <span>Runtime boundary</span>
                  <strong>{runtimeSupported ? 'Actual trace available' : !selectedApi.methodSpecified ? 'Static analysis only' : hasIntegrationBoundary ? 'Static integration view only' : 'Instrumentation required'}</strong>
                  <p>{runtimeSupported ? 'Switch to Runtime Trace and run the sample API.' : !selectedApi.methodSpecified ? 'The endpoint exists, but the controller method did not declare an explicit HTTP verb.' : hasIntegrationBoundary ? 'This sample endpoint is intended to explain integration layering, not to emit live trace events.' : 'External app internals cannot be traced yet.'}</p>
                </article>
              </div>
              {externalRunnable ? (
                <section className="inspector-section response-card external-response-card">
                  <div className="section-row">
                    <span className="section-label">External HTTP evidence</span>
                    <span className={`pill pill--inline pill--${(externalResponse?.resultStatus ?? 'idle').toLowerCase()}`}>
                      {externalResponse ? `HTTP ${externalResponse.httpStatus || '-'}` : 'WAITING'}
                    </span>
                  </div>
                  {externalResponse ? (
                    <>
                      <article className="evidence-block evidence-block--request">
                        <header>
                          <span>Request sent</span>
                          <strong>{externalRequestSnapshot?.method ?? (selectedApi.methodSpecified ? selectedApi.method : selectedApiMethodLabel)}</strong>
                        </header>
                        <p>{externalRequestSnapshot?.targetUrl ?? externalTargetPreview}</p>
                        <div className="evidence-grid">
                          <span>
                            <strong>Query</strong>
                            {countEnabledEntries(externalRequestSnapshot?.queryParams ?? [])}
                          </span>
                          <span>
                            <strong>Headers</strong>
                            {countEnabledEntries(externalRequestSnapshot?.headers ?? [])}
                          </span>
                          <span>
                            <strong>Body</strong>
                            {externalRequestSnapshot?.requestBody ? 'enabled' : 'none'}
                          </span>
                        </div>
                      </article>
                      <article className="evidence-block evidence-block--response">
                        <header>
                          <span>Response received</span>
                          <strong>HTTP {externalResponse.httpStatus || '-'}</strong>
                        </header>
                        <div className="evidence-grid">
                          <span>
                            <strong>Duration</strong>
                            {externalResponse.durationMs}ms
                          </span>
                          <span>
                            <strong>Content type</strong>
                            {externalResponse.contentType || '-'}
                          </span>
                        </div>
                      </article>
                      {externalResponse.errorMessage ? (
                        <p className="external-error">{externalResponse.errorMessage}</p>
                      ) : null}
                      {formattedExternalResponseBody ? (
                        <pre className="response-body response-body--external">{formattedExternalResponseBody}</pre>
                      ) : (
                        <p className="empty-copy">The target returned an empty body.</p>
                      )}
                    </>
                  ) : (
                    <p className="empty-copy">Enter a target base URL, then run this endpoint to inspect the returned payload.</p>
                  )}
                </section>
              ) : null}
              {!externalRunnable ? (
                <section className="inspector-section response-card external-response-card">
                  <div className="section-row">
                    <span className="section-label">Response</span>
                    <span className={`pill pill--inline pill--${(traceDetail?.resultStatus ?? 'idle').toLowerCase()}`}>
                      {traceDetail ? `HTTP ${traceDetail.httpStatus || '-'}` : 'WAITING'}
                    </span>
                  </div>
                  {formattedResponseBody ? (
                    <>
                      <article className="evidence-block evidence-block--response">
                        <header>
                          <span>Response received</span>
                          <strong>{traceDetail?.durationMs ?? 0}ms</strong>
                        </header>
                        <div className="evidence-grid">
                          <span>
                            <strong>Trace</strong>
                            {traceDetail?.traceId.slice(0, 8) ?? '-'}
                          </span>
                          <span>
                            <strong>Events</strong>
                            {traceDetail?.events.length ?? 0}
                          </span>
                          <span>
                            <strong>Result</strong>
                            {traceDetail?.resultStatus ?? 'IDLE'}
                          </span>
                        </div>
                      </article>
                      <pre className="response-body response-body--external">{formattedResponseBody}</pre>
                    </>
                  ) : (
                    <p className="empty-copy">Send the selected sample request to inspect the returned JSON.</p>
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
                    <span className="section-label">Runtime evidence</span>
                    <h2>{latestEvent ? latestEvent.component : 'No trace yet'}</h2>
                    <p>{latestEvent ? latestEvent.eventType : 'Run a trace, then click a graph node to inspect evidence.'}</p>
                  </div>
                  <span className={`pill pill--inline pill--${(traceDetail?.resultStatus ?? 'success').toLowerCase()}`}>
                    HTTP {traceDetail?.httpStatus || '-'}
                  </span>
                </div>

                <div className="runtime-meter runtime-meter--compact">
                  <span>{traceDetail ? `${traceDetail.durationMs}ms` : '0ms'}</span>
                  <span>{activeNodeCount} active nodes</span>
                </div>

                <section className="inspector-section response-card">
                  <div className="section-row">
                    <span className="section-label">Returned JSON</span>
                    <span>{traceDetail?.resultStatus ?? 'IDLE'}</span>
                  </div>
                  {formattedResponseBody ? (
                    <pre className="response-body">{formattedResponseBody}</pre>
                  ) : (
                    <p className="empty-copy">Run a request to inspect the response payload.</p>
                  )}
                </section>

                <section className="inspector-section inspector-card">
                  <div className="section-row">
                    <span className="section-label">Clicked node evidence</span>
                    {selectedNode ? (
                      <span className={`pill pill--inline pill--${selectedNode.status.toLowerCase()}`}>
                        {selectedNode.status}
                      </span>
                    ) : null}
                  </div>
                  {!selectedNode ? (
                    <p className="empty-copy">Click Controller, Service, Redis, Repository, MySQL, or Response in the graph.</p>
                  ) : (
                    <div className="detail-stack">
                      <div className="detail-summary">
                        <strong>{selectedNode.label}</strong>
                        <span>{selectedNode.durationMs}ms total</span>
                      </div>
                      <div className="detail-grid">
                        <div>
                          <span>Trace ID</span>
                          <strong>{traceDetail?.traceId ?? '-'}</strong>
                        </div>
                        <div>
                          <span>Visits</span>
                          <strong>{selectedNode.visits.length}</strong>
                        </div>
                      </div>
                      <div className="visit-list">
                        {selectedNode.visits.length === 0 ? (
                          <p className="empty-copy">This node was not visited in the current trace.</p>
                        ) : (
                          selectedNode.visits.map((event) => (
                            <article key={event.eventId} className="visit-card">
                              <header>
                                <strong>{event.eventType}</strong>
                                <span className={`pill pill--inline pill--${event.status.toLowerCase()}`}>{event.status}</span>
                              </header>
                              <dl>
                                <div>
                                  <dt>Duration</dt>
                                  <dd>{event.durationMs}ms</dd>
                                </div>
                                <div>
                                  <dt>Error Type</dt>
                                  <dd>{event.errorType ?? '-'}</dd>
                                </div>
                                <div>
                                  <dt>Error Message</dt>
                                  <dd>{event.errorMessage ?? '-'}</dd>
                                </div>
                              </dl>
                              <div className="metadata-list">
                                {Object.keys(event.metadata).length === 0 ? (
                                  <span className="metadata-item">No metadata</span>
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
                    <h2>Live event log</h2>
                    <p>Latest event first. Click graph nodes for full detail.</p>
                  </div>
                  <span>{recentEvents.length}</span>
                </div>
                <div className="timeline-list">
                {recentEvents.length === 0 ? (
                  <p className="empty-copy">No live event received yet.</p>
                ) : (
                  recentEvents.map((event, index) => (
                    <article key={event.eventId} className="timeline-item">
                      <div className="timeline-item__marker">
                        <span>{index + 1}</span>
                      </div>
                      <div className="timeline-item__body">
                        <header>
                          <strong>{event.component}</strong>
                          <span className={`pill pill--inline pill--${event.status.toLowerCase()}`}>{event.status}</span>
                        </header>
                        <p>{event.eventType}</p>
                        <div className="timeline-item__meta">
                          <span>{event.durationMs}ms</span>
                          <span>{new Date(event.startedAt).toLocaleTimeString()}</span>
                          <span>{event.errorType ?? 'no error'}</span>
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
    description: `Detected from ${item.controller}.${item.handler}.`,
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

function buildProjectFacts(structure: ProjectStructure) {
  const controllerCount = structure.domains.reduce((sum, domain) => sum + domain.controllers.length, 0)
  const endpointCount = structure.domains.reduce((sum, domain) => sum + domain.endpoints.length, 0)
  const layerNames = structure.layers
    .map((layer) => layer.name)
    .filter((name) => ['Controller', 'Service', 'UseCase', 'Repository', 'Store', 'Cache', 'Gateway', 'Client'].includes(name))
    .slice(0, 5)

  return [
    { label: 'Status', value: structure.analysisStatus.toLowerCase() },
    { label: 'Backend', value: structure.framework },
    { label: 'Domains', value: `${structure.domains.length} domains / ${endpointCount} APIs` },
    { label: 'Controllers', value: `${controllerCount} detected` },
    { label: 'Source root', value: structure.sourceRoot || 'not detected' },
    { label: 'Infra path', value: structure.infrastructure.join(' / ') || 'not detected' },
    { label: 'Layers', value: layerNames.join(' / ') || 'not detected' },
  ]
}

function getDomainDisplayMode(domain: ProjectDomain): DomainDisplayMode {
  const hasIntegrationBoundary = domain.layers.some((layer) => layer.name === 'Gateway' || layer.name === 'Client')
  if (hasIntegrationBoundary) {
    return {
      label: 'Integration-focused',
      detail: 'This map is highlighting outbound integration boundaries from static analysis.',
      tone: 'integration',
    }
  }

  const runtimeReadySample = domain.endpoints.some((endpoint) =>
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
      label: 'Runtime-ready sample',
      detail: 'This sample domain can produce a live runtime trace in the Trace view.',
      tone: 'runtime',
    }
  }

  return null
}

function buildEstimatedFlow(api: ApiDefinition, domain: ProjectDomain): EstimatedFlowStep[] {
  const layerNames = new Set(domain.layers.map((layer) => layer.name))
  const flow: EstimatedFlowStep[] = [
    {
      id: 'client',
      layer: 'Client',
      label: 'Client',
      detail: 'Request source before Spring handles it.',
      source: 'fixed runtime boundary',
    },
    {
      id: 'controller',
      layer: 'Controller',
      label: api.controller,
      detail: `${api.handler} receives ${getApiMethodLabel(api)} ${api.pathTemplate}.`,
      source: 'detected handler',
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
        ? 'Request-level business flow is likely coordinated here.'
        : 'Business rules are likely coordinated here.',
      source: serviceClass ? 'detected class' : 'estimated layer',
    })
  }

  if (api.requestType === 'QUERY_DETAIL' && domain.infrastructure.includes('Redis')) {
    const cacheClass = pickLayerClass(domain, 'Cache', api)
    flow.push({
      id: 'cache-read',
      layer: 'Cache',
      label: cacheClass ?? 'Redis',
      detail: 'Cache lookup is expected for detail-style reads.',
      source: cacheClass ? 'detected cache class' : 'inferred infrastructure',
    })
  }

  if (layerNames.has('Repository') || layerNames.has('Store')) {
    const layer = layerNames.has('Repository') ? 'Repository' : 'Store'
    const dataClass = pickLayerClass(domain, layer, api)
    flow.push({
      id: 'data-access',
      layer,
      label: dataClass ?? layer,
      detail: 'Data access boundary inferred from layer naming.',
      source: dataClass ? 'detected class' : 'estimated layer',
    })
  }

  if (layerNames.has('Gateway') || layerNames.has('Client')) {
    const layer = layerNames.has('Gateway') ? 'Gateway' : 'Client'
    const integrationClass = pickLayerClass(domain, layer, api)
    flow.push({
      id: layer.toLowerCase(),
      layer,
      label: integrationClass ?? layer,
      detail: 'External integration boundary inferred from class naming.',
      source: integrationClass ? 'detected class' : 'estimated layer',
    })
  }

  if (domain.infrastructure.includes('MySQL')) {
    flow.push({
      id: 'mysql',
      layer: 'Database',
      label: 'MySQL',
      detail: 'Persistence dependency inferred from repository/store classes.',
      source: 'inferred infrastructure',
    })
  }

  if (api.requestType === 'CACHE_WRITE' && domain.infrastructure.includes('Redis')) {
    const cacheClass = pickLayerClass(domain, 'Cache', api)
    flow.push({
      id: 'cache-write',
      layer: 'Cache write',
      label: cacheClass ? `${cacheClass}.save` : 'Redis Save',
      detail: 'Cache write is expected after data refresh.',
      source: cacheClass ? 'detected cache class' : 'inferred infrastructure',
    })
  }

  flow.push({
    id: 'response',
    layer: 'Response',
    label: 'HTTP Response',
    detail: 'Final HTTP response leaves the application.',
    source: 'fixed runtime boundary',
  })
  return flow
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

function createPlaceholderTrace(traceId: string, method: string, endpoint: string, scenario: string): TraceDetail {
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
  }
}

async function fetchTraceWithRetry(traceId: string) {
  const attempts = 5

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`/api/traces/${traceId}`)
    if (response.ok) {
      return (await response.json()) as TraceDetail
    }

    await new Promise((resolve) => window.setTimeout(resolve, 220))
  }

  throw new Error('Trace detail could not be loaded.')
}

function buildRequestMessage(resultStatus: EventStatus, payload: ProductPayload) {
  if (payload.errorMessage) {
    return `${resultStatus}: ${payload.errorMessage}`
  }

  if (payload.cacheStatus) {
    return `${resultStatus}: product flow captured with cache ${payload.cacheStatus}.`
  }

  return `${resultStatus}: request captured successfully.`
}

function buildExternalRequestMessage(response: ExternalRequestResponse) {
  if (response.errorMessage) {
    return `ERROR: ${response.errorMessage}`
  }

  return `${response.resultStatus}: ${response.method} ${response.targetUrl} returned HTTP ${response.httpStatus} in ${response.durationMs}ms.`
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
  return `${normalizedBase || 'http://localhost:8081'}${normalizedPath}${queryString ? `?${queryString}` : ''}`
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

export default App
