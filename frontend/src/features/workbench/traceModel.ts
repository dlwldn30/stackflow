import type { GraphNodeState, TraceDetail, TraceEvent, TraceResponsePreview, TraceSummary } from '../../types/trace'
import type { StatusTone } from '../../components/StatusBadge'
import type { StreamStatus } from '../../ui/copy'

export type TraceHistoryFilter = 'all' | 'success' | 'attention' | 'timeout'
export type TraceOutcome = 'success' | 'recovered' | 'failure'
export const MAX_RECENT_TRACES = 25

export interface TraceOutcomePresentation {
  outcome: TraceOutcome
  resultLabel: string
  resultDetail: string
  collectionTimedOut: boolean
  serviceTransitions: number
}

export interface TraceCollectionPresentation {
  label: string
  tone: StatusTone
}

export interface TraceMetadataItem {
  key: string
  label: string
  value: string
}

const METADATA_LABELS: Record<string, string> = {
  productId: '상품 ID',
  scenario: '시나리오',
  api: 'API',
  count: '결과 개수',
  stock: '재고',
  cacheStatus: '캐시 상태',
  httpStatus: 'HTTP 상태',
  'http.request.method': 'HTTP 메서드',
  'http.method': 'HTTP 메서드',
  'http.response.status_code': 'HTTP 상태',
  'http.status_code': 'HTTP 상태',
  'http.route': 'HTTP 경로',
  'http.target': '요청 대상',
  'url.path': 'URL 경로',
  'server.address': '서버 주소',
  'server.port': '서버 포트',
  'network.protocol.name': '네트워크 프로토콜',
  'network.protocol.version': '프로토콜 버전',
  'net.peer.name': '대상 호스트',
  'net.peer.port': '대상 포트',
  'db.system.name': '데이터베이스',
  'db.system': '데이터베이스',
  'db.operation.name': 'DB 작업',
  'db.operation': 'DB 작업',
  'db.namespace': 'DB 네임스페이스',
  'db.name': 'DB 이름',
  'db.collection.name': '컬렉션',
  'db.sql.table': '테이블',
  'error.type': '오류 유형',
}

export function formatTraceResponsePreview(preview: TraceResponsePreview | null): string | null {
  if (!preview?.body) return null
  if (!preview.truncated && (preview.contentType === 'application/json' || preview.contentType.endsWith('+json'))) {
    try {
      return JSON.stringify(JSON.parse(preview.body), null, 2)
    } catch {
      return preview.body
    }
  }
  return preview.body
}

export function buildTraceOutcomePresentation(
  trace: TraceDetail,
  failureEvent: TraceEvent | null,
): TraceOutcomePresentation {
  const outcome: TraceOutcome = trace.resultStatus === 'ERROR' || trace.resultStatus === 'TIMEOUT'
    ? 'failure'
    : failureEvent ? 'recovered' : 'success'
  const collectionTimedOut = trace.traceCollectionStatus === 'TIMED_OUT'
  const bySpanId = new Map(trace.events.filter((event) => event.spanId).map((event) => [event.spanId as string, event]))
  const serviceTransitions = trace.events.filter((event) => {
    const parent = event.parentSpanId ? bySpanId.get(event.parentSpanId) : null
    return Boolean(parent?.serviceName && event.serviceName && parent.serviceName !== event.serviceName)
  }).length

  if (outcome === 'failure') {
    return {
      outcome,
      resultLabel: '요청 실패',
      resultDetail: '실제 하위 원인 Span부터 확인하세요.',
      collectionTimedOut,
      serviceTransitions,
    }
  }
  if (outcome === 'recovered') {
    return {
      outcome,
      resultLabel: '복구된 실패',
      resultDetail: '중간 오류가 발생했지만 fallback으로 요청은 완료됐습니다.',
      collectionTimedOut,
      serviceTransitions,
    }
  }
  return {
    outcome,
    resultLabel: collectionTimedOut ? 'HTTP 요청 성공' : '정상 완료',
    resultDetail: collectionTimedOut
      ? 'HTTP 요청은 완료됐지만 전체 Span 수집 여부는 확인할 수 없습니다.'
      : '실패 없이 요청 처리가 끝났습니다.',
    collectionTimedOut,
    serviceTransitions,
  }
}

export function getTraceCollectionPresentation(
  streamStatus: StreamStatus,
  collectionStatus: TraceDetail['traceCollectionStatus'],
  hasTrace: boolean,
): TraceCollectionPresentation {
  if (collectionStatus === 'TIMED_OUT') return { label: 'Span 수집 시간 초과', tone: 'warning' }
  if (collectionStatus === 'COMPLETED' || streamStatus === 'completed') return { label: '수집 완료', tone: 'success' }
  if (streamStatus === 'connection_timeout' || streamStatus === 'error') return { label: '실시간 연결 실패', tone: 'error' }
  if (collectionStatus === 'COLLECTING' || streamStatus === 'streaming') return { label: '수집 중', tone: 'info' }
  if (collectionStatus === 'PENDING' || streamStatus === 'connecting') return { label: 'Span 대기', tone: 'info' }
  if (hasTrace) return { label: '수집 완료', tone: 'success' }
  return { label: 'Trace 대기', tone: 'neutral' }
}

