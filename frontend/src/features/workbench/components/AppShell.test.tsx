import { render, screen } from '@testing-library/react'
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
    expect(screen.getByText('분석 완료')).toBeInTheDocument()
  })
})
