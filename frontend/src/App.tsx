import { useEffect, useMemo, useRef, useState, startTransition } from 'react'
import { Background, Controls, MiniMap, ReactFlow } from '@xyflow/react'
import './App.css'
import { buildGraph, getNodeDetail } from './lib/graph'
import type {
  EventStatus,
  ProductPayload,
  TraceDetail,
  TraceEvent,
  TraceSessionResponse,
  TraceStartedEvent,
  TraceSummary,
  TraceTerminalEvent,
} from './types/trace'

const SCENARIOS = [
  { value: 'normal', label: 'Normal' },
  { value: 'redis-down', label: 'Redis Down' },
  { value: 'db-timeout', label: 'DB Timeout' },
  { value: 'service-error', label: 'Service Error' },
] as const

function App() {
  const [productId, setProductId] = useState('1001')
  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number]['value']>('normal')
  const [traceDetail, setTraceDetail] = useState<TraceDetail | null>(null)
  const [recentTraces, setRecentTraces] = useState<TraceSummary[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [requestState, setRequestState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [streamStatus, setStreamStatus] = useState<'idle' | 'connecting' | 'streaming' | 'completed' | 'error'>('idle')
  const [requestMessage, setRequestMessage] = useState<string>('Open a live stream and run a request.')
  const activeStreamRef = useRef<EventSource | null>(null)

  const graph = buildGraph(traceDetail)
  const selectedNode = getNodeDetail(graph.states, selectedNodeId ?? graph.states.find((state) => state.active)?.id ?? null)

  const recentEvents = useMemo(() => {
    return traceDetail?.events.slice().reverse().slice(0, 6) ?? []
  }, [traceDetail])

  useEffect(() => {
    void loadRecentTraces()
    return () => {
      closeActiveStream()
    }
  }, [])

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
    closeActiveStream()
    setRequestState('loading')
    setStreamStatus('connecting')
    setRequestMessage('Creating trace session and opening live stream...')

    try {
      const sessionResponse = await fetch('/api/traces/session', { method: 'POST' })
      if (!sessionResponse.ok) {
        throw new Error('Trace session could not be created.')
      }

      const session = (await sessionResponse.json()) as TraceSessionResponse
      const traceId = session.traceId
      const endpoint = `/api/products/${productId}`

      startTransition(() => {
        setTraceDetail(createPlaceholderTrace(traceId, endpoint, scenario))
        setSelectedNodeId(null)
      })

      try {
        const stream = await openTraceStream(traceId)
        activeStreamRef.current = stream
        setStreamStatus('streaming')
        setRequestMessage('Live stream connected. Running request through StackFlow...')
      } catch {
        setStreamStatus('error')
        setRequestMessage('Live stream unavailable. Running request and falling back to final trace load...')
      }

      const search = new URLSearchParams({ traceId })
      if (scenario !== 'normal') {
        search.set('scenario', scenario)
      }

      const response = await fetch(`${endpoint}?${search.toString()}`)
      const payload = (await response.json()) as ProductPayload

      if (!payload.traceId) {
        throw new Error('Request did not return a trace id.')
      }

      const finalTrace = await fetchTraceWithRetry(payload.traceId)

      startTransition(() => {
        setTraceDetail(finalTrace)
        setSelectedNodeId((current) => current ?? finalTrace.events.at(-1)?.component ?? null)
        setRequestState(response.ok ? 'idle' : 'error')
        setRequestMessage(buildRequestMessage(finalTrace.resultStatus, payload, streamStatus))
        setRecentTraces((current) => {
          const next = current.filter((item) => item.traceId !== finalTrace.traceId)
          next.unshift({
            traceId: finalTrace.traceId,
            endpoint: finalTrace.endpoint,
            scenario: finalTrace.scenario,
            resultStatus: finalTrace.resultStatus,
            httpStatus: finalTrace.httpStatus,
            durationMs: finalTrace.durationMs,
            startedAt: finalTrace.startedAt,
          })
          return next.slice(0, 8)
        })
      })
    } catch (error) {
      setRequestState('error')
      setStreamStatus('error')
      setRequestMessage(error instanceof Error ? error.message : 'Request failed unexpectedly.')
    }
  }

  async function openTraceStream(traceId: string) {
    let terminalReceived = false

    return await new Promise<EventSource>((resolve, reject) => {
      const stream = new EventSource(`/api/traces/${traceId}/stream`)
      let opened = false

      const onOpen = () => {
        opened = true
        resolve(stream)
      }

      const onStarted = (rawEvent: MessageEvent<string>) => {
        const payload = JSON.parse(rawEvent.data) as TraceStartedEvent
        startTransition(() => {
          setStreamStatus('streaming')
          setTraceDetail((current) => {
            if (!current || current.traceId !== payload.traceId) {
              return current
            }

            return {
              ...current,
              method: payload.method,
              endpoint: payload.endpoint,
              scenario: payload.scenario,
              startedAt: payload.timestamp,
            }
          })
          setRequestMessage('Receiving live events...')
        })
      }

      const onTraceEvent = (rawEvent: MessageEvent<string>) => {
        const payload = JSON.parse(rawEvent.data) as TraceEvent
        startTransition(() => {
          setTraceDetail((current) => {
            if (!current || current.traceId !== payload.traceId) {
              return current
            }

            return {
              ...current,
              events: [...current.events, payload],
              endedAt: payload.endedAt,
            }
          })
          setSelectedNodeId(payload.component)
        })
      }

      const onTerminal = (rawEvent: MessageEvent<string>, nextStatus: 'completed' | 'error') => {
        terminalReceived = true
        const payload = JSON.parse(rawEvent.data) as TraceTerminalEvent
        startTransition(() => {
          setStreamStatus(nextStatus)
          setTraceDetail((current) => {
            if (!current || current.traceId !== payload.traceId) {
              return current
            }

            return {
              ...current,
              endedAt: payload.timestamp,
              durationMs: payload.durationMs,
              httpStatus: payload.httpStatus,
              resultStatus: payload.resultStatus,
            }
          })
          setRequestMessage(
            nextStatus === 'completed'
              ? 'Live trace completed. Finalizing detail view...'
              : `Live trace failed at ${payload.errorType ?? 'unknown component'}. Finalizing detail view...`,
          )
        })
      }

      const onError = () => {
        stream.close()
        if (terminalReceived) {
          return
        }

        if (!opened) {
          reject(new Error('Live stream could not be opened.'))
          return
        }

        startTransition(() => {
          setStreamStatus('error')
        })
      }

      stream.addEventListener('open', onOpen as EventListener)
      stream.addEventListener('trace_started', onStarted as EventListener)
      stream.addEventListener('trace_event', onTraceEvent as EventListener)
      stream.addEventListener('trace_completed', ((event: Event) => onTerminal(event as MessageEvent<string>, 'completed')) as EventListener)
      stream.addEventListener('trace_failed', ((event: Event) => onTerminal(event as MessageEvent<string>, 'error')) as EventListener)
      stream.addEventListener('error', onError as EventListener)
    })
  }

  function closeActiveStream() {
    activeStreamRef.current?.close()
    activeStreamRef.current = null
  }

  async function selectTrace(traceId: string) {
    closeActiveStream()
    const detail = await fetchTraceWithRetry(traceId)
    startTransition(() => {
      setTraceDetail(detail)
      setSelectedNodeId(null)
      setStreamStatus('idle')
      setRequestState('idle')
      setRequestMessage(`Loaded trace ${detail.traceId.slice(0, 8)} from history.`)
    })
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">StackFlow MVP</p>
          <h1>Trace the request. See the failure node.</h1>
          <p className="hero-copy">
            Open a live stream before the request starts, then watch Controller, Service, Redis, Repository, MySQL,
            and Response activate in real time.
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
            <span>Stream</span>
            <strong>{streamStatus.toUpperCase()}</strong>
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
              {requestState === 'loading' ? 'Streaming...' : 'Run Live Request'}
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
                    onClick={() => void selectTrace(trace.traceId)}
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
                    ? `${traceDetail.method} ${traceDetail.endpoint} · HTTP ${traceDetail.httpStatus || '-'}`
                    : 'Run the first request to activate the live graph.'}
                </p>
              </div>
              <span className={`pill pill--inline pill--${streamStatus === 'completed' ? 'success' : streamStatus === 'streaming' ? 'loading' : streamStatus}`}>
                {streamStatus.toUpperCase()}
              </span>
            </div>
            <div className="replay-status">
              <span>{traceDetail?.events.length ?? 0} live events captured</span>
              <span>{traceDetail ? `${traceDetail.durationMs}ms total` : 'waiting for stream'}</span>
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

          <div className="panel-card">
            <div className="panel-header">
              <h2>Live Event Log</h2>
              <span>{recentEvents.length}</span>
            </div>
            <div className="visit-list">
              {recentEvents.length === 0 ? (
                <p className="empty-copy">No live event received yet.</p>
              ) : (
                recentEvents.map((event) => (
                  <article key={event.eventId} className="visit-card">
                    <header>
                      <strong>{event.component}</strong>
                      <span className={`pill pill--inline pill--${event.status.toLowerCase()}`}>{event.status}</span>
                    </header>
                    <dl>
                      <div>
                        <dt>Type</dt>
                        <dd>{event.eventType}</dd>
                      </div>
                      <div>
                        <dt>Duration</dt>
                        <dd>{event.durationMs}ms</dd>
                      </div>
                    </dl>
                  </article>
                ))
              )}
            </div>
          </div>
        </aside>
      </section>
    </main>
  )
}

function createPlaceholderTrace(traceId: string, endpoint: string, scenario: string): TraceDetail {
  const now = new Date().toISOString()
  return {
    traceId,
    method: 'GET',
    endpoint,
    scenario,
    startedAt: now,
    endedAt: now,
    durationMs: 0,
    httpStatus: 0,
    resultStatus: 'SUCCESS',
    events: [],
  }
}

async function fetchTraceWithRetry(traceId: string) {
  const attempts = 5

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`/api/traces/${traceId}`)
    if (response.ok) {
      return (await response.json()) as TraceDetail
    }

    await new Promise((resolve) => window.setTimeout(resolve, 220))
  }

  throw new Error('Trace detail could not be loaded.')
}

function buildRequestMessage(resultStatus: EventStatus, payload: ProductPayload, currentStreamStatus: string) {
  if (payload.errorMessage) {
    return `${resultStatus}: ${payload.errorMessage}`
  }

  if (payload.cacheStatus) {
    return `${resultStatus}: product flow captured with cache ${payload.cacheStatus} (${currentStreamStatus}).`
  }

  return `${resultStatus}: request captured successfully (${currentStreamStatus}).`
}

export default App
