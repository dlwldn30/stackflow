import type { ProjectAnalysisStatus, ProjectDomain, ProjectStructure, TraceDetail } from '../../types/trace'
import type { ApiDefinition, ProjectStatusContent } from './types'

export const SCENARIOS = [
  { value: 'normal', label: '정상 요청' },
  { value: 'redis-down', label: 'Redis 연결 실패' },
  { value: 'db-timeout', label: '모의 DB 오류' },
  { value: 'service-error', label: 'Service 오류' },
] as const

export function matchesTraceEndpoint(api: ApiDefinition, trace: TraceDetail) {
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
export const EMPTY_DOMAIN: ProjectDomain = {
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

export const EMPTY_API_DEFINITION: ApiDefinition = {
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

export const PROJECT_STATUS_CONTENT: Record<ProjectAnalysisStatus, ProjectStatusContent> = {
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

export const FALLBACK_API_CATALOG: ApiDefinition[] = [
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

export const FALLBACK_PROJECT_STRUCTURE: ProjectStructure = {
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
