import { AlertCircle, CheckCircle2, ChevronRight, Radio, RotateCcw } from 'lucide-react'
import type { TraceDetail, TraceEvent } from '../../../types/trace'
import { EVENT_STATUS_LABEL } from '../../../ui/copy'
import type { TraceOutcomePresentation } from '../traceModel'

interface TraceOutcomeSummaryProps {
  trace: TraceDetail
  presentation: TraceOutcomePresentation
  failureEvent: TraceEvent | null
  failureLabel: string | null
  propagationPath: TraceEvent[]
  onInspectFailure: () => void
}

export function TraceOutcomeSummary({
  trace,
  presentation,
  failureEvent,
  failureLabel,
  propagationPath,
  onInspectFailure,
}: TraceOutcomeSummaryProps) {
  const { outcome, resultLabel, resultDetail, collectionTimedOut, serviceTransitions } = presentation
  const propagationLabel = propagationPath
    .map((event) => `${event.serviceName ? `${event.serviceName} / ` : ''}${event.eventType}`)
    .join(' → ')

  return (
    <section className={`trace-outcome trace-outcome--${outcome}`} aria-label="Trace 실행 결과">
      <div className="trace-outcome__metrics trace-outcome__metrics--primary">
        <span><small>실행 결과</small><strong>{resultLabel}</strong></span>
        <span><small>HTTP 상태</small><strong>{trace.httpStatus || '-'}</strong></span>
        <span><small>총 소요 시간</small><strong>{trace.durationMs}ms</strong></span>
      </div>
      <div className="trace-outcome__metrics trace-outcome__metrics--scope">
        <span><small>진입 서비스</small><strong>{trace.serviceName ?? '-'}</strong></span>
        <span><small>참여 서비스</small><strong>{trace.serviceNames.length}개 · 경계 {serviceTransitions}회</strong></span>
        <span><small>수집된 Span</small><strong>{trace.events.length}개</strong></span>
      </div>

      {failureEvent ? (
        <div className="trace-cause">
          <span className="trace-cause__icon" aria-hidden="true">
            {outcome === 'recovered' ? <RotateCcw size={17} /> : <AlertCircle size={17} />}
          </span>
          <div className="trace-cause__body">
            <span>{outcome === 'recovered' ? '복구된 실패' : '주요 실패 원인'}</span>
            <small>{failureEvent.serviceName ? `${failureEvent.serviceName} / ` : ''}{failureLabel}</small>
            <strong>{failureEvent.errorType ?? EVENT_STATUS_LABEL[failureEvent.status]}</strong>
            <p>{failureEvent.errorMessage ?? `${failureEvent.eventType} 실행 중 문제가 발생했습니다.`}</p>
            {propagationPath.length > 1 ? (
              <div className="trace-propagation" aria-label="오류 전파 경로">
                <b>오류 전파</b>
                <span title={propagationLabel}>{propagationLabel}</span>
              </div>
            ) : null}
          </div>
          <button type="button" onClick={onInspectFailure}>
            상세 보기
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      ) : !collectionTimedOut ? (
        <div className="trace-cause trace-cause--success">
          <span className="trace-cause__icon" aria-hidden="true">
            <CheckCircle2 size={17} />
          </span>
          <div className="trace-cause__body">
            <p>{resultDetail}</p>
          </div>
        </div>
      ) : null}

      {collectionTimedOut ? (
        <div className="trace-collection-warning" role="status">
          <Radio size={17} aria-hidden="true" />
          <div>
            <strong>Span 수집 시간 초과</strong>
            <p>{resultDetail} Agent 실행 설정과 Collector 주소를 확인하세요.</p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
