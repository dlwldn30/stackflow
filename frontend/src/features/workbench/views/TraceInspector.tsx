import type { GraphNodeState, TraceDetail, TraceEvent } from '../../../types/trace'
import { EVENT_STATUS_LABEL } from '../../../ui/copy'
import { StatusBadge } from '../../../components/StatusBadge'
import { getKeyMetadata } from '../traceModel'

interface TraceInspectorProps {
  trace: TraceDetail | null
  selectedNode: GraphNodeState | null
  selectedEvent: TraceEvent | null
  formattedResponseBody: string | null
}

export function TraceInspector({ trace, selectedNode, selectedEvent, formattedResponseBody }: TraceInspectorProps) {
  const keyMetadata = getKeyMetadata(selectedEvent?.metadata ?? {})
  const allMetadata = Object.entries(selectedEvent?.metadata ?? {})

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
        <p className="empty-copy">Waterfall, 그래프 또는 이벤트 목록에서 확인할 span을 선택하세요.</p>
      ) : (
        <>
          <section className="trace-inspector-summary">
            <span><small>소요 시간</small><strong>{selectedEvent.durationMs}ms</strong></span>
            <span><small>호출 횟수</small><strong>{selectedNode.visits.length}</strong></span>
            <span><small>Service</small><strong>{selectedEvent.serviceName ?? trace?.serviceName ?? '-'}</strong></span>
          </section>

          {(selectedEvent.errorType || selectedEvent.errorMessage) ? (
            <section className="trace-inspector-error">
              <span>오류 정보</span>
              <strong>{selectedEvent.errorType ?? EVENT_STATUS_LABEL[selectedEvent.status]}</strong>
              <p>{selectedEvent.errorMessage ?? '상세 오류 메시지가 수집되지 않았습니다.'}</p>
            </section>
          ) : null}

          <section className="trace-inspector-section">
            <div className="section-row">
              <span className="section-label">핵심 실행 정보</span>
              <span>{keyMetadata.length}개</span>
            </div>
            <dl className="trace-key-metadata">
              <div><dt>Span ID</dt><dd>{selectedEvent.spanId ?? '-'}</dd></div>
              <div><dt>Parent Span</dt><dd>{selectedEvent.parentSpanId ?? 'root'}</dd></div>
              {keyMetadata.map((item) => (
                <div key={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>
              ))}
            </dl>
          </section>

          <details className="trace-inspector-disclosure">
            <summary>전체 metadata <span>{allMetadata.length}</span></summary>
            <div className="metadata-list">
              {allMetadata.length === 0 ? (
                <span className="metadata-item">metadata 없음</span>
              ) : allMetadata.map(([key, value]) => (
                <span key={key} className="metadata-item">{key}: {value}</span>
              ))}
            </div>
          </details>

          <details className="trace-inspector-disclosure">
            <summary>응답 JSON</summary>
            {formattedResponseBody ? <pre className="response-body">{formattedResponseBody}</pre> : <p className="empty-copy">응답 본문이 없습니다.</p>}
          </details>
        </>
      )}
    </div>
  )
}
