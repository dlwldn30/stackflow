import type {
  EventStatus,
  ExternalRequestEntry,
  ExternalRequestResponse,
  ProductPayload,
  TraceCollectionStatus,
  TraceDetail,
} from '../../types/trace'
import { EVENT_STATUS_LABEL } from '../../ui/copy'
import type { ApiDefinition, AsyncState } from './types'

export type RequestResponseTone = 'neutral' | 'info' | 'success' | 'warning' | 'error'

export interface RequestResponsePresentation {
  phase: 'idle' | 'loading' | 'success' | 'warning' | 'failure'
  resultLabel: string
  statusLabel: string
  tone: RequestResponseTone
  durationMs: number | null
  contentType: string | null
  traceId: string | null
  body: string | null
  bodyTruncated: boolean
  errorMessage: string | null
  collectionTimedOut: boolean
  emptyMessage: string
}

type RequestResponsePresentationOptions = {
  externalRunnable: boolean
  requestState: AsyncState
  requestMessage: string
  externalResponse: ExternalRequestResponse | null
  traceDetail: TraceDetail | null
  traceCollectionStatus: TraceCollectionStatus
  sampleResponseBody: unknown
}

export function buildRequestMessage(resultStatus: EventStatus, payload: ProductPayload) {
  if (payload.errorMessage) return `${EVENT_STATUS_LABEL[resultStatus]}: ${payload.errorMessage}`
  if (payload.cacheStatus) {
    return `${EVENT_STATUS_LABEL[resultStatus]}: cache ${payload.cacheStatus}를 포함한 상품 흐름을 수집했습니다.`
  }
  return `${EVENT_STATUS_LABEL[resultStatus]}: 요청 흐름을 수집했습니다.`
}

export function buildExternalRequestMessage(response: ExternalRequestResponse) {
  if (response.errorMessage) return `실패: ${response.errorMessage}`
  return `${response.method} ${response.targetUrl} · HTTP ${response.httpStatus} · ${response.durationMs}ms`
}

export function createRequestEntry(key: string, value: string, enabled: boolean): ExternalRequestEntry {
  return { id: crypto.randomUUID(), key, value, enabled }
}

export function getDefaultPathVariable(api: ApiDefinition) {
  return api.pathTemplate.includes('/orders/') ? '2001' : '1001'
}

export function updateRequestEntries(
  entries: ExternalRequestEntry[],
  id: string,
  patch: Partial<ExternalRequestEntry>,
) {
  return entries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry)
}

export function removeRequestEntry(entries: ExternalRequestEntry[], id: string) {
  return entries.filter((entry) => entry.id !== id)
}

export function filterApis(apis: ApiDefinition[], searchTerm: string) {
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase()
  if (!normalizedSearch) return apis
  return apis.filter((api) => [
    api.methodSpecified ? api.method : '메서드 미지정',
    api.pathTemplate,
    api.controller,
    api.handler,
    api.label,
  ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch)))
}

export function toEnabledEntries(entries: ExternalRequestEntry[]) {
  return entries
    .filter((entry) => entry.enabled && entry.key.trim())
    .map((entry) => ({ key: entry.key.trim(), value: entry.value, enabled: true }))
}

export function countEnabledEntries(entries: ExternalRequestEntry[]) {
  return toEnabledEntries(entries).length
}

