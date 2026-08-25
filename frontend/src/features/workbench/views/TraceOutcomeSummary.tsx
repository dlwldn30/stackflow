import { AlertCircle, CheckCircle2, ChevronRight, RotateCcw } from 'lucide-react'
import type { TraceDetail, TraceEvent } from '../../../types/trace'
import { EVENT_STATUS_LABEL } from '../../../ui/copy'
import type { TraceOutcome } from '../traceModel'

interface TraceOutcomeSummaryProps {
  trace: TraceDetail
  outcome: TraceOutcome
  failureEvent: TraceEvent | null
  failureLabel: string | null
  propagationPath: TraceEvent[]
  onInspectFailure: () => void
}

const OUTCOME_COPY: Record<TraceOutcome, { label: string; detail: string }> = {
  success: { label: '정상 완료', detail: '실패 없이 요청 처리가 끝났습니다.' },
  recovered: { label: '복구된 실패', detail: '중간 오류가 발생했지만 fallback으로 요청은 완료됐습니다.' },
  failure: { label: '요청 실패', detail: '실제 하위 원인 span부터 확인하세요.' },
  collection_timeout: { label: 'Span 수집 시간 초과', detail: 'HTTP 요청 결과는 유지됐지만 Agent span 수집이 완료되지 않았습니다.' },
}

export function TraceOutcomeSummary({
  trace,
  outcome,
  failureEvent,
  failureLabel,
  propagationPath,
  onInspectFailure,
}: TraceOutcomeSummaryProps) {
  const copy = OUTCOME_COPY[outcome]

  return (
    <section className={`trace-outcome trace-outcome--${outcome}`} aria-label="Trace 실행 결과">
      <div className="trace-outcome__metrics">
        <span><small>결과</small><strong>{copy.label}</strong></span>
        <span><small>HTTP</small><strong>{trace.httpStatus || '-'}</strong></span>
        <span><small>총 소요 시간</small><strong>{trace.durationMs}ms</strong></span>
        <span><small>Span</small><strong>{trace.events.length}개</strong></span>
      </div>

      {failureEvent ? (
        <div className="trace-cause">
          <span className="trace-cause__icon" aria-hidden="true">
            {outcome === 'recovered' ? <RotateCcw size={17} /> : <AlertCircle size={17} />}
          </span>
          <div className="trace-cause__body">
            <span>{outcome === 'recovered' ? '복구된 실패' : '주요 실패 원인'}</span>
            <strong>{failureLabel} · {failureEvent.errorType ?? EVENT_STATUS_LABEL[failureEvent.status]}</strong>
            <p>{failureEvent.errorMessage ?? `${failureEvent.eventType} 실행 중 문제가 발생했습니다.`}</p>
            {propagationPath.length > 1 ? (
              <div className="trace-propagation" aria-label="오류 전파 경로">
                <b>오류 전파</b>
                {propagationPath.map((event, index) => (
                  <span key={event.spanId ?? event.eventId}>
                    {index > 0 ? <ChevronRight size={12} aria-hidden="true" /> : null}
                    {event.eventType}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <button type="button" onClick={onInspectFailure}>
            상세 보기
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className={`trace-cause${outcome === 'success' ? ' trace-cause--success' : outcome === 'collection_timeout' ? ' trace-cause--collection-timeout' : ''}`}>
          <span className="trace-cause__icon" aria-hidden="true">
            {outcome === 'collection_timeout' ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
          </span>
          <div className="trace-cause__body">
            <span>실행 결과</span>
            <strong>{copy.label}</strong>
            <p>{copy.detail}</p>
          </div>
        </div>
      )}
    </section>
  )
}
