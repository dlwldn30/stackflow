import type { StatusTone } from './StatusBadge'
import type { ProjectAnalysisStatus } from '../types/trace'
import type { ViewMode } from '../ui/copy'

export type WorkflowNavigationState = {
  label: string
  tone: StatusTone
}

type WorkflowNavigationContext = {
  projectStatus: ProjectAnalysisStatus
  hasDetectedApis: boolean
  requestReady: boolean
  traceAvailable: boolean
}

export function getWorkflowNavigationState(
  view: ViewMode,
  context: WorkflowNavigationContext,
): WorkflowNavigationState {
  if (view === 'project') {
    if (context.projectStatus === 'SUCCESS') return { label: '분석 완료', tone: 'success' }
    if (context.projectStatus === 'FAILED') return { label: '분석 실패', tone: 'error' }
    return { label: 'API 없음', tone: 'warning' }
  }

  if (view === 'api') {
    if (!context.hasDetectedApis) return { label: '분석 후 사용', tone: 'neutral' }
    if (!context.requestReady) return { label: '정적 분석만', tone: 'warning' }
    return { label: '요청 가능', tone: 'success' }
  }

  if (!context.hasDetectedApis) return { label: 'API 준비 필요', tone: 'neutral' }
  if (context.traceAvailable) return { label: 'Trace 확보', tone: 'success' }
  return { label: '요청 후 확인', tone: 'neutral' }
}
