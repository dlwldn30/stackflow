import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProjectView } from './ProjectView'
import { RequestView } from './RequestView'
import { TraceView } from './TraceView'

describe('workflow view boundaries', () => {
  it('renders only active view content', () => {
    render(
      <>
        <ProjectView active>프로젝트 화면</ProjectView>
        <RequestView active={false}>요청 화면</RequestView>
        <TraceView active={false}>Trace 화면</TraceView>
      </>,
    )
    expect(screen.getByText('프로젝트 화면')).toBeInTheDocument()
    expect(screen.queryByText('요청 화면')).not.toBeInTheDocument()
    expect(screen.queryByText('Trace 화면')).not.toBeInTheDocument()
  })
})