export function getDefaultInspectionEvent(
  trace: TraceDetail | null,
  failureEvent: TraceEvent | null,
): TraceEvent | null {
  if (!trace) return null
  if (failureEvent) return failureEvent

  const ordered = [...trace.events].sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt))
  return ordered.find((event) => event.spanKind === 'SERVER')
    ?? ordered.find((event) => !event.parentSpanId && event.component === 'CONTROLLER')
    ?? ordered.find((event) => !event.parentSpanId)
    ?? ordered[0]
    ?? null
}

export function getInspectorEvent(selectedNode: GraphNodeState | null): TraceEvent | null {
  if (!selectedNode) return null
  return selectedNode.visits.find((event) => event.status === 'TIMEOUT' || event.status === 'ERROR')
    ?? selectedNode.visits.at(-1)
    ?? null
}

export function buildFailurePropagationPath(
  events: TraceEvent[],
  failureEvent: TraceEvent | null,
): TraceEvent[] {
  if (!failureEvent) return []

  const bySpanId = new Map(events.filter((event) => event.spanId).map((event) => [event.spanId as string, event]))
  const path = [failureEvent]
  const visited = new Set<string>()
  let parentSpanId = failureEvent.parentSpanId

  while (parentSpanId && !visited.has(parentSpanId)) {
    visited.add(parentSpanId)
    const parent = bySpanId.get(parentSpanId)
    if (!parent) break
    path.push(parent)
    parentSpanId = parent.parentSpanId
  }

  if (path.length > 1 || failureEvent.spanId) return path

  const failureIndex = events.findIndex((event) => event.eventId === failureEvent.eventId)
  if (failureIndex < 1) return path

  const includedComponents = new Set([failureEvent.component])
  for (let index = failureIndex - 1; index >= 0; index -= 1) {
    const candidate = events[index]
    if (candidate.component === 'CLIENT' || candidate.component === 'RESPONSE' || includedComponents.has(candidate.component)) {
      continue
    }
    path.push(candidate)
    includedComponents.add(candidate.component)
    if (candidate.component === 'CONTROLLER') break
  }

  return path
}

export function filterTraceHistory(traces: TraceSummary[], filter: TraceHistoryFilter): TraceSummary[] {
  if (filter === 'all') return traces
  if (filter === 'success') return traces.filter((trace) =>
    trace.resultStatus === 'SUCCESS' && trace.traceCollectionStatus !== 'TIMED_OUT',
  )
  if (filter === 'timeout') return traces.filter((trace) =>
    trace.resultStatus === 'TIMEOUT' || trace.traceCollectionStatus === 'TIMED_OUT',
  )
  return traces.filter((trace) =>
    trace.traceCollectionStatus !== 'TIMED_OUT'
      && (trace.resultStatus === 'WARNING' || trace.resultStatus === 'ERROR'),
  )
}

export function upsertRecentTrace(traces: TraceSummary[], trace: TraceSummary): TraceSummary[] {
  return [trace, ...traces.filter((item) => item.traceId !== trace.traceId)].slice(0, MAX_RECENT_TRACES)
}

export function getKeyMetadata(metadata: Record<string, string>): TraceMetadataItem[] {
  return Object.entries(metadata)
    .filter(([key]) => key in METADATA_LABELS)
    .map(([key, value]) => ({ key, label: METADATA_LABELS[key], value }))
}

export function getExceptionLocation(metadata: Record<string, string>): TraceMetadataItem[] {
  const location = resolveCodeLocation(metadata)
  return [
    { key: 'class', label: '클래스', value: location.className },
    { key: 'method', label: '메서드', value: location.functionName },
    { key: 'file', label: '소스 파일', value: location.filePath },
    { key: 'line', label: '라인', value: location.lineNumber },
  ].filter((item): item is TraceMetadataItem => Boolean(item.value))
}

export function resolveCodeLocation(metadata: Record<string, string>) {
  const stableFunction = metadata['code.function.name']?.trim() ?? ''
  const legacyFunction = metadata['code.function']?.trim() ?? ''
  const namespace = metadata['code.namespace']?.trim() ?? ''
  const qualifiedFunction = stableFunction || legacyFunction
  const separatorIndex = qualifiedFunction.lastIndexOf('.')
  const derivedClassName = separatorIndex > 0 ? qualifiedFunction.slice(0, separatorIndex) : ''
  const derivedFunctionName = separatorIndex > 0 ? qualifiedFunction.slice(separatorIndex + 1) : qualifiedFunction

  return {
    className: namespace || derivedClassName,
    functionName: derivedFunctionName,
    filePath: metadata['code.file.path']?.trim() || metadata['code.filepath']?.trim() || '',
    lineNumber: metadata['code.line.number']?.trim() || metadata['code.lineno']?.trim() || '',
  }
}
