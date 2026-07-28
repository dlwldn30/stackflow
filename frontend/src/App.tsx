import { useEffect, useMemo, useRef, useState, startTransition } from 'react'
import { Background, Controls, MiniMap, ReactFlow } from '@xyflow/react'
import './App.css'
import { buildGraph, getNodeDetail } from './lib/graph'
import type {
  ApiCatalogItem,
  EventStatus,
  HttpMethod,
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

type ApiDefinition = {
  id: string
  method: HttpMethod
  label: string
  pathTemplate: string
  description: string
  requiresProductId: boolean
  controller: string
  handler: string
  source: 'analyzed' | 'fallback'
  buildPath: (productId: string) => string
}

const FALLBACK_API_CATALOG: ApiDefinition[] = [
  {
    id: 'product-detail',
    method: 'GET',
    label: 'Product detail',
    pathTemplate: '/api/products/{productId}',
    description: 'Redis cache hit/miss와 DB fallback을 확인하는 기본 상품 조회 API입니다.',
    requiresProductId: true,
    controller: 'ProductController',
    handler: 'getProduct',
    source: 'fallback',
    buildPath: (productId) => `/api/products/${productId}`,
  },
  {
    id: 'product-list',
    method: 'GET',
    label: 'Product list',
    pathTemplate: '/api/products',
    description: '상품 목록을 조회하며 Redis 없이 Service -> Repository -> MySQL 경로를 확인합니다.',
    requiresProductId: false,
    controller: 'ProductController',
    handler: 'listProducts',
    source: 'fallback',
    buildPath: () => '/api/products',
  },
  {
    id: 'product-stock',
    method: 'GET',
    label: 'Product stock',
    pathTemplate: '/api/products/{productId}/stock',
    description: '상품 재고 조회 API로 DB timeout과 Service 예외 위치를 확인합니다.',
    requiresProductId: true,
    controller: 'ProductController',
    handler: 'getProductStock',
    source: 'fallback',
    buildPath: (productId) => `/api/products/${productId}/stock`,
  },
  {
    id: 'cache-refresh',
    method: 'POST',
    label: 'Refresh cache',
    pathTemplate: '/api/products/{productId}/cache-refresh',
    description: 'DB에서 상품을 다시 읽고 Redis에 저장하는 쓰기성 요청 흐름을 확인합니다.',
    requiresProductId: true,
    controller: 'ProductController',
    handler: 'refreshProductCache',
    source: 'fallback',
    buildPath: (productId) => `/api/products/${productId}/cache-refresh`,
  },
]

const DOMAINS = [
  {
    id: 'product',
    name: 'Product',
    description: '상품 조회 요청이 cache, repository, database를 어떻게 통과하는지 확인합니다.',
    layers: ['Controller', 'Service', 'Redis', 'Repository', 'MySQL'],
  },
]

const PROJECT_FACTS = [
  { label: 'Backend', value: 'Spring Boot' },
  { label: 'Runtime trace', value: 'SSE live stream' },
  { label: 'Detected layers', value: 'Controller / Service / Repository' },
  { label: 'Infra path', value: 'Redis / MySQL' },
] as const

function App() {
  const [productId, setProductId] = useState('1001')
  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number]['value']>('normal')
  const [apiCatalog, setApiCatalog] = useState<ApiDefinition[]>(FALLBACK_API_CATALOG)
  const [catalogSource, setCatalogSource] = useState<'analyzed' | 'fallback'>('fallback')
  const [selectedApiId, setSelectedApiId] = useState(FALLBACK_API_CATALOG[0].id)
  const [selectedDomainId, setSelectedDomainId] = useState(DOMAINS[0].id)
  const [traceDetail, setTraceDetail] = useState<TraceDetail | null>(null)
  const [recentTraces, setRecentTraces] = useState<TraceSummary[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [requestState, setRequestState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [streamStatus, setStreamStatus] = useState<'idle' | 'connecting' | 'streaming' | 'completed' | 'error'>('idle')
  const [requestMessage, setRequestMessage] = useState<string>('Open a live stream and run a request.')
  const activeStreamRef = useRef<EventSource | null>(null)
  const activeRunIdRef = useRef(0)

  const graph = buildGraph(traceDetail)
  const selectedNode = getNodeDetail(graph.states, selectedNodeId ?? graph.states.find((state) => state.active)?.id ?? null)
  const activeNodeCount = graph.states.filter((state) => state.active).length
  const latestEvent = traceDetail?.events.at(-1) ?? null
  const selectedDomain = DOMAINS.find((domain) => domain.id === selectedDomainId) ?? DOMAINS[0]
  const selectedApi = apiCatalog.find((api) => api.id === selectedApiId) ?? apiCatalog[0] ?? FALLBACK_API_CATALOG[0]
  const domainEndpoints = apiCatalog.map((api) => `${api.method} ${api.pathTemplate}`)
  const activeRoute = graph.states.filter((state) => state.active)

  const recentEvents = useMemo(() => {
    return traceDetail?.events.slice().reverse().slice(0, 6) ?? []
  }, [traceDetail])

  useEffect(() => {
    void loadApiCatalog()
    void loadRecentTraces()
    return () => {
      closeActiveStream()
    }
  }, [])

  async function loadApiCatalog() {
    try {
      const response = await fetch('/api/project/apis')
      if (!response.ok) {
        throw new Error('API catalog request failed.')
      }

      const items = (await response.json()) as ApiCatalogItem[]
      const analyzedCatalog = items.map(toApiDefinition)
      if (analyzedCatalog.length === 0) {
        throw new Error('No API mapping detected.')
      }

      startTransition(() => {
        setApiCatalog(analyzedCatalog)
        setCatalogSource('analyzed')
        setSelectedApiId((current) => analyzedCatalog.some((api) => api.id === current) ? current : analyzedCatalog[0].id)
      })
    } catch {
      startTransition(() => {
        setApiCatalog(FALLBACK_API_CATALOG)
        setCatalogSource('fallback')
        setSelectedApiId((current) => FALLBACK_API_CATALOG.some((api) => api.id === current) ? current : FALLBACK_API_CATALOG[0].id)
      })
    }
  }

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
    const runId = activeRunIdRef.current + 1
    activeRunIdRef.current = runId
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
      const endpoint = selectedApi.buildPath(productId)

      startTransition(() => {
        setTraceDetail(createPlaceholderTrace(traceId, selectedApi.method, endpoint, scenario))
        setSelectedNodeId(null)
      })

      try {
        const stream = await openTraceStream(traceId, runId)
        if (activeRunIdRef.current !== runId) {
          stream.close()
          return
        }
        activeStreamRef.current = stream
        setStreamStatus('streaming')
        setRequestMessage('Live stream connected. Running request through StackFlow...')
      } catch {
        if (activeRunIdRef.current !== runId) {
          return
        }
        setStreamStatus('error')
        setRequestMessage('Live stream unavailable. Running request and falling back to final trace load...')
      }

      const search = new URLSearchParams({ traceId })
      if (scenario !== 'normal') {
        search.set('scenario', scenario)
      }

      const response = await fetch(`${endpoint}?${search.toString()}`, { method: selectedApi.method })
      const payload = (await response.json()) as ProductPayload

      if (activeRunIdRef.current !== runId) {
        return
      }

      if (!payload.traceId) {
        throw new Error('Request did not return a trace id.')
      }

      const finalTrace = await fetchTraceWithRetry(payload.traceId)
      if (activeRunIdRef.current !== runId) {
        return
      }

      startTransition(() => {
        setTraceDetail(finalTrace)
        setSelectedNodeId((current) => current ?? finalTrace.events.at(-1)?.component ?? null)
        setRequestState(response.ok ? 'idle' : 'error')
        setStreamStatus(response.ok ? 'completed' : 'error')
        setRequestMessage(buildRequestMessage(finalTrace.resultStatus, payload))
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
      if (activeRunIdRef.current !== runId) {
        return
      }
      setRequestState('error')
      setStreamStatus('error')
      setRequestMessage(error instanceof Error ? error.message : 'Request failed unexpectedly.')
    }
  }

  async function openTraceStream(traceId: string, runId: number) {
    let terminalReceived = false

    return await new Promise<EventSource>((resolve, reject) => {
      const stream = new EventSource(`/api/traces/${traceId}/stream`)
      let opened = false
      let resolved = false
      const fallbackTimer = window.setTimeout(() => {
        if (!resolved && stream.readyState !== EventSource.CLOSED) {
          resolved = true
          opened = true
          resolve(stream)
        }
      }, 1500)

      const finalizeResolve = () => {
        if (resolved) {
          return
        }

        resolved = true
        opened = true
        window.clearTimeout(fallbackTimer)
        resolve(stream)
      }

      const finalizeReject = (error: Error) => {
        if (resolved) {
          return
        }

        resolved = true
        window.clearTimeout(fallbackTimer)
        reject(error)
      }

      const onOpen = () => {
        finalizeResolve()
      }

      const onReady = () => {
        finalizeResolve()
      }

      const onStarted = (rawEvent: MessageEvent<string>) => {
        if (activeRunIdRef.current !== runId) {
          return
        }
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
        if (activeRunIdRef.current !== runId) {
          return
        }
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
        if (activeRunIdRef.current !== runId) {
          return
        }
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

        if (activeRunIdRef.current !== runId) {
          return
        }

        if (!opened) {
          finalizeReject(new Error('Live stream could not be opened.'))
          return
        }

        startTransition(() => {
          setStreamStatus('error')
        })
      }

      stream.addEventListener('open', onOpen as EventListener)
      stream.addEventListener('stream_ready', onReady as EventListener)
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
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__mark">SF</span>
          <div>
            <strong>StackFlow</strong>
            <span>Project flow observability console</span>
          </div>
        </div>
        <div className="topbar__meta">
          <div>
            <span>Trace</span>
            <strong>{traceDetail?.traceId.slice(0, 8) ?? 'waiting'}</strong>
          </div>
          <div>
            <span>Result</span>
            <strong className={`status-text status-text--${(traceDetail?.resultStatus ?? 'SUCCESS').toLowerCase()}`}>
              {traceDetail?.resultStatus ?? 'IDLE'}
            </strong>
          </div>
          <div>
            <span>Stream</span>
            <strong>{streamStatus.toUpperCase()}</strong>
          </div>
          <div>
            <span>Events</span>
            <strong>{traceDetail?.events.length ?? 0}</strong>
          </div>
        </div>
      </header>

      <section className="workspace">
        <aside className="left-panel">
          <div className="panel-card panel-card--intro">
            <p className="eyebrow">StackFlow MVP</p>
            <h1>Run a request. Watch the failure node.</h1>
            <p>
              Spring Boot 프로젝트의 도메인, 요청 경로, 이벤트 로그를 한 화면에서 추적합니다.
            </p>
          </div>

          <div className="panel-card">
            <div className="panel-header">
              <div>
                <h2>Project map</h2>
                <p>현재 MVP가 인식하는 프로젝트 구성입니다.</p>
              </div>
            </div>
            <div className="project-summary__grid project-summary__grid--stacked">
              {PROJECT_FACTS.map((item) => (
                <article key={item.label} className="project-summary__item">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-header">
              <div>
                <h2>Domain</h2>
                <p>나중에 여러 도메인이 들어오면 이 영역에서 전환합니다.</p>
              </div>
            </div>
            <div className="domain-list">
              {DOMAINS.map((domain) => (
                <button
                  key={domain.id}
                  type="button"
                  className={`domain-item${selectedDomainId === domain.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedDomainId(domain.id)}
                >
                  <strong>{domain.name}</strong>
                  <span>{domain.description}</span>
                </button>
              ))}
            </div>
            <div className="layer-stack">
              {selectedDomain.layers.map((layer) => (
                <span key={layer}>{layer}</span>
              ))}
            </div>
            <div className="endpoint-list">
              {domainEndpoints.map((endpoint) => (
                <div key={endpoint} className="endpoint-item">
                  <span>Endpoint</span>
                  <strong>{endpoint}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-header">
              <div>
                <h2>Run request</h2>
                <p>{apiCatalog.length} APIs loaded from {catalogSource === 'analyzed' ? 'Spring mapping scan' : 'fallback catalog'}.</p>
              </div>
              <span className={`pill pill--${catalogSource === 'analyzed' ? 'success' : 'warning'}`}>{catalogSource}</span>
            </div>
            <div className="api-list">
              {apiCatalog.map((api) => (
                <button
                  key={api.id}
                  type="button"
                  className={`api-item${selectedApi.id === api.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedApiId(api.id)}
                >
                  <span className={`method-badge method-badge--${api.method.toLowerCase()}`}>{api.method}</span>
                  <div>
                    <strong>{api.label}</strong>
                    <span>{api.pathTemplate}</span>
                    <p>{api.description}</p>
                    <span className="api-item__handler">{api.controller}.{api.handler}</span>
                  </div>
                </button>
              ))}
            </div>
            {selectedApi.requiresProductId ? (
              <label className="field">
                <span>{selectedApi.source === 'analyzed' ? 'Path variable value' : 'Product ID'}</span>
                <input value={productId} onChange={(event) => setProductId(event.target.value)} />
              </label>
            ) : null}
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
              {requestState === 'loading' ? 'Streaming...' : `Run ${selectedApi.method} request`}
            </button>
            <p className="request-message">{requestMessage}</p>
          </div>

          <div className="panel-card">
            <div className="panel-header">
              <h2>Recent traces</h2>
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
            <div className="graph-head">
              <div>
                <span className="section-label">Flow canvas</span>
                <h2>Request flow graph</h2>
                <p>
                  {traceDetail
                    ? `${traceDetail.method} ${traceDetail.endpoint} · HTTP ${traceDetail.httpStatus || '-'}`
                    : `${selectedDomain.name} domain structure is ready. Run the first request to activate the live graph.`}
                </p>
              </div>
              <span className={`pill pill--inline pill--${streamStatus === 'completed' ? 'success' : streamStatus === 'streaming' ? 'loading' : streamStatus}`}>
                  {streamStatus.toUpperCase()}
                </span>
              </div>

            <div className="flow-route">
              {graph.states.map((state) => (
                <button
                  key={state.id}
                  type="button"
                  className={`route-step route-step--${state.status.toLowerCase()}${state.active ? ' is-active' : ''}${selectedNode?.id === state.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedNodeId(state.id)}
                >
                  <span>{state.label}</span>
                  <strong>{state.active ? `${state.durationMs}ms` : 'idle'}</strong>
                </button>
              ))}
            </div>

            <div className="graph-toolbar">
              <div>
                <span>{traceDetail?.events.length ?? 0} live events</span>
                <strong>{activeRoute.length > 0 ? activeRoute.map((state) => state.label).join(' -> ') : 'Run a request to activate the path'}</strong>
              </div>
              <div className="legend-strip" aria-label="Graph status legend">
                <span className="legend-chip legend-chip--success">success</span>
                <span className="legend-chip legend-chip--warning">warning</span>
                <span className="legend-chip legend-chip--error">error</span>
                <span className="legend-chip legend-chip--idle">idle</span>
              </div>
            </div>

            <div className="graph-surface">
              <div className="graph-lanes" aria-hidden="true">
                <span>client</span>
                <span>application</span>
                <span>cache</span>
                <span>data</span>
                <span>response</span>
              </div>
              <ReactFlow
                fitView
                fitViewOptions={{ padding: 0.16 }}
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
          <div className="panel-card panel-card--runtime">
            <div>
              <span className="section-label">Runtime</span>
              <strong>{latestEvent ? latestEvent.component : 'No event'}</strong>
              <p>{latestEvent ? latestEvent.eventType : 'Run a request to receive live events.'}</p>
            </div>
            <div className="runtime-meter">
              <span>{traceDetail ? `${traceDetail.durationMs}ms` : '0ms'}</span>
              <span>{activeNodeCount} active nodes</span>
            </div>
          </div>

          <div className="panel-card inspector-card">
            <div className="panel-header">
              <h2>Node detail</h2>
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

          <div className="panel-card timeline-card">
            <div className="panel-header">
              <div>
                <h2>Live event log</h2>
                <p>Latest event first. Click graph nodes for full detail.</p>
              </div>
              <span>{recentEvents.length}</span>
            </div>
            <div className="timeline-list">
            {recentEvents.length === 0 ? (
              <p className="empty-copy">No live event received yet.</p>
            ) : (
              recentEvents.map((event, index) => (
                <article key={event.eventId} className="timeline-item">
                  <div className="timeline-item__marker">
                    <span>{index + 1}</span>
                  </div>
                  <div className="timeline-item__body">
                    <header>
                      <strong>{event.component}</strong>
                      <span className={`pill pill--inline pill--${event.status.toLowerCase()}`}>{event.status}</span>
                    </header>
                    <p>{event.eventType}</p>
                    <div className="timeline-item__meta">
                      <span>{event.durationMs}ms</span>
                      <span>{new Date(event.startedAt).toLocaleTimeString()}</span>
                      <span>{event.errorType ?? 'no error'}</span>
                    </div>
                  </div>
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

function toApiDefinition(item: ApiCatalogItem): ApiDefinition {
  return {
    id: item.id,
    method: item.method,
    label: humanizeHandler(item.handler),
    pathTemplate: item.path,
    description: `Detected from ${item.controller}.${item.handler}.`,
    requiresProductId: item.requiresPathVariable,
    controller: item.controller,
    handler: item.handler,
    source: 'analyzed',
    buildPath: (productId) => buildPathFromTemplate(item.path, productId),
  }
}

function buildPathFromTemplate(pathTemplate: string, pathVariableValue: string) {
  return pathTemplate.replaceAll(/\{[^}/]+}/g, encodeURIComponent(pathVariableValue))
}

function humanizeHandler(handler: string) {
  return handler
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (first) => first.toUpperCase())
}

function createPlaceholderTrace(traceId: string, method: string, endpoint: string, scenario: string): TraceDetail {
  const now = new Date().toISOString()
  return {
    traceId,
    method,
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

function buildRequestMessage(resultStatus: EventStatus, payload: ProductPayload) {
  if (payload.errorMessage) {
    return `${resultStatus}: ${payload.errorMessage}`
  }

  if (payload.cacheStatus) {
    return `${resultStatus}: product flow captured with cache ${payload.cacheStatus}.`
  }

  return `${resultStatus}: request captured successfully.`
}

export default App
