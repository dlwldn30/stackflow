import type {
  TraceCollectionStatusEvent,
  TraceEvent,
  TraceStartedEvent,
  TraceStreamTimeoutEvent,
  TraceTerminalEvent,
} from '../types/trace'

type TraceTerminalStatus = 'completed' | 'error'

export interface TraceStreamHandlers {
  onStarted: (event: TraceStartedEvent) => void
  onTraceEvent: (event: TraceEvent) => void
  onCollectionStatus: (event: TraceCollectionStatusEvent) => void
  onTerminal: (event: TraceTerminalEvent, status: TraceTerminalStatus) => void
  onConnectionTimeout: (event: TraceStreamTimeoutEvent) => void
  onDisconnected: () => void
}

export function connectTraceStream(traceId: string, handlers: TraceStreamHandlers) {
  let terminalReceived = false
  let connectionTimedOut = false

  return new Promise<EventSource>((resolve, reject) => {
    const stream = new EventSource(`/api/traces/${traceId}/stream`)
    let opened = false
    let resolved = false
    const fallbackTimer = window.setTimeout(() => {
      if (!resolved && stream.readyState !== EventSource.CLOSED) {
        resolved = true
        opened = true
        resolve(stream)
      }
    }, 1_500)

    const finalizeResolve = () => {
      if (resolved) return
      resolved = true
      opened = true
      window.clearTimeout(fallbackTimer)
      resolve(stream)
    }

    const finalizeReject = (error: Error) => {
      if (resolved) return
      resolved = true
      window.clearTimeout(fallbackTimer)
      reject(error)
    }

    stream.addEventListener('open', finalizeResolve as EventListener)
    stream.addEventListener('stream_ready', finalizeResolve as EventListener)
    stream.addEventListener('trace_started', ((event: Event) => {
      handlers.onStarted(parseEvent<TraceStartedEvent>(event))
    }) as EventListener)
    stream.addEventListener('trace_event', ((event: Event) => {
      handlers.onTraceEvent(parseEvent<TraceEvent>(event))
    }) as EventListener)
    stream.addEventListener('trace_collection_status', ((event: Event) => {
      const payload = parseEvent<TraceCollectionStatusEvent>(event)
      if (payload.status === 'TIMED_OUT') terminalReceived = true
      handlers.onCollectionStatus(payload)
    }) as EventListener)
    stream.addEventListener('trace_completed', ((event: Event) => {
      terminalReceived = true
      handlers.onTerminal(parseEvent<TraceTerminalEvent>(event), 'completed')
    }) as EventListener)
    stream.addEventListener('trace_failed', ((event: Event) => {
      terminalReceived = true
      handlers.onTerminal(parseEvent<TraceTerminalEvent>(event), 'error')
    }) as EventListener)
    stream.addEventListener('stream_timeout', ((event: Event) => {
      connectionTimedOut = true
      handlers.onConnectionTimeout(parseEvent<TraceStreamTimeoutEvent>(event))
      stream.close()
    }) as EventListener)
    stream.addEventListener('error', (() => {
      stream.close()
      if (terminalReceived || connectionTimedOut) return
      if (!opened) {
        finalizeReject(new Error('실시간 연결을 열지 못했습니다. 세션이 만료됐거나 backend에 연결할 수 없습니다.'))
        return
      }
      handlers.onDisconnected()
    }) as EventListener)
  })
}

function parseEvent<T>(event: Event) {
  return JSON.parse((event as MessageEvent<string>).data) as T
}
