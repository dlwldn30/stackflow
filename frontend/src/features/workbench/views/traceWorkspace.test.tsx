import { fireEvent, render, screen } from '@testing-library/react'
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
  metadata: { 'db.system.name': 'postgresql', 'db.operation.name': 'SELECT' },
  spanId: 'postgres', parentSpanId: 'service', serviceName: 'trace-lab', spanKind: 'CLIENT',
}

const detail: TraceDetail = {
  traceId: 'trace', method: 'GET', endpoint: '/lab/products/1001/database-timeout', scenario: 'timeout',
  startedAt: new Date(0).toISOString(), endedAt: new Date(25).toISOString(), durationMs: 25,
  httpStatus: 504, resultStatus: 'TIMEOUT', events: [failureEvent], source: 'OPENTELEMETRY', serviceName: 'trace-lab',
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

  it('changes the recent trace filter explicitly', () => {
    const onFilterChange = vi.fn()
    const traces: TraceSummary[] = [{
      traceId: 'trace', endpoint: '/lab/products/1001', scenario: 'normal', resultStatus: 'SUCCESS',
      httpStatus: 200, durationMs: 12, startedAt: new Date(0).toISOString(),
    }]
    render(
      <TraceHistoryPanel traces={traces} totalCount={1} filter="all" selectedTraceId={null} onFilterChange={onFilterChange} onSelectTrace={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '확인 필요' }))
    expect(onFilterChange).toHaveBeenCalledWith('attention')
  })

  it('shows selected span facts and keeps raw details collapsed', () => {
    const selectedNode: GraphNodeState = {
      id: 'postgres', component: 'POSTGRESQL', label: 'SELECT product', status: 'TIMEOUT',
      durationMs: 25, active: true, visits: [failureEvent],
    }
    render(<TraceInspector trace={detail} selectedNode={selectedNode} selectedEvent={failureEvent} formattedResponseBody={'{"status":504}'} />)
    expect(screen.getByRole('heading', { name: 'SELECT product' })).toBeInTheDocument()
    expect(screen.getByText('SQLTimeoutException')).toBeInTheDocument()
    expect(screen.getByText('postgresql')).toBeInTheDocument()
    expect(screen.getByText('전체 metadata').closest('details')).not.toHaveAttribute('open')
    expect(screen.getByText('응답 JSON').closest('details')).not.toHaveAttribute('open')
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
