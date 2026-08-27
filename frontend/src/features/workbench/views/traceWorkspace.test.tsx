import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GraphNodeState, TraceDetail, TraceEvent, TraceSummary } from '../../../types/trace'
import { TraceWaterfall } from '../../../components/TraceWaterfall'
import { buildWaterfall } from '../../../lib/waterfall'
import { TraceHistoryPanel } from './TraceHistoryPanel'
import { TraceInspector } from './TraceInspector'
import { TraceOutcomeSummary } from './TraceOutcomeSummary'

const failureEvent: TraceEvent = {
  eventId: 'postgres', traceId: 'trace', component: 'POSTGRESQL', eventType: 'SELECT product', status: 'TIMEOUT',
  startedAt: new Date(0).toISOString(), endedAt: new Date(25).toISOString(), durationMs: 25,
  errorType: 'SQLTimeoutException', errorMessage: 'query timed out',
  metadata: { productId: '1001', 'db.system.name': 'postgresql', 'db.operation.name': 'SELECT' },
  spanId: 'postgres', parentSpanId: 'service', serviceName: 'trace-lab', spanKind: 'CLIENT',
  stackTrace: null, stackTraceTruncated: false,
}

const detail: TraceDetail = {
  traceId: 'trace', method: 'GET', endpoint: '/lab/products/1001/database-timeout', scenario: 'timeout',
  startedAt: new Date(0).toISOString(), endedAt: new Date(25).toISOString(), durationMs: 25,
  httpStatus: 504, resultStatus: 'TIMEOUT', events: [failureEvent], source: 'OPENTELEMETRY', serviceName: 'trace-lab',
  serviceNames: ['trace-lab'],
  traceCollectionStatus: 'COMPLETED',
  responsePreview: { contentType: 'application/json', body: '{"status":504}', truncated: false },
}

