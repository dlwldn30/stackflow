import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WorkflowTabs } from './WorkflowTabs'

describe('WorkflowTabs', () => {
  it('moves to an available workflow view', async () => {
    const onChange = vi.fn()
    render(
      <WorkflowTabs
        activeView="project"
        hasDetectedApis
        traceAvailable={false}
        externalProject
        onChange={onChange}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /API 요청/ }))
    expect(onChange).toHaveBeenCalledWith('api')
    expect(screen.getByRole('button', { name: /Trace/ })).toBeDisabled()
  })
})
