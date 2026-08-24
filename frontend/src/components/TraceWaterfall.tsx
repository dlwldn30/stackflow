import type { WaterfallModel } from '../lib/waterfall'

interface TraceWaterfallProps {
  model: WaterfallModel
  selectedSpanId: string | null
  primaryFailureSpanId: string | null
  onSelectSpan: (spanId: string) => void
}

export function TraceWaterfall({ model, selectedSpanId, primaryFailureSpanId, onSelectSpan }: TraceWaterfallProps) {
  return (
    <section className="waterfall" aria-label="Span 타임라인">
      <header className="waterfall__head">
        <div>
          <span className="section-label">실제 시간축</span>
          <strong>Span Waterfall</strong>
          <small>막대는 시작 시점과 전체 시간, 숫자는 자식 호출을 제외한 자체 시간입니다.</small>
        </div>
        <div className="waterfall-bottlenecks" aria-label="병목 span">
          {model.bottlenecks.map((span) => (
            <button key={span.id} type="button" onClick={() => onSelectSpan(span.id)}>
              <span>#{span.bottleneckRank}</span>
              <strong>{span.event.eventType}</strong>
              <small>{span.exclusiveMs}ms 자체</small>
            </button>
          ))}
        </div>
      </header>

      <div className="waterfall-scale" aria-hidden="true">
        <span>0ms</span>
        <span>{Math.round(model.durationMs * 0.25)}ms</span>
        <span>{Math.round(model.durationMs * 0.5)}ms</span>
        <span>{Math.round(model.durationMs * 0.75)}ms</span>
        <span>{model.durationMs}ms</span>
      </div>

      <div className="waterfall-rows">
        {model.spans.map((span) => {
          const selectionId = span.event.spanId ?? span.event.component

          return (
            <button
              key={span.id}
              type="button"
              className={`waterfall-row waterfall-row--${span.event.status.toLowerCase()}${selectedSpanId === selectionId ? ' is-selected' : ''}${primaryFailureSpanId === selectionId ? ' is-primary-failure' : ''}`}
              onClick={() => onSelectSpan(selectionId)}
            >
              <span className="waterfall-row__name" style={{ paddingLeft: `${10 + Math.min(span.depth, 6) * 14}px` }}>
                <strong>{span.event.eventType}</strong>
                <small>{span.event.component} · {span.event.spanKind ?? 'EVENT'}</small>
              </span>
              <span className="waterfall-row__track">
                <span
                  className={`waterfall-row__bar${span.widthPercent < 8 ? ' is-compact' : ''}`}
                  style={{ left: `${span.leftPercent}%`, width: `${span.widthPercent}%` }}
                  aria-label={`${span.durationMs}ms`}
                >
                  {span.widthPercent >= 8 ? <span>{span.durationMs}ms</span> : null}
                </span>
              </span>
              <span className="waterfall-row__exclusive">
                {span.bottleneckRank ? <b>#{span.bottleneckRank}</b> : null}
                <strong>{span.exclusiveMs}ms</strong>
                <small>자체</small>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
