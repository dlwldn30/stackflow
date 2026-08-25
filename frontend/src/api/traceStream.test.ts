import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectTraceStream, TRACE_STREAM_CONNECT_TIMEOUT_MS, type TraceStreamHandlers } from './traceStream'

describe('Trace EventSource client', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not resolve before open or stream_ready', async () => {
    vi.useFakeTimers()
    const connection = connectTraceStream('trace-pending', createHandlers())
    const stream = MockEventSource.instances[0]
    let resolved = false
    void connection.then(() => { resolved = true })

    await vi.advanceTimersByTimeAsync(1_500)
    expect(resolved).toBe(false)

    stream.dispatch('stream_ready', { traceId: 'trace-pending' })
    await expect(connection).resolves.toBe(stream)
  })

  it('rejects and closes the stream after five seconds without connection evidence', async () => {
    vi.useFakeTimers()
    const connection = connectTraceStream('trace-timeout', createHandlers())
    const stream = MockEventSource.instances[0]
    const rejection = expect(connection).rejects.toThrow('실시간 연결 실패')

    await vi.advanceTimersByTimeAsync(TRACE_STREAM_CONNECT_TIMEOUT_MS)

    await rejection
    expect(stream.closed).toBe(true)
  })

  it('reports a server connection timeout without treating the following error as a disconnect', async () => {
    const handlers = createHandlers()
    const connection = connectTraceStream('trace-1', handlers)
    const stream = MockEventSource.instances[0]
    stream.dispatch('open')
    await connection

    stream.dispatch('stream_timeout', {
      traceId: 'trace-1',
      timestamp: '2026-08-24T00:00:30Z',
      message: '실시간 연결 시간이 만료되었습니다.',
    })
    stream.dispatch('error')

    expect(handlers.onConnectionTimeout).toHaveBeenCalledOnce()
    expect(handlers.onDisconnected).not.toHaveBeenCalled()
    expect(stream.closed).toBe(true)
  })

  it('keeps collection timeout terminal when EventSource closes', async () => {
    const handlers = createHandlers()
    const connection = connectTraceStream('trace-2', handlers)
    const stream = MockEventSource.instances[0]
    stream.dispatch('open')
    await connection

    stream.dispatch('trace_collection_status', {
      traceId: 'trace-2',
      status: 'TIMED_OUT',
      message: '15초 동안 span을 받지 못했습니다.',
      timestamp: '2026-08-24T00:00:15Z',
    })
    stream.dispatch('error')

    expect(handlers.onCollectionStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'TIMED_OUT' }))
    expect(handlers.onDisconnected).not.toHaveBeenCalled()
  })

  it('does not overwrite a completed terminal event with a following EventSource error', async () => {
    const handlers = createHandlers()
    const connection = connectTraceStream('trace-complete', handlers)
    const stream = MockEventSource.instances[0]
    stream.dispatch('open')
    await connection

    stream.dispatch('trace_completed', {
      traceId: 'trace-complete',
      resultStatus: 'SUCCESS',
      httpStatus: 200,
      durationMs: 12,
      errorType: null,
      errorMessage: null,
      timestamp: '2026-08-24T00:00:12Z',
    })
    stream.dispatch('error')

    expect(handlers.onTerminal).toHaveBeenCalledWith(expect.objectContaining({ traceId: 'trace-complete' }), 'completed')
    expect(handlers.onDisconnected).not.toHaveBeenCalled()
  })

  it('distinguishes initial connection failure from a later disconnect', async () => {
    const initialHandlers = createHandlers()
    const initialConnection = connectTraceStream('missing', initialHandlers)
    MockEventSource.instances[0].dispatch('error')
    await expect(initialConnection).rejects.toThrow('세션이 만료됐거나 backend에 연결할 수 없습니다.')

    const connectedHandlers = createHandlers()
    const connected = connectTraceStream('trace-3', connectedHandlers)
    const connectedStream = MockEventSource.instances[1]
    connectedStream.dispatch('open')
    await connected
    connectedStream.dispatch('error')

    expect(connectedHandlers.onDisconnected).toHaveBeenCalledOnce()
  })
})

function createHandlers(): TraceStreamHandlers {
  return {
    onStarted: vi.fn(),
    onTraceEvent: vi.fn(),
    onCollectionStatus: vi.fn(),
    onTerminal: vi.fn(),
    onConnectionTimeout: vi.fn(),
    onDisconnected: vi.fn(),
  }
}

class MockEventSource {
  static CLOSED = 2
  static instances: MockEventSource[] = []

  readonly url: string
  readyState = 0
  closed = false
  private readonly listeners = new Map<string, EventListener[]>()

  constructor(url: string | URL) {
    this.url = url.toString()
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  close() {
    this.closed = true
    this.readyState = MockEventSource.CLOSED
  }

  dispatch(type: string, data?: unknown) {
    if (type === 'open') this.readyState = 1
    const event = data === undefined
      ? new Event(type)
      : new MessageEvent(type, { data: JSON.stringify(data) })
    this.listeners.get(type)?.forEach((listener) => listener(event))
  }
}
