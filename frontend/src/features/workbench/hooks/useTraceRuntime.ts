import { useCallback, useEffect, useRef, useState } from 'react'
import type { TraceCollectionStatus, TraceDetail, TraceSummary } from '../../../types/trace'
import type { StreamStatus } from '../../../ui/copy'
import type { ActionFields, StateFields, TraceViewTab } from '../types'
import type { TraceHistoryFilter } from '../traceModel'

export function useTraceRuntime() {
  const [traceDetail, setTraceDetail] = useState<TraceDetail | null>(null)
  const [recentTraces, setRecentTraces] = useState<TraceSummary[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [traceViewTab, setTraceViewTab] = useState<TraceViewTab>('timeline')
  const [traceHistoryFilter, setTraceHistoryFilter] = useState<TraceHistoryFilter>('all')
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle')
  const [traceCollectionStatus, setTraceCollectionStatus] = useState<TraceCollectionStatus>('DISABLED')
  const activeStreamRef = useRef<EventSource | null>(null)
  const activeRunIdRef = useRef(0)

  const closeActiveStream = useCallback(() => {
    activeStreamRef.current?.close()
    activeStreamRef.current = null
  }, [])

  const resetTraceRuntime = useCallback(() => {
    closeActiveStream()
    setTraceDetail(null)
    setSelectedNodeId(null)
    setStreamStatus('idle')
    setTraceCollectionStatus('DISABLED')
  }, [closeActiveStream])

  useEffect(() => closeActiveStream, [closeActiveStream])

  return {
    traceDetail, setTraceDetail,
    recentTraces, setRecentTraces,
    selectedNodeId, setSelectedNodeId,
    traceViewTab, setTraceViewTab,
    traceHistoryFilter, setTraceHistoryFilter,
    streamStatus, setStreamStatus,
    traceCollectionStatus, setTraceCollectionStatus,
    activeStreamRef,
    activeRunIdRef,
    closeActiveStream,
    resetTraceRuntime,
  }
}

export type TraceRuntimeModel = ReturnType<typeof useTraceRuntime>
export type TraceRuntimeActions = ActionFields<TraceRuntimeModel>
export type TraceRuntimeState = StateFields<TraceRuntimeModel>
