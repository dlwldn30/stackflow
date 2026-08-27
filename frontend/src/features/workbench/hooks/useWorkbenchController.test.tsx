import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExternalRequestResponse } from '../../../types/trace'
import { FALLBACK_API_CATALOG, FALLBACK_PROJECT_STRUCTURE } from '../fixtures'
import { useWorkbenchController } from './useWorkbenchController'

const apiMocks = vi.hoisted(() => ({
  analyzeProject: vi.fn(),
  analyzeWorkspace: vi.fn(),
  createWorkspaceInstrumentationProfile: vi.fn(),
  createTraceSession: vi.fn(),
  executeExternalRequest: vi.fn(),
  getProjectStructure: vi.fn(),
  getRecentTraces: vi.fn(),
  selectProjectFolder: vi.fn(),
}))

vi.mock('../../../api/stackflow', () => apiMocks)
vi.mock('../../../api/traceStream', () => ({ connectTraceStream: vi.fn() }))
vi.mock('../../../hooks/useInstrumentationStatus', () => ({
  useInstrumentationStatus: () => ({ state: 'idle', status: null, retry: vi.fn() }),
}))
vi.mock('../../../hooks/useWorkspaceInstrumentationStatus', () => ({
  useWorkspaceInstrumentationStatus: () => ({}),
}))

