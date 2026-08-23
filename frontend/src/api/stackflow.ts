import type {
  ExternalRequestResponse,
  InstrumentationProfile,
  ProjectStructure,
  TraceDetail,
  TraceSessionResponse,
  TraceSummary,
} from '../types/trace'

export type ProjectFolderSelection = {
  supported: boolean
  selected: boolean
  projectPath: string | null
  message: string
}

async function requestJson<T>(input: RequestInfo | URL, init: RequestInit | undefined, errorMessage: string): Promise<T> {
  const response = await fetch(input, init)
  if (!response.ok) throw new Error(errorMessage)
  return response.json() as Promise<T>
}

export const getProjectStructure = () =>
  requestJson<ProjectStructure>('/api/project/structure', undefined, '프로젝트 구조를 불러오지 못했습니다.')

export const analyzeProject = (projectPath: string) =>
  requestJson<ProjectStructure>('/api/project/structure/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath }),
  }, '프로젝트 분석 요청에 실패했습니다.')

export const selectProjectFolder = () =>
  requestJson<ProjectFolderSelection>('/api/project/folder/select', { method: 'POST' }, '폴더 선택 요청에 실패했습니다.')

export const createInstrumentationProfile = (payload: {
  projectPath: string
  collectorBaseUrl: string
  agentPath: string
}) => requestJson<InstrumentationProfile>('/api/instrumentation/profile', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
}, '실행 Trace 설정을 생성하지 못했습니다.')

export const getRecentTraces = () =>
  requestJson<TraceSummary[]>('/api/traces', undefined, '최근 Trace를 불러오지 못했습니다.')

export const createTraceSession = () =>
  requestJson<TraceSessionResponse>('/api/traces/session', { method: 'POST' }, 'Trace 세션을 만들지 못했습니다.')

export const executeExternalRequest = (payload: unknown) =>
  requestJson<ExternalRequestResponse>('/api/external/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, '외부 API 요청 프록시가 실패했습니다.')

export const getTrace = (traceId: string) =>
  requestJson<TraceDetail>(`/api/traces/${traceId}`, undefined, 'Trace 상세 정보를 불러오지 못했습니다.')
