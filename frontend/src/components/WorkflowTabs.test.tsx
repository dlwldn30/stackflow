import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WorkflowTabs } from './WorkflowTabs'

describe('WorkflowTabs', () => {
  it('moves to an available workflow view', async () => {
    const onChange = vi.fn()
    render(
      <WorkflowTabs
        activeView="project"
        projectStatus="SUCCESS"
        hasDetectedApis
        requestReady
        traceAvailable={false}
        externalProject
        onChange={onChange}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /API 요청/ }))
    expect(onChange).toHaveBeenCalledWith('api')
    expect(screen.getByRole('button', { name: /프로젝트 구조/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('분석 완료')).toBeInTheDocument()
    expect(screen.getByText('요청 가능')).toBeInTheDocument()
    expect(screen.getByText('요청 후 확인')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Trace/ })).toBeDisabled()
  })

  it('distinguishes analysis-only APIs from unavailable workflow stages', () => {
    const { container, rerender } = render(
      <WorkflowTabs
        activeView="api"
        projectStatus="SUCCESS"
        hasDetectedApis
        requestReady={false}
        traceAvailable={false}
        externalProject={false}
        onChange={vi.fn()}
      />,
    )

    expect(within(container).getByText('정적 분석만')).toBeInTheDocument()
    expect(within(container).getByRole('button', { name: /API 요청/ })).toBeEnabled()
    expect(within(container).getByRole('button', { name: /Trace/ })).toBeEnabled()

    rerender(
      <WorkflowTabs
        activeView="project"
        projectStatus="FAILED"
        hasDetectedApis={false}
        requestReady={false}
        traceAvailable={false}
        externalProject
        onChange={vi.fn()}
      />,
    )

    expect(within(container).getByText('분석 실패')).toBeInTheDocument()
    expect(within(container).getByText('분석 후 사용')).toBeInTheDocument()
    expect(within(container).getByText('API 준비 필요')).toBeInTheDocument()
    expect(within(container).getByRole('button', { name: /API 요청/ })).toBeDisabled()
    expect(within(container).getByRole('button', { name: /Trace/ })).toBeDisabled()
  })
})