describe('useWorkbenchController request lifecycle', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    apiMocks.getProjectStructure.mockResolvedValue(FALLBACK_PROJECT_STRUCTURE)
    apiMocks.getRecentTraces.mockResolvedValue([])
  })

  it('ignores request A after selecting API B', async () => {
    let resolveRequest: (response: ExternalRequestResponse) => void = () => undefined
    apiMocks.executeExternalRequest.mockImplementation(() => new Promise((resolve) => {
      resolveRequest = resolve
    }))
    const { result } = renderHook(() => useWorkbenchController())

    await waitFor(() => expect(apiMocks.getProjectStructure).toHaveBeenCalledOnce())
    act(() => {
      result.current.projectView.applyProjectStructure(
        FALLBACK_PROJECT_STRUCTURE,
        FALLBACK_API_CATALOG,
        '외부 프로젝트',
        'external',
      )
      result.current.requestView.setTargetBaseUrl('http://localhost:8091')
    })
    await waitFor(() => expect(result.current.projectView.analysisTarget).toBe('external'))

    let requestPromise: Promise<void> = Promise.resolve()
    act(() => {
      requestPromise = result.current.requestView.runExternalRequest()
    })
    await waitFor(() => expect(apiMocks.executeExternalRequest).toHaveBeenCalledOnce())
    const signal = apiMocks.executeExternalRequest.mock.calls[0][1] as AbortSignal
    const nextApi = FALLBACK_API_CATALOG.find((api) => api.id !== result.current.requestView.selectedApi.id)!

    act(() => result.current.requestView.selectApi(nextApi))
    expect(signal.aborted).toBe(true)

    resolveRequest({
      method: 'GET',
      targetUrl: 'http://localhost:8091/api/products',
      httpStatus: 200,
      durationMs: 10,
      resultStatus: 'SUCCESS',
      contentType: 'application/json',
      responseBody: '{"status":"late"}',
      responseBodyTruncated: false,
      errorMessage: null,
      traceId: null,
      traceCollectionStatus: 'DISABLED',
    })
    await act(async () => requestPromise)

    expect(result.current.requestView.selectedApi.id).toBe(nextApi.id)
    expect(result.current.requestView.externalResponse).toBeNull()
    expect(result.current.requestView.requestMessage).toBe('선택한 API의 요청을 작성하세요.')
  })

  it('aborts and ignores an external request when project analysis starts', async () => {
    let resolveRequest: (response: ExternalRequestResponse) => void = () => undefined
    apiMocks.executeExternalRequest.mockImplementation(() => new Promise((resolve) => {
      resolveRequest = resolve
    }))
    apiMocks.analyzeWorkspace.mockResolvedValue({
      workspaceName: 'new-project',
      services: [{ serviceId: 'sample', relativePath: '.', structure: FALLBACK_PROJECT_STRUCTURE }],
      warnings: [],
    })
    const { result } = renderHook(() => useWorkbenchController())

    await waitFor(() => expect(apiMocks.getProjectStructure).toHaveBeenCalledOnce())
    act(() => {
      result.current.projectView.applyProjectStructure(FALLBACK_PROJECT_STRUCTURE, FALLBACK_API_CATALOG, '외부 프로젝트', 'external')
      result.current.requestView.setTargetBaseUrl('http://localhost:8091')
    })
    await waitFor(() => expect(result.current.projectView.analysisTarget).toBe('external'))

    let requestPromise: Promise<void> = Promise.resolve()
    act(() => {
      requestPromise = result.current.requestView.runExternalRequest()
    })
    await waitFor(() => expect(apiMocks.executeExternalRequest).toHaveBeenCalledOnce())
    const signal = apiMocks.executeExternalRequest.mock.calls[0][1] as AbortSignal

    await act(async () => result.current.projectView.analyzeProjectPath('/workspace/new-project'))
    expect(signal.aborted).toBe(true)

    resolveRequest({
      method: 'GET', targetUrl: 'http://localhost:8091/api/products', httpStatus: 200,
      durationMs: 10, resultStatus: 'SUCCESS', contentType: 'application/json',
      responseBody: '{"status":"late"}', responseBodyTruncated: false, errorMessage: null,
      traceId: null, traceCollectionStatus: 'DISABLED',
    })
    await act(async () => requestPromise)

    expect(result.current.requestView.externalResponse).toBeNull()
    expect(result.current.projectView.analysisMessage).toContain('1개 서비스를 분석했습니다')
  })

  it('stores the generated instrumentation profile in the project view model', async () => {
    const profile = {
      projectName: 'orders', serviceName: 'orders', buildTool: 'GRADLE',
      collectorEndpoint: 'http://localhost:18080', agentPath: '/tmp/agent.jar',
      instrumentedClasses: ['com.example.OrderService'], instrumentedMethodCount: 1,
      methodsInclude: 'com.example.OrderService[find]', environment: {},
      commands: { gradle: './gradlew bootRun' }, profileId: 'profile-1',
      connectionStatus: 'PROFILE_GENERATED' as const,
      createdAt: '2026-08-25T00:00:00Z', lastSeenAt: null,
    }
    apiMocks.createWorkspaceInstrumentationProfile.mockResolvedValue({
      workspaceName: 'orders',
      profiles: [{ serviceId: 'orders', relativePath: '.', workingDirectory: '/workspace/orders', profile }],
    })
    const { result } = renderHook(() => useWorkbenchController())
    await waitFor(() => expect(apiMocks.getProjectStructure).toHaveBeenCalledOnce())

    act(() => {
      result.current.projectView.applyProjectStructure(
        FALLBACK_PROJECT_STRUCTURE,
        FALLBACK_API_CATALOG,
        '외부 프로젝트',
        'external',
      )
      result.current.projectView.setProjectPath('/workspace/orders')
      result.current.projectView.setSelectedServiceId('orders')
    })
    await act(async () => result.current.projectView.generateInstrumentationProfile())

    expect(result.current.projectView.profileState).toBe('idle')
    expect(result.current.projectView.instrumentationProfile).toEqual(profile)
  })

  it('changes the project, domain, and API selection as one service boundary', async () => {
    const productStructure = { ...FALLBACK_PROJECT_STRUCTURE, projectName: 'product-service' }
    const orderStructure = {
      ...FALLBACK_PROJECT_STRUCTURE,
      projectName: 'order-service',
      domains: FALLBACK_PROJECT_STRUCTURE.domains.slice(0, 1),
    }
    const services = [
      { serviceId: 'order-service', relativePath: 'order-service', structure: orderStructure },
      { serviceId: 'product-service', relativePath: 'product-service', structure: productStructure },
    ]
    const { result } = renderHook(() => useWorkbenchController())
    await waitFor(() => expect(apiMocks.getProjectStructure).toHaveBeenCalledOnce())

    act(() => {
      result.current.projectView.setWorkspace({ workspaceName: 'lab', services, warnings: [] })
      result.current.projectView.setSelectedServiceId('order-service')
      result.current.projectView.selectService(services[1])
    })

    expect(result.current.projectView.projectStructure.projectName).toBe('product-service')
    expect(result.current.projectView.selectedApi.id).toMatch(/^product-service:/)
    expect(result.current.projectView.selectedDomain.id).toBe(productStructure.domains[0].id)
  })
})
