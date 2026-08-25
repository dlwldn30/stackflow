import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiDefinition } from '../types'
import { EndpointExplorer } from './EndpointExplorer'
import { RequestComposer } from './RequestComposer'

const api: ApiDefinition = {
  id: 'product-list',
  method: 'GET',
  methodSpecified: true,
  label: '상품 목록',
  pathTemplate: '/lab/products',
  description: 'ProductController.getProducts에서 감지했습니다.',
  requestType: 'QUERY_LIST',
  requiresProductId: false,
  controller: 'ProductController',
  handler: 'getProducts',
  domainId: 'product',
  domainName: 'Product',
  source: 'analyzed',
  buildPath: () => '/lab/products',
}

function requestComposerProps(
  overrides: Partial<ComponentProps<typeof RequestComposer>> = {},
): ComponentProps<typeof RequestComposer> {
  return {
    selectedApi: api,
    domainName: 'Product',
    methodLabel: 'GET',
    methodClassName: 'method-badge--get',
    runtimeModeLabel: '외부 API 요청',
    runtimeSupported: false,
    externalRunnable: true,
    externalTraceConfigured: false,
    externalTraceVerified: false,
    analyzeOnly: false,
    hasDetectedApis: true,
    targetBaseUrl: 'http://localhost:8091',
    externalPath: '/lab/products',
    externalTargetPreview: 'http://localhost:8091/lab/products',
    productId: '1001',
    scenario: 'normal',
    requestOptionTab: 'query',
    queryParams: [],
    requestHeaders: [],
    requestBody: '{}',
    requestBodyError: null,
    bodyAllowed: false,
    requestState: 'idle',
    requestMessage: 'API를 선택하고 요청을 실행하세요.',
    externalResponse: null,
    traceDetail: null,
    traceCollectionStatus: 'DISABLED',
    formattedExternalResponseBody: null,
    formattedResponseBody: null,
    onBackProject: vi.fn(),
    onTargetBaseUrlChange: vi.fn(),
    onProductIdChange: vi.fn(),
    onScenarioChange: vi.fn(),
    onRequestOptionTabChange: vi.fn(),
    onRequestBodyChange: vi.fn(),
    onClearRequestBodyError: vi.fn(),
    onAddQueryParam: vi.fn(),
    onAddRequestHeader: vi.fn(),
    onUpdateQueryParam: vi.fn(),
    onUpdateRequestHeader: vi.fn(),
    onRemoveQueryParam: vi.fn(),
    onRemoveRequestHeader: vi.fn(),
    onRunRequest: vi.fn(),
    onOpenTrace: vi.fn(),
    ...overrides,
  }
}

describe('request workspace', () => {
  it('provides endpoint search and selection actions', () => {
    const onSearchChange = vi.fn()
    const onSelectApi = vi.fn()
    render(
      <EndpointExplorer
        apiCatalogCount={1}
        domainName="Product"
        domainApiCount={1}
        apiScope="domain"
        endpointSearch=""
        visibleApis={[api]}
        selectedApiId={api.id}
        onScopeChange={vi.fn()}
        onSearchChange={onSearchChange}
        onSelectApi={onSelectApi}
      />,
    )

    fireEvent.change(screen.getByRole('searchbox', { name: 'Endpoint 검색' }), { target: { value: 'product' } })
    expect(onSearchChange).toHaveBeenCalledWith('product')
    fireEvent.click(screen.getByRole('button', { name: /GET.*\/lab\/products/u }))
    expect(onSelectApi).toHaveBeenCalledWith(api)
  })

  it('keeps execution disabled when the HTTP method is unspecified', () => {
    render(
      <RequestComposer
        {...requestComposerProps({
          selectedApi: { ...api, methodSpecified: false },
          methodLabel: '메서드 미지정',
          methodClassName: 'method-badge--unspecified',
          runtimeModeLabel: '정적 분석만 가능',
          externalRunnable: false,
          analyzeOnly: true,
          targetBaseUrl: '',
        })}
      />,
    )

    expect(screen.getByRole('button', { name: '정적 분석만 가능' })).toBeDisabled()
    expect(screen.getByText(/HTTP method가 명시되지 않아 요청을 실행할 수 없습니다/u)).toBeInTheDocument()
  })

  it('marks a truncated external response while preserving its text body', () => {
    render(<RequestComposer {...requestComposerProps({
      externalResponse: {
        method: 'GET', targetUrl: 'http://localhost:8091/lab/products', httpStatus: 200,
        durationMs: 12, resultStatus: 'SUCCESS', contentType: 'application/json',
        responseBody: '{"partial":', responseBodyTruncated: true, errorMessage: null,
        traceId: null, traceCollectionStatus: 'DISABLED',
      },
      formattedExternalResponseBody: '{"partial":',
    })} />)

    expect(screen.getByText('1MiB 일부')).toBeInTheDocument()
    expect(screen.getByText('{"partial":')).toBeInTheDocument()
  })
})
