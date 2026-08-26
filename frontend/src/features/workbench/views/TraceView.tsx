import { ArrowRight, Route } from 'lucide-react'
import { StatusBadge } from '../../../components/StatusBadge'
import { TraceWaterfall } from '../../../components/TraceWaterfall'
import { EVENT_STATUS_LABEL } from '../../../ui/copy'
import type { WorkbenchController } from '../hooks/useWorkbenchController'
import { TraceHistoryPanel } from './TraceHistoryPanel'
import { TraceInspector } from './TraceInspector'
import { TraceOutcomeSummary } from './TraceOutcomeSummary'
import './TraceView.css'

type TraceViewProps = {
  model: WorkbenchController['traceView']
}

export function TraceView({ model }: TraceViewProps) {
  const {
    traceDetail, recentTraces, traceHistoryFilter, setTraceHistoryFilter,
    filteredRecentTraces, selectTrace, selectedDomain, selectedApi,
    selectedApiMethodLabel, traceDisplayTone, traceDisplayStatus,
    runtimeSupported, externalTraceConfigured, analysisTarget, setActiveView,
    traceOutcome, primaryFailureEvent, primaryFailureLabel,
    failurePropagationPath, primaryFailureNodeId, setSelectedNodeId,
    traceViewTab, setTraceViewTab, waterfall, traceComparison,
    orderedTraceEvents, selectedNode,
    inspectorEvent,
  } = model

  return (
    <section className="workspace workspace--runtime">
      <aside className="left-panel control-rail">
        <div className="panel-card control-card">
          <div className="panel-header control-header">
            <div>
              <span className="section-label">실행 기록</span>
              <h2>최근 Trace</h2>
              <p>이전 실행 기록을 다시 확인할 수 있습니다.</p>
            </div>
            <StatusBadge tone="info">{recentTraces.length}개 기록</StatusBadge>
          </div>
            <TraceHistoryPanel
              traces={filteredRecentTraces}
              totalCount={recentTraces.length}
              filter={traceHistoryFilter}
              selectedTraceId={traceDetail?.traceId ?? null}
              onFilterChange={setTraceHistoryFilter}
              onSelectTrace={(traceId) => void selectTrace(traceId)}
            />

        </div>
      </aside>
      <section className="graph-panel">
            <div className="panel-card panel-card--graph">
              <div className="graph-head">
                <div>
                  <span className="section-label">실제 실행 결과 · Runtime Trace</span>
                  <h2>{selectedDomain.name} 요청 흐름</h2>
                  <p>
                    {traceDetail
                      ? `${traceDetail.method} ${traceDetail.endpoint} · HTTP ${traceDetail.httpStatus || '-'}`
                      : runtimeSupported
                        ? `${selectedApiMethodLabel} ${selectedApi.pathTemplate} 요청을 실행하면 실제 흐름이 표시됩니다.`
                        : externalTraceConfigured
                          ? `${selectedApiMethodLabel} ${selectedApi.pathTemplate} 요청 후 실제 OpenTelemetry span을 표시합니다.`
                        : !selectedApi.methodSpecified
                          ? 'HTTP method가 명시되지 않아 정적 분석만 가능합니다.'
                          : '프로젝트 구조에서 Agent 실행 설정을 먼저 생성하세요.'}
                  </p>
                </div>
                <StatusBadge tone={traceDisplayTone}>
                  {traceDisplayStatus}
                </StatusBadge>
              </div>

              {!traceDetail ? (
                <div className="trace-empty-state">
                  <Route size={34} aria-hidden="true" />
                  <strong>먼저 API 요청을 실행하세요</strong>
                  <p>{analysisTarget === 'external' ? 'Agent로 대상 앱을 재시작한 뒤 API 요청을 보내면 실제 부모·자식 span을 확인할 수 있습니다.' : '실행 가능한 Product API를 보내면 Controller부터 Response까지 실제 호출 경로를 확인할 수 있습니다.'}</p>
                  <button type="button" onClick={() => setActiveView('api')}>
                    API 요청으로 이동
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <>
              <TraceOutcomeSummary
                trace={traceDetail}
                outcome={traceOutcome ?? 'success'}
                failureEvent={primaryFailureEvent}
                failureLabel={primaryFailureLabel}
                propagationPath={failurePropagationPath}
                onInspectFailure={() => setSelectedNodeId(primaryFailureNodeId)}
              />

              <div className="trace-view-tabs" role="tablist" aria-label="Trace 보기 방식">
                <button type="button" role="tab" aria-selected={traceViewTab === 'timeline'} className={traceViewTab === 'timeline' ? 'is-active' : ''} onClick={() => setTraceViewTab('timeline')}>
                  타임라인
                </button>
                <button type="button" role="tab" aria-selected={traceViewTab === 'events'} className={traceViewTab === 'events' ? 'is-active' : ''} onClick={() => setTraceViewTab('events')}>
                  이벤트 <span>{traceDetail.events.length}</span>
                </button>
              </div>

              {traceViewTab === 'timeline' ? (
                <>
                  <TraceWaterfall
                    model={waterfall}
                    selectedSpanId={selectedNode?.id ?? null}
                    primaryFailureSpanId={primaryFailureNodeId}
                    onSelectSpan={setSelectedNodeId}
                  />
                  {traceComparison ? (
                    <details className="trace-comparison-disclosure">
                      <summary>정적 예상 흐름과 실제 Trace 비교</summary>
                      <section className="trace-comparison" aria-label="예상 흐름과 실제 Trace 비교">
                        <div>
                          <span className="section-label">정적 예상 단계</span>
                          {traceComparison.expected.map((item) => (
                            <p key={item.id} className={item.matched ? 'is-matched' : 'is-missing'}>
                              <strong>{item.label}</strong>
                              <span>{item.matched ? '실제 호출 확인' : '실행되지 않은 예상 단계'}</span>
                            </p>
                          ))}
                        </div>
                        <div>
                          <span className="section-label">실제 OpenTelemetry span</span>
                          {traceComparison.actual.map((item) => (
                            <p key={item.id} className={item.expected ? 'is-matched' : 'is-unexpected'}>
                              <strong>{item.label}</strong>
                              <span>{item.expected ? '예상 흐름과 일치' : '예상에 없던 실제 호출'}</span>
                            </p>
                          ))}
                        </div>
                      </section>
                    </details>
                  ) : null}
                </>
              ) : null}

              {traceViewTab === 'events' ? (
                <section className="trace-event-table" aria-label="시간순 Trace 이벤트">
                  <header>
                    <span>시작</span>
                    <span>Span</span>
                    <span>구성 요소</span>
                    <span>소요 시간</span>
                    <span>상태</span>
                  </header>
                  {orderedTraceEvents.map((event) => (
                    <button
                      key={event.eventId}
                      type="button"
                      className={selectedNode?.id === (event.spanId ?? event.component) ? 'is-selected' : ''}
                      onClick={() => setSelectedNodeId(event.spanId ?? event.component)}
                    >
                      <span>{new Date(event.startedAt).toLocaleTimeString('ko-KR', { hour12: false, fractionalSecondDigits: 3 })}</span>
                      <strong>{event.eventType}</strong>
                      <span>{event.component}</span>
                      <span>{event.durationMs}ms</span>
                      <StatusBadge tone={event.status === 'SUCCESS' ? 'success' : event.status === 'WARNING' ? 'warning' : 'error'}>
                        {EVENT_STATUS_LABEL[event.status]}
                      </StatusBadge>
                    </button>
                  ))}
                </section>
              ) : null}
                </>
              )}
            </div>

      </section>
      <aside className="right-panel inspector-rail">
            <TraceInspector
              trace={traceDetail}
              selectedNode={selectedNode}
              selectedEvent={inspectorEvent}
              primaryFailureEvent={primaryFailureEvent}
              primaryFailureLabel={primaryFailureLabel}
              onInspectPrimaryFailure={() => setSelectedNodeId(primaryFailureNodeId)}
            />

      </aside>
    </section>
  )
}
