import { useEffect, useMemo, useRef, useState, startTransition } from 'react'
import { Background, Controls, MiniMap, ReactFlow } from '@xyflow/react'
import './App.css'
import { buildGraph, getNodeDetail } from './lib/graph'
import type { EventStatus, ProductPayload, TraceDetail, TraceEvent, TraceSummary } from './types/trace'

const SCENARIOS = [
  { value: 'normal', label: 'Normal' },
  { value: 'redis-down', label: 'Redis Down' },
  { value: 'db-timeout', label: 'DB Timeout' },
  { value: 'service-error', label: 'Service Error' },
] as const

const MIN_REPLAY_STEP_MS = 420
const MAX_REPLAY_STEP_MS = 1100

function App() {
  const [productId, setProductId] = useState('1001')
  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number]['value']>('normal')
  const [traceDetail, setTraceDetail] = useState<TraceDetail | null>(null)
  const [recentTraces, setRecentTraces] = useState<TraceSummary[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [requestState, setRequestState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [requestMessage, setRequestMessage] = useState<string>('Run a request to capture the first flow.')
  const [replayIndex, setReplayIndex] = useState(0)
  const [isReplaying, setIsReplaying] = useState(false)
  const replayTimersRef = useRef<number[]>([])

  function clearReplayTimers() {
    replayTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    replayTimersRef.current = []
  }

  const visibleTrace = useMemo(() => {
    if (!traceDetail) {
      return null
    }

    return {
      ...traceDetail,
      events: traceDetail.events.slice(0, replayIndex),
    }
  }, [traceDetail, replayIndex])

  const graph = buildGraph(visibleTrace)
  const selectedNode = getNodeDetail(graph.states, selectedNodeId ?? graph.states.find((state) => state.active)?.id ?? null)

  useEffect(() => {
    void loadRecentTraces()
  }, [])

  useEffect(() => {
    return () => {
      clearReplayTimers()
    }
  }, [])

  useEffect(() => {
    if (!traceDetail) {
      setReplayIndex(0)
      setIsReplaying(false)
      return
    }

    clearReplayTimers()
    setReplayIndex(0)
    setIsReplaying(true)

    const events = traceDetail.events
    if (events.length === 0) {
      setIsReplaying(false)
      return
    }

    events.forEach((event, index) => {
      const timeoutId = window.setTimeout(() => {
        startTransition(() => {
          setReplayIndex(index + 1)
          setSelectedNodeId(event.component)
          if (index === events.length - 1) {
            setIsReplaying(false)
          }
        })
      }, getReplayDelay(events, index))
      replayTimersRef.current.push(timeoutId)
    })
  }, [traceDetail])

  async function loadRecentTraces() {
    const response = await fetch('/api/traces')
    if (!response.ok) {
      return
    }

    const traces = (await response.json()) as TraceSummary[]
    startTransition(() => {
      setRecentTraces(traces)
    })
  }

  async function runRequest() {
    setRequestState('loading')
    setRequestMessage('Running request through StackFlow...')

    const search = new URLSearchParams()
    if (scenario !== 'normal') {
      search.set('scenario', scenario)
    }

    const response = await fetch(`/api/products/${productId}?${search.toString()}`)
    const payload = (await response.json()) as ProductPayload

    if (!payload.traceId) {
      setRequestState('error')
      setRequestMessage('Request did not return a trace id.')
      return
    }

    const traceResponse = await fetch(`/api/traces/${payload.traceId}`)
    if (!traceResponse.ok) {
      setRequestState('error')
      setRequestMessage('Trace detail could not be loaded.')
      return
    }

    const trace = (await traceResponse.json()) as TraceDetail
    startTransition(() => {
      setTraceDetail(trace)
      setSelectedNodeId(null)
      setRequestState(response.ok ? 'idle' : 'error')
      setRequestMessage(buildRequestMessage(trace.resultStatus, payload))
      setRecentTraces((current) => {
        const next = current.filter((item) => item.traceId !== trace.traceId)
        next.unshift({
          traceId: trace.traceId,
          endpoint: trace.endpoint,
          scenario: trace.scenario,
          resultStatus: trace.resultStatus,
          httpStatus: trace.httpStatus,
          durationMs: trace.durationMs,
          startedAt: trace.startedAt,
        })
        return next.slice(0, 8)
      })
    })
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">StackFlow MVP</p>
          <h1>Trace the request. See the failure node.</h1>
          <p className="hero-copy">
            Run a sample product lookup and inspect how the request moved through
            Controller, Service, Redis, Repository, MySQL, and Response.
          </p>
        </div>
        <div className="hero-stats">
          <article>
            <span>Current Trace</span>
            <strong>{traceDetail?.traceId.slice(0, 8) ?? 'waiting'}</strong>
          </article>
          <article>
            <span>Result</span>
            <strong className={`status-text status-text--${(traceDetail?.resultStatus ?? 'SUCCESS').toLowerCase()}`}>
              {traceDetail?.resultStatus ?? 'IDLE'}
            </strong>
          </article>
          <article>
            <span>Latency</span>
            <strong>{traceDetail?.durationMs ?? 0}ms</strong>
          </article>
        </div>
      </section>

      <section className="workspace">
        <aside className="left-panel">
          <div className="panel-card">
            <div className="panel-header">
              <h2>Request Runner</h2>
              <span className={`pill pill--${requestState}`}>{requestState}</span>
            </div>
            <label className="field">
              <span>Product ID</span>
              <input value={productId} onChange={(event) => setProductId(event.target.value)} />
            </label>
            <label className="field">
              <span>Scenario</span>
              <select value={scenario} onChange={(event) => setScenario(event.target.value as (typeof SCENARIOS)[number]['value'])}>
                {SCENARIOS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="run-button" type="button" onClick={() => void runRequest()} disabled={requestState === 'loading'}>
              {requestState === 'loading' ? 'Running...' : 'Run Request'}
            </button>
            <p className="request-message">{requestMessage}</p>
          </div>

          <div className="panel-card">
            <div className="panel-header">
              <h2>Recent Traces</h2>
              <span>{recentTraces.length}</span>
            </div>
            <div className="trace-list">
              {recentTraces.length === 0 ? (
                <p className="empty-copy">No trace captured yet.</p>
              ) : (
                recentTraces.map((trace) => (
                  <button
                    key={trace.traceId}
                    type="button"
                    className={`trace-item${traceDetail?.traceId === trace.traceId ? ' is-selected' : ''}`}
                    onClick={async () => {
                      const response = await fetch(`/api/traces/${trace.traceId}`)
                      if (!response.ok) return
                      const detail = (await response.json()) as TraceDetail
                      startTransition(() => {
                        setTraceDetail(detail)
                        setSelectedNodeId(null)
                        setRequestMessage(`Loaded trace ${detail.traceId.slice(0, 8)} from history.`)
                      })
                    }}
                  >
                    <div>
                      <strong>{trace.endpoint}</strong>
                      <span>{trace.traceId.slice(0, 8)}</span>
                    </div>
                    <div>
                      <span className={`pill pill--inline pill--${trace.resultStatus.toLowerCase()}`}>{trace.resultStatus}</span>
                      <span>{trace.durationMs}ms</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="graph-panel">
          <div className="panel-card panel-card--graph">
            <div className="panel-header">
              <div>
                <h2>Request Flow Graph</h2>
                <p>
                  {traceDetail
                    ? `${traceDetail.method} ${traceDetail.endpoint} · HTTP ${traceDetail.httpStatus}`
                    : 'Run the first request to activate the graph.'}
                </p>
              </div>
              {traceDetail ? (
                <button className="replay-button" type="button" onClick={() => setTraceDetail({ ...traceDetail })}>
                  Replay Flow
                </button>
              ) : null}
            </div>
            <div className="replay-status">
              <span className={`pill pill--inline pill--${isReplaying ? 'loading' : 'success'}`}>
                {isReplaying ? 'REPLAYING' : 'COMPLETE'}
              </span>
              <span>
                {visibleTrace?.events.length ?? 0} / {traceDetail?.events.length ?? 0} events shown
              </span>
            </div>
            <div className="graph-surface">
              <ReactFlow
                fitView
                nodes={graph.nodes}
                edges={graph.edges}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                nodesConnectable={false}
                nodesDraggable={false}
                elementsSelectable
              >
                <MiniMap pannable zoomable />
                <Controls showInteractive={false} />
                <Background gap={20} size={1} />
              </ReactFlow>
            </div>
          </div>
        </section>

        <aside className="right-panel">
          <div className="panel-card">
            <div className="panel-header">
              <h2>Node Detail</h2>
              {selectedNode ? (
                <span className={`pill pill--inline pill--${selectedNode.status.toLowerCase()}`}>
                  {selectedNode.status}
                </span>
              ) : null}
            </div>
            {!selectedNode ? (
              <p className="empty-copy">Select a node to inspect event detail.</p>
            ) : (
              <div className="detail-stack">
                <div className="detail-summary">
                  <strong>{selectedNode.label}</strong>
                  <span>{selectedNode.durationMs}ms total</span>
                </div>
                <div className="detail-grid">
                  <div>
                    <span>Trace ID</span>
                    <strong>{traceDetail?.traceId ?? '-'}</strong>
                  </div>
                  <div>
                    <span>Visits</span>
                    <strong>{selectedNode.visits.length}</strong>
                  </div>
                </div>
                <div className="visit-list">
                  {selectedNode.visits.length === 0 ? (
                    <p className="empty-copy">This node was not visited in the current trace.</p>
                  ) : (
                    selectedNode.visits.map((event) => (
                      <article key={event.eventId} className="visit-card">
                        <header>
                          <strong>{event.eventType}</strong>
                          <span className={`pill pill--inline pill--${event.status.toLowerCase()}`}>{event.status}</span>
                        </header>
                        <dl>
                          <div>
                            <dt>Duration</dt>
                            <dd>{event.durationMs}ms</dd>
                          </div>
                          <div>
                            <dt>Error Type</dt>
                            <dd>{event.errorType ?? '-'}</dd>
                          </div>
                          <div>
                            <dt>Error Message</dt>
                            <dd>{event.errorMessage ?? '-'}</dd>
                          </div>
                        </dl>
                        <div className="metadata-list">
                          {Object.keys(event.metadata).length === 0 ? (
                            <span className="metadata-item">No metadata</span>
                          ) : (
                            Object.entries(event.metadata).map(([key, value]) => (
                              <span key={key} className="metadata-item">
                                {key}: {value}
                              </span>
                            ))
                          )}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </section>
    </main>
  )
}

function buildRequestMessage(resultStatus: EventStatus, payload: ProductPayload) {
  if (payload.errorMessage) {
    return `${resultStatus}: ${payload.errorMessage}`
  }

  if (payload.cacheStatus) {
    return `${resultStatus}: product flow captured with cache ${payload.cacheStatus}.`
  }

  return `${resultStatus}: request captured successfully.`
}

function getReplayDelay(events: TraceEvent[], index: number): number {
  if (index === 0) {
    return MIN_REPLAY_STEP_MS
  }

  const current = new Date(events[index].startedAt).getTime()
  const previous = new Date(events[index - 1].startedAt).getTime()
  const rawGap = current - previous
  const boundedGap = Math.max(MIN_REPLAY_STEP_MS, Math.min(MAX_REPLAY_STEP_MS, rawGap))
  return getReplayDelay(events, index - 1) + boundedGap
}

export default App
