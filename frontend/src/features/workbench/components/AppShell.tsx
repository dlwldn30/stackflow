import type { ReactNode } from 'react'
import { StatusBadge } from '../../../components/StatusBadge'
import type { StatusTone } from '../../../components/StatusBadge'
import { WorkflowTabs } from '../../../components/WorkflowTabs'
import { getWorkflowNavigationState } from '../../../components/workflowNavigation'
import type { ProjectAnalysisStatus } from '../../../types/trace'
import type { AnalysisTarget } from '../types'
import type { ViewMode } from '../../../ui/copy'

type AppShellProps = {
  activeView: ViewMode
  projectName: string
  projectStatus: ProjectAnalysisStatus
  analysisTarget: AnalysisTarget
  hasDetectedApis: boolean
  requestReady: boolean
  traceId: string | null
  traceCollectionPresentation: { label: string; tone: StatusTone }
  onViewChange: (view: ViewMode) => void
  children: ReactNode
}

export function AppShell({
  activeView,
  projectName,
  projectStatus,
  analysisTarget,
  hasDetectedApis,
  requestReady,
  traceId,
  traceCollectionPresentation,
  onViewChange,
  children,
}: AppShellProps) {
  const activeNavigationState = getWorkflowNavigationState(activeView, {
    projectStatus,
    hasDetectedApis,
    requestReady,
    traceAvailable: Boolean(traceId),
  })

  return (
    <main className="app-shell">
      <header className={`topbar topbar--${activeView}`}>
        <div className="topbar__brand">
          <span className="topbar__mark" aria-hidden="true">SF</span>
          <div>
            <strong>StackFlow</strong>
            <span>{projectName}</span>
          </div>
        </div>
        {activeView === 'runtime' ? (
          <div className="topbar__trace-meta">
            {traceId ? <span><small>Trace ID</small><strong title={traceId}>{traceId.slice(0, 8)}</strong></span> : null}
            <StatusBadge tone={traceCollectionPresentation.tone}>
              {traceCollectionPresentation.label}
            </StatusBadge>
          </div>
        ) : (
          <StatusBadge tone={activeNavigationState.tone}>
            {activeNavigationState.label}
          </StatusBadge>
        )}
      </header>

      <WorkflowTabs
        activeView={activeView}
        projectStatus={projectStatus}
        hasDetectedApis={hasDetectedApis}
        requestReady={requestReady}
        traceAvailable={Boolean(traceId)}
        externalProject={analysisTarget === 'external'}
        onChange={onViewChange}
      />

      {children}
    </main>
  )
}
