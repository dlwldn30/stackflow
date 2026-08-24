import type { EventStatus, ProjectAnalysisStatus, TraceCollectionStatus } from '../types/trace'

export type ViewMode = 'project' | 'api' | 'runtime'
export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'completed' | 'connection_timeout' | 'error'

export const VIEW_COPY: Record<ViewMode, { label: string; description: string }> = {
  project: {
    label: '프로젝트 구조',
    description: '도메인과 API 구조를 확인합니다.',
  },
  api: {
    label: 'API 요청',
    description: '요청을 만들고 응답을 확인합니다.',
  },
  runtime: {
    label: 'Trace',
    description: '실행 경로와 실패 지점을 확인합니다.',
  },
}

export const PROJECT_STATUS_LABEL: Record<ProjectAnalysisStatus, string> = {
  SUCCESS: '분석 완료',
  EMPTY: 'API 없음',
  FAILED: '분석 실패',
}

export const EVENT_STATUS_LABEL: Record<EventStatus | 'IDLE', string> = {
  SUCCESS: '성공',
  WARNING: '주의',
  ERROR: '실패',
  TIMEOUT: '시간 초과',
  SKIPPED: '건너뜀',
  IDLE: '대기',
}

export const STREAM_STATUS_LABEL: Record<StreamStatus, string> = {
  idle: '대기',
  connecting: '연결 중',
  streaming: '수집 중',
  completed: '완료',
  connection_timeout: '연결 시간 초과',
  error: '실패',
}

export const TRACE_COLLECTION_STATUS_LABEL: Record<TraceCollectionStatus, string> = {
  DISABLED: 'Agent 설정 필요',
  PENDING: 'Span 대기',
  COLLECTING: '수집 중',
  COMPLETED: '완료',
  TIMED_OUT: '수집 시간 초과',
}

export function getResultStatusLabel(status: EventStatus | 'ERROR' | 'IDLE') {
  return status === 'IDLE' ? EVENT_STATUS_LABEL.IDLE : EVENT_STATUS_LABEL[status]
}
