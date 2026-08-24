import type { ReactNode } from 'react'
import { EvidenceProgress } from '../../../components/EvidenceProgress'
import { StatusBadge } from '../../../components/StatusBadge'
import { WorkflowTabs } from '../../../components/WorkflowTabs'
import { PROJECT_STATUS_LABEL, getResultStatusLabel } from '../../../ui/copy'
import type { EventStatus, ProjectAnalysisStatus } from '../../../types/trace'
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
  traceResultStatus: EventStatus | 'IDLE'
  traceDisplayStatus: string
  traceEventCount: number
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
  traceResultStatus,
  traceDisplayStatus,
  traceEventCount,
  onViewChange,
  children,
}: AppShellProps) {
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
        <EvidenceProgress
          activeView={activeView}
          analysisReady={projectStatus === 'SUCCESS'}
          requestReady={requestReady}
          traceReady={Boolean(traceId)}
        />
        {activeView === 'runtime' ? (
          <div className="topbar__trace-meta">
            <span><small>Trace ID</small><strong>{traceId?.slice(0, 8) ?? '대기'}</strong></span>
            <span><small>결과</small><strong>{getResultStatusLabel(traceResultStatus)}</strong></span>
            <span><small>상태</small><strong>{traceDisplayStatus}</strong></span>
            <span><small>이벤트</small><strong>{traceEventCount}</strong></span>
          </div>
        ) : (
          <StatusBadge tone={projectStatus === 'SUCCESS' ? 'success' : projectStatus === 'FAILED' ? 'error' : 'warning'}>
            {PROJECT_STATUS_LABEL[projectStatus]}
          </StatusBadge>
        )}
      </header>

      <WorkflowTabs
        activeView={activeView}
        hasDetectedApis={hasDetectedApis}
        traceAvailable={Boolean(traceId)}
        externalProject={analysisTarget === 'external'}
        onChange={onViewChange}
      />

      {children}
    </main>
  )
}
