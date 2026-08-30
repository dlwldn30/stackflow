import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiDefinition } from '../types'
import { buildRequestResponsePresentation } from '../requestModel'
import { EndpointExplorer } from './EndpointExplorer'
import { RequestComposer } from './RequestComposer'
import { RequestResponsePanel } from './RequestResponsePanel'

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

afterEach(cleanup)

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
    traceCollectionStatus: 'DISABLED',
    responseAvailable: false,
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

  it('keeps execution disabled until a target URL is provided', () => {
    render(<RequestComposer {...requestComposerProps({ targetBaseUrl: '' })} />)

    expect(screen.getByRole('button', { name: '외부 API 요청' })).toBeDisabled()
    expect(screen.getByText('요청을 실행하려면 대상 기본 URL을 입력하세요.')).toBeInTheDocument()
  })

  it('keeps execution disabled while the request body is invalid JSON', () => {
    render(
      <RequestComposer
        {...requestComposerProps({
          selectedApi: { ...api, method: 'POST' },
          methodLabel: 'POST',
          methodClassName: 'method-badge--post',
          bodyAllowed: true,
          requestOptionTab: 'body',
          requestBody: '{invalid',
        })}
      />,
    )

    expect(screen.getByRole('button', { name: '외부 API 요청' })).toBeDisabled()
    expect(screen.getByText('요청 본문은 올바른 JSON 형식이어야 합니다.')).toBeInTheDocument()
  })

  it('marks a truncated external response while preserving its text body', () => {
    const presentation = buildRequestResponsePresentation({
      externalRunnable: true,
      requestState: 'idle',
      requestMessage: '',
      externalResponse: {
        method: 'GET', targetUrl: 'http://localhost:8091/lab/products', httpStatus: 200,
        durationMs: 12, resultStatus: 'SUCCESS', contentType: 'application/json',
        responseBody: '{"partial":', responseBodyTruncated: true, errorMessage: null,
        traceId: null, traceCollectionStatus: 'DISABLED',
      },
      traceDetail: null,
      traceCollectionStatus: 'DISABLED',
      sampleResponseBody: null,
    })
    render(<RequestResponsePanel presentation={presentation} onOpenTrace={vi.fn()} />)

    expect(screen.getByText('1MiB 일부')).toBeInTheDocument()
    expect(screen.getByText('{"partial":')).toBeInTheDocument()
  })

  it('separates a successful HTTP response from a span collection timeout', () => {
    const presentation = buildRequestResponsePresentation({
      externalRunnable: true,
      requestState: 'idle',
      requestMessage: '',
      externalResponse: {
        method: 'GET', targetUrl: 'http://localhost:8091/lab/products', httpStatus: 200,
        durationMs: 12, resultStatus: 'SUCCESS', contentType: 'application/json',
        responseBody: '{"ok":true}', responseBodyTruncated: false, errorMessage: null,
        traceId: 'trace-id', traceCollectionStatus: 'TIMED_OUT',
      },
      traceDetail: null,
      traceCollectionStatus: 'TIMED_OUT',
      sampleResponseBody: null,
    })
    render(<RequestResponsePanel presentation={presentation} onOpenTrace={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '요청 성공' })).toBeInTheDocument()
    expect(screen.getByText('HTTP 200')).toBeInTheDocument()
    expect(screen.getByText(/Span 수집 시간이 초과됐습니다/u)).toBeInTheDocument()
  })

  it('shows a transport failure without inventing an HTTP status', () => {
    const presentation = buildRequestResponsePresentation({
      externalRunnable: true,
      requestState: 'error',
      requestMessage: '대상 서버에 연결할 수 없습니다.',
      externalResponse: null,
      traceDetail: null,
      traceCollectionStatus: 'DISABLED',
      sampleResponseBody: null,
    })
    render(<RequestResponsePanel presentation={presentation} onOpenTrace={vi.fn()} />)

    expect(screen.getByText('전송 실패')).toBeInTheDocument()
    expect(screen.getByText('대상 서버에 연결할 수 없습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trace에서 보기' })).not.toBeInTheDocument()
  })
})
