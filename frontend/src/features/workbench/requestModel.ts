import type {
  EventStatus,
  ExternalRequestEntry,
  ExternalRequestResponse,
  ProductPayload,
} from '../../types/trace'
import { EVENT_STATUS_LABEL } from '../../ui/copy'
import type { ApiDefinition } from './types'

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

export function parseResponseBody(responseBody: string): unknown {
  if (!responseBody) return null
  try {
    return JSON.parse(responseBody)
  } catch {
    return responseBody
  }
}