describe('Trace workspace presentation', () => {
  it('shows the primary cause and propagation path', () => {
    render(
      <TraceOutcomeSummary
        trace={detail}
        outcome="failure"
        failureEvent={failureEvent}
        failureLabel="SELECT product"
        propagationPath={[failureEvent, { ...failureEvent, eventId: 'service', spanId: 'service', eventType: 'ProductService' }]}
        onInspectFailure={vi.fn()}
      />,
    )
    expect(screen.getByText('주요 실패 원인')).toBeInTheDocument()
    expect(screen.getByLabelText('오류 전파 경로')).toHaveTextContent('SELECT product')
    expect(screen.getByLabelText('오류 전파 경로')).toHaveTextContent('ProductService')
  })

  it('separates span collection timeout from an HTTP request failure', () => {
    const { container } = render(
      <TraceOutcomeSummary
        trace={{ ...detail, httpStatus: 200, resultStatus: 'SUCCESS', events: [], traceCollectionStatus: 'TIMED_OUT' }}
        outcome="collection_timeout"
        failureEvent={null}
        failureLabel={null}
        propagationPath={[]}
        onInspectFailure={vi.fn()}
      />,
    )
    expect(within(container).getAllByText('Span 수집 시간 초과')).not.toHaveLength(0)
    expect(within(container).queryByText('요청 실패')).not.toBeInTheDocument()
  })

  it('changes the recent trace filter explicitly', () => {
    const onFilterChange = vi.fn()
    const traces: TraceSummary[] = [{
      traceId: 'trace', endpoint: '/lab/products/1001', scenario: 'normal', resultStatus: 'SUCCESS',
      httpStatus: 200, durationMs: 12, startedAt: new Date(0).toISOString(), traceCollectionStatus: 'DISABLED',
    }]
    render(
      <TraceHistoryPanel traces={traces} totalCount={1} filter="all" selectedTraceId={null} onFilterChange={onFilterChange} onSelectTrace={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '확인 필요' }))
    expect(onFilterChange).toHaveBeenCalledWith('attention')
  })

  it('labels a collection timeout without presenting it as an application timeout', () => {
    const traces: TraceSummary[] = [{
      traceId: 'trace', endpoint: '/lab/products/1001', scenario: 'external-opentelemetry', resultStatus: 'SUCCESS',
      httpStatus: 200, durationMs: 12, startedAt: new Date(0).toISOString(), traceCollectionStatus: 'TIMED_OUT',
    }]
    const { container } = render(
      <TraceHistoryPanel traces={traces} totalCount={1} filter="all" selectedTraceId={null} onFilterChange={vi.fn()} onSelectTrace={vi.fn()} />,
    )
    const timeoutPill = within(container).getByText('수집 시간 초과')
    expect(timeoutPill).toHaveClass('pill--warning')
  })

  it('shows selected span facts and keeps raw details collapsed', () => {
    const selectedNode: GraphNodeState = {
      id: 'postgres', component: 'POSTGRESQL', label: 'SELECT product', status: 'TIMEOUT',
      durationMs: 25, active: true, visits: [failureEvent],
    }
    const { container } = render(
      <TraceInspector
        trace={detail}
        selectedNode={selectedNode}
        selectedEvent={failureEvent}
        primaryFailureEvent={failureEvent}
        primaryFailureLabel="SELECT product"
        onInspectPrimaryFailure={vi.fn()}
      />,
    )
    const inspector = within(container)
    expect(inspector.getByRole('heading', { name: 'SELECT product' })).toBeInTheDocument()
    expect(inspector.getByText('SQLTimeoutException')).toBeInTheDocument()
    expect(inspector.getAllByText('postgresql')).toHaveLength(2)
    expect(inspector.getByText('상품 ID')).toBeInTheDocument()
    expect(inspector.getByText('전체 metadata').closest('details')).not.toHaveAttribute('open')
    expect(inspector.getByText('요청 응답').closest('details')).toHaveAttribute('open')
  })

  it('shows legacy exception location metadata and keeps a bounded stacktrace collapsed', () => {
    const eventWithStackTrace: TraceEvent = {
      ...failureEvent,
      metadata: {
        ...failureEvent.metadata,
        'code.namespace': 'com.example.product.ProductService',
        'code.function': 'lookupProduct',
        'code.filepath': '~/workspace/ProductService.java',
        'code.lineno': '73',
      },
      stackTrace: 'java.sql.SQLTimeoutException: query timed out\n\tat com.example.product.ProductService.lookupProduct(ProductService.java:73)',
      stackTraceTruncated: true,
    }
    const selectedNode: GraphNodeState = {
      id: 'postgres', component: 'POSTGRESQL', label: 'SELECT product', status: 'TIMEOUT',
      durationMs: 25, active: true, visits: [eventWithStackTrace],
    }
    const { container } = render(
      <TraceInspector
        trace={{ ...detail, events: [eventWithStackTrace] }}
        selectedNode={selectedNode}
        selectedEvent={eventWithStackTrace}
        primaryFailureEvent={eventWithStackTrace}
        primaryFailureLabel="SELECT product"
        onInspectPrimaryFailure={vi.fn()}
      />,
    )

    const inspector = within(container)
    const locationSection = inspector.getByText('오류 발생 위치').closest('section') as HTMLElement
    const location = within(locationSection)
    expect(location.getByText('com.example.product.ProductService')).toBeInTheDocument()
    expect(location.getByText('lookupProduct')).toBeInTheDocument()
    expect(location.getByText('~/workspace/ProductService.java')).toBeInTheDocument()
    expect(location.getByText('73')).toBeInTheDocument()
    const stackTraceDetails = inspector.getByText('Stacktrace').closest('details')
    expect(stackTraceDetails).not.toHaveAttribute('open')
    expect(inspector.getByText('16KiB 일부')).toBeInTheDocument()
  })

  it('explains when the agent did not provide code location or a stacktrace', () => {
    const selectedNode: GraphNodeState = {
      id: 'postgres', component: 'POSTGRESQL', label: 'SELECT product', status: 'TIMEOUT',
      durationMs: 25, active: true, visits: [failureEvent],
    }
    const { container } = render(
      <TraceInspector
        trace={detail}
        selectedNode={selectedNode}
        selectedEvent={failureEvent}
        primaryFailureEvent={failureEvent}
        primaryFailureLabel="SELECT product"
        onInspectPrimaryFailure={vi.fn()}
      />,
    )

    const inspector = within(container)
    expect(inspector.getByText('코드 위치가 수집되지 않았습니다.')).toBeInTheDocument()
    expect(inspector.getByText('Agent가 stacktrace를 제공하지 않았습니다.')).toBeInTheDocument()
    expect(inspector.queryByText('Stacktrace')).not.toBeInTheDocument()
  })

  it('distinguishes a propagated parent error from the actual failure span', () => {
    const onInspectPrimaryFailure = vi.fn()
    const controllerEvent = {
      ...failureEvent,
      eventId: 'controller',
      spanId: 'controller',
      parentSpanId: null,
      component: 'CONTROLLER' as const,
      eventType: 'ProductController.getProduct',
    }
    const selectedNode: GraphNodeState = {
      id: 'controller', component: 'CONTROLLER', label: 'ProductController.getProduct', status: 'TIMEOUT',
      durationMs: 25, active: true, visits: [controllerEvent],
    }

    render(
      <TraceInspector
        trace={detail}
        selectedNode={selectedNode}
        selectedEvent={controllerEvent}
        primaryFailureEvent={failureEvent}
        primaryFailureLabel="ProductService.lookupProduct"
        onInspectPrimaryFailure={onInspectPrimaryFailure}
      />,
    )

    expect(screen.getByText('상위로 전파된 오류')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '실제 시작 지점 ProductService.lookupProduct 확인' }))
    expect(onInspectPrimaryFailure).toHaveBeenCalledOnce()
  })

  it('keeps a collection-timeout response collapsed and shows it without a selected span', () => {
    const traceWithoutSpans: TraceDetail = {
      ...detail,
      traceId: 'collection-timeout',
      resultStatus: 'ERROR',
      httpStatus: 500,
      events: [],
      traceCollectionStatus: 'TIMED_OUT',
      responsePreview: { contentType: 'text/plain', body: 'request completed', truncated: true },
    }
    const { container } = render(
      <TraceInspector
        trace={traceWithoutSpans}
        selectedNode={null}
        selectedEvent={null}
        primaryFailureEvent={null}
        primaryFailureLabel={null}
        onInspectPrimaryFailure={vi.fn()}
      />,
    )

    const inspector = within(container)
    const responseDetails = inspector.getByText('요청 응답').closest('details')
    expect(responseDetails).not.toHaveAttribute('open')
    expect(inspector.getByText('텍스트 · 64KiB 일부')).toBeInTheDocument()
    fireEvent.click(inspector.getByText('요청 응답'))
    expect(responseDetails).toHaveAttribute('open')
    expect(inspector.getByText('request completed')).toBeInTheDocument()
  })

  it('uses the component id when a sample Waterfall event has no span id', () => {
    const onSelectSpan = vi.fn()
    const sampleEvent = { ...failureEvent, spanId: null, parentSpanId: null, component: 'SERVICE' as const, eventType: 'ProductService.lookupProduct' }
    render(
      <TraceWaterfall
        model={buildWaterfall([sampleEvent])}
        selectedSpanId={null}
        primaryFailureSpanId="SERVICE"
        onSelectSpan={onSelectSpan}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /ProductService\.lookupProductSERVICE/ }))
    expect(onSelectSpan).toHaveBeenCalledWith('SERVICE')
  })
})
