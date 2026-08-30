import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StackFlowWorkbench } from '../StackFlowWorkbench'

const mocks = vi.hoisted(() => ({
  activeView: 'project' as 'project' | 'api' | 'runtime',
}))

vi.mock('../hooks/useWorkbenchController', () => ({
  useWorkbenchController: () => ({
    shell: {
      activeView: mocks.activeView,
      setActiveView: vi.fn(),
      projectName: 'backend',
      projectStatus: 'SUCCESS',
      analysisTarget: 'sample',
      hasDetectedApis: true,
      requestReady: true,
      traceId: mocks.activeView === 'runtime' ? 'trace-1' : null,
      traceCollectionPresentation: { label: 'Trace 대기', tone: 'neutral' },
    },
    projectView: {},
    requestView: {},
    traceView: {},
  }),
}))
vi.mock('./ProjectView', () => ({ ProjectView: () => <div>프로젝트 화면</div> }))
vi.mock('./RequestView', () => ({ RequestView: () => <div>요청 화면</div> }))
vi.mock('./TraceView', () => ({ TraceView: () => <div>Trace 화면</div> }))

describe('workflow view boundaries', () => {
  afterEach(cleanup)

  beforeEach(() => {
    mocks.activeView = 'project'
  })

  it.each([
    ['project', '프로젝트 화면'],
    ['api', '요청 화면'],
    ['runtime', 'Trace 화면'],
  ] as const)('renders only the %s view', (activeView, expectedText) => {
    mocks.activeView = activeView
    render(<StackFlowWorkbench />)
    expect(screen.getByText(expectedText)).toBeInTheDocument()
    expect(screen.queryAllByText(/^(프로젝트 화면|요청 화면|Trace 화면)$/)).toHaveLength(1)
  })
})
