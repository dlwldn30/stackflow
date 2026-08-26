import { ChevronRight } from 'lucide-react'
import type { GraphNodeState, TraceDetail, TraceEvent, TraceResponsePreview } from '../../../types/trace'
import { EVENT_STATUS_LABEL } from '../../../ui/copy'
import { StatusBadge } from '../../../components/StatusBadge'
import { formatTraceResponsePreview, getExceptionLocation, getKeyMetadata } from '../traceModel'

interface TraceInspectorProps {
  trace: TraceDetail | null
  selectedNode: GraphNodeState | null
  selectedEvent: TraceEvent | null
  primaryFailureEvent: TraceEvent | null
  primaryFailureLabel: string | null
  onInspectPrimaryFailure: () => void
}

export function TraceInspector({
  trace,
  selectedNode,
  selectedEvent,
  primaryFailureEvent,
  primaryFailureLabel,
  onInspectPrimaryFailure,
}: TraceInspectorProps) {
  const keyMetadata = getKeyMetadata(selectedEvent?.metadata ?? {})
  const exceptionLocation = getExceptionLocation(selectedEvent?.metadata ?? {})
  const allMetadata = Object.entries(selectedEvent?.metadata ?? {})
  const selectedEventId = selectedEvent?.spanId ?? selectedEvent?.component
  const primaryFailureId = primaryFailureEvent?.spanId ?? primaryFailureEvent?.component
  const isPropagatedError = Boolean(
    selectedEvent
      && primaryFailureEvent
      && selectedEventId !== primaryFailureId
      && (selectedEvent.errorType || selectedEvent.errorMessage),
  )

  return (
    <div className="panel-card inspector-workbench trace-inspector">
      <div className="panel-header">
        <div>
          <span className="section-label">선택한 Span</span>
          <h2>{selectedEvent?.eventType ?? 'Trace 대기'}</h2>
          <p>{selectedEvent ? `${selectedEvent.component} · ${selectedEvent.spanKind ?? 'EVENT'}` : 'API 요청을 실행한 뒤 span을 선택하세요.'}</p>
        </div>
        {selectedEvent ? (
          <StatusBadge tone={selectedEvent.status === 'SUCCESS' ? 'success' : selectedEvent.status === 'WARNING' ? 'warning' : 'error'}>
            {EVENT_STATUS_LABEL[selectedEvent.status]}
          </StatusBadge>
        ) : null}
      </div>

      {!selectedNode || !selectedEvent ? (
        <p className="empty-copy trace-inspector-empty">타임라인 또는 이벤트 목록에서 확인할 span을 선택하세요.</p>
      ) : (
        <>
          <section className="trace-inspector-summary">
            <span><small>소요 시간</small><strong>{selectedEvent.durationMs}ms</strong></span>
            <span><small>호출 횟수</small><strong>{selectedNode.visits.length}</strong></span>
            <span><small>Service</small><strong>{selectedEvent.serviceName ?? trace?.serviceName ?? '-'}</strong></span>
          </section>

          <section className="trace-inspector-section">
            <div className="section-row"><span className="section-label">Span 관계</span></div>
            <dl className="trace-key-metadata">
              <div><dt>Span ID</dt><dd>{selectedEvent.spanId ?? '-'}</dd></div>
              <div><dt>Parent Span</dt><dd>{selectedEvent.parentSpanId ?? 'root'}</dd></div>
            </dl>
          </section>

          {(selectedEvent.errorType || selectedEvent.errorMessage) ? (
            <>
              <section className="trace-inspector-error">
                <span>{isPropagatedError ? '상위로 전파된 오류' : '원인 오류'}</span>
                <strong>{selectedEvent.errorType ?? EVENT_STATUS_LABEL[selectedEvent.status]}</strong>
                <p>{selectedEvent.errorMessage ?? '상세 오류 메시지가 수집되지 않았습니다.'}</p>
                {isPropagatedError && primaryFailureEvent ? (
                  <button
                    type="button"
                    aria-label={`실제 시작 지점 ${primaryFailureLabel ?? primaryFailureEvent.eventType} 확인`}
                    onClick={onInspectPrimaryFailure}
                  >
                    <small>실제 시작 지점</small>
                    <strong>{primaryFailureLabel ?? primaryFailureEvent.eventType}</strong>
                    <span>{primaryFailureEvent.errorType ?? EVENT_STATUS_LABEL[primaryFailureEvent.status]}</span>
                  </button>
                ) : null}
              </section>

              <section className="trace-inspector-section trace-exception-location">
                <div className="section-row"><span className="section-label">오류 발생 위치</span></div>
                {exceptionLocation.length > 0 ? (
                  <dl className="trace-key-metadata">
                    {exceptionLocation.map((item) => (
                      <div key={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>
                    ))}
                  </dl>
                ) : (
                  <p className="trace-exception-empty">코드 위치가 수집되지 않았습니다.</p>
                )}
                {!selectedEvent.stackTrace ? (
                  <p className="trace-exception-empty">Agent가 stacktrace를 제공하지 않았습니다.</p>
                ) : null}
              </section>

              {selectedEvent.stackTrace ? (
                <details className="trace-inspector-disclosure trace-stacktrace-disclosure">
                  <summary>
                    <span><ChevronRight size={14} aria-hidden="true" />Stacktrace</span>
                    <span>{selectedEvent.stackTraceTruncated ? '16KiB 일부' : '원문'}</span>
                  </summary>
                  <pre className="trace-stacktrace">{selectedEvent.stackTrace}</pre>
                </details>
              ) : null}
            </>
          ) : null}

          <section className="trace-inspector-section">
            <div className="section-row">
              <span className="section-label">주요 속성</span>
              <span>{keyMetadata.length}개</span>
            </div>
            <dl className="trace-key-metadata">
              {keyMetadata.map((item) => (
                <div key={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>
              ))}
              {keyMetadata.length === 0 ? <div><dt>속성</dt><dd>주요 속성 없음</dd></div> : null}
            </dl>
          </section>
        </>
      )}

      <details className="trace-inspector-disclosure">
        <summary>
          <span><ChevronRight size={14} aria-hidden="true" />전체 metadata</span>
          <span>{allMetadata.length}개</span>
        </summary>
        <div className="metadata-list">
          {allMetadata.length === 0 ? (
            <span className="metadata-item">선택한 Span의 metadata가 없습니다.</span>
          ) : allMetadata.map(([key, value]) => (
            <span key={key} className="metadata-item"><b>{key}</b><span>{value}</span></span>
          ))}
        </div>
      </details>

      <TraceResponseDisclosure
        key={trace?.traceId ?? 'empty-trace'}
        preview={trace?.responsePreview ?? null}
        defaultOpen={trace?.traceCollectionStatus !== 'TIMED_OUT'
          && (trace?.resultStatus === 'ERROR' || trace?.resultStatus === 'TIMEOUT')}
      />
    </div>
  )
}

function TraceResponseDisclosure({
  preview,
  defaultOpen,
}: {
  preview: TraceResponsePreview | null
  defaultOpen: boolean
}) {
  const formattedBody = formatTraceResponsePreview(preview)
  const formatLabel = preview
    ? preview.contentType === 'application/json' || preview.contentType.endsWith('+json') ? 'JSON' : '텍스트'
    : null

  return (
    <details
      className="trace-inspector-disclosure trace-response-disclosure"
      open={defaultOpen}
    >
      <summary>
        <span><ChevronRight size={14} aria-hidden="true" />요청 응답</span>
        <span>{preview ? `${formatLabel}${preview.truncated ? ' · 64KiB 일부' : ''}` : '없음'}</span>
      </summary>
      {formattedBody ? (
        <pre className="response-body">{formattedBody}</pre>
      ) : (
        <p className="empty-copy">저장된 응답 미리보기가 없습니다.</p>
      )}
    </details>
  )
}