export function buildExternalTargetPreview(
  targetBaseUrl: string,
  path: string,
  queryParams: ExternalRequestEntry[],
) {
  const normalizedBase = targetBaseUrl.trim().replace(/\/+$/u, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const search = new URLSearchParams()
  toEnabledEntries(queryParams).forEach((entry) => search.append(entry.key, entry.value))
  const queryString = search.toString()
  return `${normalizedBase || 'https://api.example.com'}${normalizedPath}${queryString ? `?${queryString}` : ''}`
}

export function formatResponseBody(responseBody: string) {
  if (!responseBody) return ''
  try {
    return JSON.stringify(JSON.parse(responseBody), null, 2)
  } catch {
    return responseBody
  }
}

export function buildRequestResponsePresentation({
  externalRunnable,
  requestState,
  requestMessage,
  externalResponse,
  traceDetail,
  traceCollectionStatus,
  sampleResponseBody,
}: RequestResponsePresentationOptions): RequestResponsePresentation {
  if (externalRunnable && externalResponse) {
    const status = externalResponse.resultStatus
    return {
      phase: status === 'SUCCESS' ? 'success' : 'failure',
      resultLabel: status === 'SUCCESS' ? '요청 성공' : '요청 실패',
      statusLabel: externalResponse.httpStatus > 0 ? `HTTP ${externalResponse.httpStatus}` : '전송 실패',
      tone: status === 'SUCCESS' ? 'success' : 'error',
      durationMs: externalResponse.durationMs,
      contentType: externalResponse.contentType || null,
      traceId: externalResponse.traceId,
      body: formatResponseBody(externalResponse.responseBody) || null,
      bodyTruncated: externalResponse.responseBodyTruncated,
      errorMessage: externalResponse.errorMessage,
      collectionTimedOut: traceCollectionStatus === 'TIMED_OUT'
        || externalResponse.traceCollectionStatus === 'TIMED_OUT',
      emptyMessage: '응답 본문이 없습니다.',
    }
  }

  if (!externalRunnable && traceDetail) {
    const failure = traceDetail.resultStatus === 'ERROR' || traceDetail.resultStatus === 'TIMEOUT'
    const warning = traceDetail.resultStatus === 'WARNING'
    return {
      phase: failure ? 'failure' : warning ? 'warning' : 'success',
      resultLabel: failure ? '요청 실패' : warning ? '주의와 함께 완료' : '요청 성공',
      statusLabel: traceDetail.httpStatus > 0 ? `HTTP ${traceDetail.httpStatus}` : '실행 완료',
      tone: failure ? 'error' : warning ? 'warning' : 'success',
      durationMs: traceDetail.durationMs,
      contentType: 'application/json',
      traceId: traceDetail.traceId,
      body: formatSampleResponseBody(sampleResponseBody),
      bodyTruncated: false,
      errorMessage: failure ? requestMessage : null,
      collectionTimedOut: traceDetail.traceCollectionStatus === 'TIMED_OUT',
      emptyMessage: '응답 본문이 없습니다.',
    }
  }

  if (requestState === 'loading') {
    return {
      phase: 'loading', resultLabel: '요청 중', statusLabel: '응답 대기', tone: 'info',
      durationMs: null, contentType: null, traceId: null, body: null, bodyTruncated: false,
      errorMessage: null, collectionTimedOut: false, emptyMessage: '대상 API의 응답을 기다리고 있습니다.',
    }
  }

  if (requestState === 'error') {
    return {
      phase: 'failure', resultLabel: '요청 실패', statusLabel: '전송 실패', tone: 'error',
      durationMs: null, contentType: null, traceId: null, body: null, bodyTruncated: false,
      errorMessage: requestMessage, collectionTimedOut: false,
      emptyMessage: '대상 주소와 서비스 실행 상태를 확인하세요.',
    }
  }

  return {
    phase: 'idle', resultLabel: '응답 대기', statusLabel: '대기', tone: 'neutral',
    durationMs: null, contentType: null, traceId: null, body: null, bodyTruncated: false,
    errorMessage: null, collectionTimedOut: false,
    emptyMessage: '요청을 실행하면 HTTP 응답이 여기에 표시됩니다.',
  }
}

export function parseResponseBody(responseBody: string): unknown {
  if (!responseBody) return null
  try {
    return JSON.parse(responseBody)
  } catch {
    return responseBody
  }
}

function formatSampleResponseBody(responseBody: unknown): string | null {
  if (responseBody === null || responseBody === undefined) return null
  if (typeof responseBody === 'string') return responseBody
  try {
    return JSON.stringify(responseBody, null, 2)
  } catch {
    return String(responseBody)
  }
}
