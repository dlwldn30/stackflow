import { AlertTriangle, ExternalLink } from 'lucide-react'
import { StatusBadge } from '../../../components/StatusBadge'
import type { RequestResponsePresentation } from '../requestModel'

type RequestResponsePanelProps = {
  presentation: RequestResponsePresentation
  onOpenTrace: () => void
}

export function RequestResponsePanel({ presentation, onOpenTrace }: RequestResponsePanelProps) {
  const hasResult = presentation.phase === 'success'
    || presentation.phase === 'warning'
    || presentation.phase === 'failure'

  return (
    <section
      className={`request-response-panel request-response-panel--${presentation.phase}`}
      aria-label="API 응답"
      aria-live="polite"
      aria-busy={presentation.phase === 'loading'}
    >
      <header className="request-response-head">
        <div>
          <span className="section-label">HTTP 응답</span>
          <h2>{presentation.resultLabel}</h2>
        </div>
        <StatusBadge tone={presentation.tone}>{presentation.statusLabel}</StatusBadge>
      </header>

      {hasResult && (presentation.durationMs !== null || presentation.contentType || presentation.traceId) ? (
        <div className="request-response-meta">
          <span><small>소요 시간</small><strong>{presentation.durationMs !== null ? `${presentation.durationMs}ms` : '-'}</strong></span>
          <span><small>Content-Type</small><strong title={presentation.contentType ?? undefined}>{presentation.contentType ?? '-'}</strong></span>
          <span><small>Trace ID</small><strong title={presentation.traceId ?? undefined}>{presentation.traceId?.slice(0, 8) ?? '-'}</strong></span>
        </div>
      ) : null}

      {presentation.errorMessage ? (
        <section className="request-response-error">
          <AlertTriangle size={17} aria-hidden="true" />
          <div>
            <strong>실패 원인</strong>
            <p>{presentation.errorMessage}</p>
            <small>{presentation.traceId ? 'Trace에서 실제 실패 Span을 확인하세요.' : '대상 주소와 서비스 실행 상태를 확인하세요.'}</small>
          </div>
        </section>
      ) : null}

      {presentation.collectionTimedOut ? (
        <p className="request-response-collection-warning">
          HTTP 응답은 수신했지만 Span 수집 시간이 초과됐습니다. Agent와 Collector 주소를 확인하세요.
        </p>
      ) : null}

      {presentation.body ? (
        <div className="request-response-body">
          <div>
            <strong>응답 본문</strong>
            {presentation.bodyTruncated ? <span role="status">1MiB 일부</span> : null}
          </div>
          <pre>{presentation.body}</pre>
        </div>
      ) : (
        <p className="request-response-empty">{presentation.emptyMessage}</p>
      )}

      {presentation.traceId ? (
        <footer className="request-response-actions">
          <button type="button" onClick={onOpenTrace}>
            Trace에서 보기
            <ExternalLink size={14} aria-hidden="true" />
          </button>
        </footer>
      ) : null}
    </section>
  )
}
