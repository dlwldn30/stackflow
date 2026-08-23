import { Braces, FolderTree, Route } from 'lucide-react'
import { VIEW_COPY } from '../ui/copy'
import type { ViewMode } from '../ui/copy'

type WorkflowTabsProps = {
  activeView: ViewMode
  hasDetectedApis: boolean
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
  hasDetectedApis,
  traceAvailable,
  externalProject,
  onChange,
}: WorkflowTabsProps) {
  return (
    <nav className="workflow-tabs" aria-label="StackFlow 작업 단계">
      {TABS.map(({ id, icon: Icon }, index) => {
        const disabled = (id !== 'project' && !hasDetectedApis)
          || (id === 'runtime' && externalProject && !traceAvailable)

        return (
          <button
            key={id}
            type="button"
            className={`workflow-tab${activeView === id ? ' is-active' : ''}`}
            disabled={disabled}
            onClick={() => onChange(id)}
            title={disabled ? '먼저 실행 가능한 API를 준비하세요.' : VIEW_COPY[id].description}
          >
            <span className="workflow-tab__index">{index + 1}</span>
            <Icon size={17} aria-hidden="true" />
            <span>
              <strong>{VIEW_COPY[id].label}</strong>
              <small>{VIEW_COPY[id].description}</small>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
