import type { TraceSummary } from '../../../types/trace'
import { EVENT_STATUS_LABEL } from '../../../ui/copy'
import type { TraceHistoryFilter } from '../traceModel'

interface TraceHistoryPanelProps {
  traces: TraceSummary[]
  totalCount: number
  filter: TraceHistoryFilter
  selectedTraceId: string | null
  onFilterChange: (filter: TraceHistoryFilter) => void
  onSelectTrace: (traceId: string) => void
}

const FILTERS: { value: TraceHistoryFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'success', label: '정상' },
  { value: 'attention', label: '확인 필요' },
  { value: 'timeout', label: '시간 초과' },
]

export function TraceHistoryPanel({
  traces,
  totalCount,
  filter,
  selectedTraceId,
  onFilterChange,
  onSelectTrace,
}: TraceHistoryPanelProps) {
  return (
    <div className="panel-card recent-card trace-history-panel">
      <div className="panel-header">
        <div>
          <span className="section-label">실행 기록</span>
          <h2>최근 Trace</h2>
        </div>
        <span>{totalCount}</span>
      </div>

      <div className="trace-history-filters" aria-label="Trace 결과 필터">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={filter === item.value ? 'is-active' : ''}
            aria-pressed={filter === item.value}
            onClick={() => onFilterChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="trace-list">
        {traces.length === 0 ? (
          <p className="empty-copy">{totalCount === 0 ? '아직 수집된 Trace가 없습니다.' : '이 조건에 맞는 Trace가 없습니다.'}</p>
        ) : (
          traces.map((trace) => (
            <button
              key={trace.traceId}
              type="button"
              className={`trace-item trace-item--${trace.resultStatus.toLowerCase()}${selectedTraceId === trace.traceId ? ' is-selected' : ''}`}
              onClick={() => onSelectTrace(trace.traceId)}
            >
              <div>
                <strong>{trace.endpoint}</strong>
                <span>{trace.traceId.slice(0, 8)}</span>
              </div>
              <div>
                <span className={`pill pill--inline pill--${trace.resultStatus.toLowerCase()}`}>{EVENT_STATUS_LABEL[trace.resultStatus]}</span>
                <span>{trace.durationMs}ms</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
