import { Braces, FolderTree, Route } from 'lucide-react'
import type { ProjectAnalysisStatus } from '../types/trace'
import { VIEW_COPY } from '../ui/copy'
import type { ViewMode } from '../ui/copy'
import { getWorkflowNavigationState } from './workflowNavigation'

type WorkflowTabsProps = {
  activeView: ViewMode
  projectStatus: ProjectAnalysisStatus
  hasDetectedApis: boolean
  requestReady: boolean
  traceAvailable: boolean
  externalProject: boolean
  onChange: (view: ViewMode) => void
}

const TABS = [
  { id: 'project', icon: FolderTree },
  { id: 'api', icon: Braces },
  { id: 'runtime', icon: Route },
] as const

export function WorkflowTabs({
  activeView,
  projectStatus,
  hasDetectedApis,
  requestReady,
  traceAvailable,
  externalProject,
  onChange,
}: WorkflowTabsProps) {
  return (
    <nav className="workflow-tabs" aria-label="StackFlow 작업 단계">
      {TABS.map(({ id, icon: Icon }, index) => {
        const disabled = (id !== 'project' && !hasDetectedApis)
          || (id === 'runtime' && externalProject && !traceAvailable)
        const state = getWorkflowNavigationState(id, {
          projectStatus,
          hasDetectedApis,
          requestReady,
          traceAvailable,
        })
        const disabledTitle = id === 'runtime' && hasDetectedApis
          ? '먼저 API 요청을 실행해 Trace를 수집하세요.'
          : '먼저 실행 가능한 API를 준비하세요.'

        return (
          <button
            key={id}
            type="button"
            className={`workflow-tab workflow-tab--${state.tone}${activeView === id ? ' is-active' : ''}`}
            disabled={disabled}
            onClick={() => onChange(id)}
            title={disabled ? `${state.label}: ${disabledTitle}` : VIEW_COPY[id].description}
            aria-current={activeView === id ? 'page' : undefined}
          >
            <span className="workflow-tab__index">{index + 1}</span>
            <Icon size={17} aria-hidden="true" />
            <span>
              <strong>{VIEW_COPY[id].label}</strong>
              <small>{state.label}</small>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
