import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useProjectWorkspace } from './useProjectWorkspace'
import { useRequestExecution } from './useRequestExecution'
import { useTraceRuntime } from './useTraceRuntime'
import type { ApiDefinition } from '../types'
import type { ProjectStructure } from '../../../types/trace'

vi.mock('../../../hooks/useInstrumentationStatus', () => ({
  useInstrumentationStatus: () => ({ state: 'idle', status: null, retry: vi.fn() }),
}))

const api: ApiDefinition = {
  id: 'product-list', method: 'GET', methodSpecified: true, label: '상품 목록',
  pathTemplate: '/products', description: '', requestType: 'QUERY_LIST',
  requiresProductId: false, controller: 'ProductController', handler: 'list',
  domainId: 'product', domainName: 'Product', source: 'analyzed', buildPath: () => '/products',
}

const structure = {
  projectName: 'lab', framework: 'Spring Boot', frameworkEvidence: '', analysisStatus: 'SUCCESS',
  sourceRoot: 'src/main/java', analysisMessage: '', infrastructure: [], infrastructureDetails: [],
  layers: [], domains: [{ id: 'product', name: 'Product', description: '', responsibilities: [],
    infrastructure: [], infrastructureDetails: [], controllers: [], layers: [], endpoints: [], packageRoots: [] }],
  analysisCoverage: { sourceRoots: [], scannedJavaFiles: 0, controllerCandidates: 0,
    detectedControllers: 0, detectedEndpoints: 0, warnings: [] },
} satisfies ProjectStructure

describe('workbench state hooks', () => {
  it('owns project and API selection state', () => {
    const { result } = renderHook(() => useProjectWorkspace(structure, [api]))
    expect(result.current.selectedDomainId).toBe('product')
    expect(result.current.selectedApiId).toBe('product-list')
    act(() => result.current.setAnalysisTarget('external'))
    expect(result.current.analysisTarget).toBe('external')
  })

  it('owns request editor entry actions', () => {
    let sequence = 0
    const createEntry = (key: string, value: string, enabled: boolean) => ({ id: `${++sequence}`, key, value, enabled })
    const { result } = renderHook(() => useRequestExecution(createEntry))
    expect(result.current.queryParams).toEqual([])
    act(() => result.current.addQueryParam())
    expect(result.current.queryParams).toHaveLength(1)
    const addedEntryId = result.current.queryParams[0].id
    act(() => result.current.updateQueryParam(addedEntryId, { key: 'size', value: '10' }))
    expect(result.current.queryParams[0]).toMatchObject({ key: 'size', value: '10' })
    act(() => result.current.setEndpointSearch('product'))
    expect(result.current.endpointSearch).toBe('product')
  })

  it('aborts the previous external request on a new run and unmount', () => {
    const { result, unmount } = renderHook(() => useRequestExecution(() => ({ id: '1', key: '', value: '', enabled: true })))

    let first: AbortController
    let second: AbortController
    act(() => {
      first = result.current.beginExternalRequest()
      second = result.current.beginExternalRequest()
    })

    expect(first!.signal.aborted).toBe(true)
    expect(second!.signal.aborted).toBe(false)
    act(() => result.current.completeExternalRequest(first!))
    expect(second!.signal.aborted).toBe(false)
    unmount()
    expect(second!.signal.aborted).toBe(true)
  })

  it('owns trace selection and stream lifecycle references', () => {
    const { result, unmount } = renderHook(() => useTraceRuntime())
    act(() => {
      result.current.setStreamStatus('streaming')
      result.current.setSelectedNodeId('span-1')
    })
    expect(result.current.streamStatus).toBe('streaming')
    expect(result.current.selectedNodeId).toBe('span-1')
    expect(result.current.activeStreamRef.current).toBeNull()
    const close = vi.fn()
    result.current.activeStreamRef.current = { close } as unknown as EventSource
    unmount()
    expect(close).toHaveBeenCalledOnce()
  })
})
