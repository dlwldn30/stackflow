import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExternalRequestResponse } from '../../../types/trace'
import { FALLBACK_API_CATALOG, FALLBACK_PROJECT_STRUCTURE } from '../fixtures'
import { useWorkbenchController } from './useWorkbenchController'

const apiMocks = vi.hoisted(() => ({
  analyzeProject: vi.fn(),
  createInstrumentationProfile: vi.fn(),
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
      result.current.applyProjectStructure(
        FALLBACK_PROJECT_STRUCTURE,
        FALLBACK_API_CATALOG,
        '외부 프로젝트',
        'external',
      )
      result.current.setTargetBaseUrl('http://localhost:8091')
    })
    await waitFor(() => expect(result.current.analysisTarget).toBe('external'))

    let requestPromise: Promise<void> = Promise.resolve()
    act(() => {
      requestPromise = result.current.runExternalRequest()
    })
    await waitFor(() => expect(apiMocks.executeExternalRequest).toHaveBeenCalledOnce())
    const signal = apiMocks.executeExternalRequest.mock.calls[0][1] as AbortSignal
    const nextApi = FALLBACK_API_CATALOG.find((api) => api.id !== result.current.selectedApi.id)!

    act(() => result.current.selectApi(nextApi))
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

    expect(result.current.selectedApi.id).toBe(nextApi.id)
    expect(result.current.externalResponse).toBeNull()
    expect(result.current.requestMessage).toBe('선택한 API의 요청을 작성하세요.')
  })

  it('aborts and ignores an external request when project analysis starts', async () => {
    let resolveRequest: (response: ExternalRequestResponse) => void = () => undefined
    apiMocks.executeExternalRequest.mockImplementation(() => new Promise((resolve) => {
      resolveRequest = resolve
    }))
    apiMocks.analyzeProject.mockResolvedValue(FALLBACK_PROJECT_STRUCTURE)
    const { result } = renderHook(() => useWorkbenchController())

    await waitFor(() => expect(apiMocks.getProjectStructure).toHaveBeenCalledOnce())
    act(() => {
      result.current.applyProjectStructure(FALLBACK_PROJECT_STRUCTURE, FALLBACK_API_CATALOG, '외부 프로젝트', 'external')
      result.current.setTargetBaseUrl('http://localhost:8091')
    })
    await waitFor(() => expect(result.current.analysisTarget).toBe('external'))

    let requestPromise: Promise<void> = Promise.resolve()
    act(() => {
      requestPromise = result.current.runExternalRequest()
    })
    await waitFor(() => expect(apiMocks.executeExternalRequest).toHaveBeenCalledOnce())
    const signal = apiMocks.executeExternalRequest.mock.calls[0][1] as AbortSignal

    await act(async () => result.current.analyzeProjectPath('/workspace/new-project'))
    expect(signal.aborted).toBe(true)

    resolveRequest({
      method: 'GET', targetUrl: 'http://localhost:8091/api/products', httpStatus: 200,
      durationMs: 10, resultStatus: 'SUCCESS', contentType: 'application/json',
      responseBody: '{"status":"late"}', responseBodyTruncated: false, errorMessage: null,
      traceId: null, traceCollectionStatus: 'DISABLED',
    })
    await act(async () => requestPromise)

    expect(result.current.externalResponse).toBeNull()
    expect(result.current.analysisMessage).toBe(FALLBACK_PROJECT_STRUCTURE.analysisMessage)
  })
})
