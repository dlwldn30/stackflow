import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

describe('AppShell', () => {
  it('renders the shared workflow frame without changing its children', () => {
    render(
      <AppShell
        activeView="project"
        projectName="trace-lab"
        projectStatus="SUCCESS"
        analysisTarget="external"
        hasDetectedApis
        requestReady
        traceId={null}
        traceResultStatus="IDLE"
        traceDisplayStatus="대기"
        traceEventCount={0}
        onViewChange={vi.fn()}
      >
        <section>작업 화면</section>
      </AppShell>,
    )

    expect(screen.getByText('trace-lab')).toBeInTheDocument()
    expect(screen.getByText('작업 화면')).toBeInTheDocument()
    expect(screen.getAllByText('분석 완료')).toHaveLength(2)
    expect(screen.queryByLabelText('분석 증거 단계')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'StackFlow 작업 단계' })).toBeInTheDocument()
  })

  it('shows the active API readiness in the header and navigation', () => {
    const { container } = render(
      <AppShell
        activeView="api"
        projectName="analysis-only"
        projectStatus="SUCCESS"
        analysisTarget="external"
        hasDetectedApis
        requestReady={false}
        traceId={null}
        traceResultStatus="IDLE"
        traceDisplayStatus="대기"
        traceEventCount={0}
        onViewChange={vi.fn()}
      >
        <section>API 화면</section>
      </AppShell>,
    )

    expect(within(container).getAllByText('정적 분석만')).toHaveLength(2)
    expect(within(container).getByRole('button', { name: /API 요청/ })).toHaveAttribute('aria-current', 'page')
  })
})
