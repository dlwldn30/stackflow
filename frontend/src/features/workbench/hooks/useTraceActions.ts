import { startTransition, useCallback } from 'react'
import { getRecentTraces } from '../../../api/stackflow'
import { connectTraceStream } from '../../../api/traceStream'
import { getPrimaryFailureEvent } from '../../../lib/waterfall'
import { matchesTraceEndpoint } from '../fixtures'
import { fetchTraceWithRetry } from '../workbenchModel'
import type { ProjectWorkspaceModel } from './useProjectWorkspace'
import type { RequestExecutionModel } from './useRequestExecution'
import type { TraceRuntimeModel } from './useTraceRuntime'
import type { WorkbenchRunLifecycle } from './useWorkbenchRunLifecycle'

type TraceActionsOptions = {
  project: ProjectWorkspaceModel
  request: RequestExecutionModel
  runtime: TraceRuntimeModel
  lifecycle: WorkbenchRunLifecycle
}

export function useTraceActions({ project, request, runtime, lifecycle }: TraceActionsOptions) {
  const loadRecentTraces = useCallback(async () => {
    try {
      const traces = await getRecentTraces()
      startTransition(() => runtime.setRecentTraces(traces))
    } catch {
      // Recent history is optional while the backend is starting.
    }
  }, [runtime])

  const applyFetchedTrace = useCallback((detail: Awaited<ReturnType<typeof fetchTraceWithRetry>>) => {
    runtime.setTraceDetail(detail)
    const failureEvent = getPrimaryFailureEvent(detail.events)
    runtime.setSelectedNodeId(
      failureEvent?.spanId
        ?? failureEvent?.component
        ?? detail.events[0]?.spanId
        ?? detail.events[0]?.component
        ?? null,
    )
  }, [runtime])

  const openTraceStream = useCallback(async (traceId: string, runId: number) =>
    connectTraceStream(traceId, {
      onStarted: (payload) => {
        if (!lifecycle.isCurrentRun(runId)) return
        startTransition(() => {
          runtime.setStreamStatus('streaming')
          runtime.setTraceDetail((current) => current?.traceId === payload.traceId
            ? {
                ...current,
                method: payload.method,
                endpoint: payload.endpoint,
                scenario: payload.scenario,
                startedAt: payload.timestamp,
              }
            : current)
          request.setRequestMessage('실행 이벤트를 수집하고 있습니다...')
        })
      },
      onTraceEvent: (payload) => {
        if (!lifecycle.isCurrentRun(runId)) return
        startTransition(() => runtime.setTraceDetail((current) => {
          if (!current || current.traceId !== payload.traceId) return current
          const duplicate = current.events.some((event) =>
            event.eventId === payload.eventId || Boolean(payload.spanId && event.spanId === payload.spanId),
          )
          return duplicate ? current : { ...current, events: [...current.events, payload], endedAt: payload.endedAt }
        }))
      },
      onCollectionStatus: (payload) => {
        if (!lifecycle.isCurrentRun(runId)) return
        runtime.setTraceCollectionStatus(payload.status)
        runtime.setTraceDetail((current) => current?.traceId === payload.traceId
          ? { ...current, traceCollectionStatus: payload.status }
          : current)
        if (payload.status === 'PENDING') runtime.setStreamStatus('connecting')
        if (payload.status === 'COLLECTING') runtime.setStreamStatus('streaming')
        if (payload.status === 'COMPLETED') runtime.setStreamStatus('completed')
        if (payload.status === 'TIMED_OUT') runtime.setStreamStatus('error')
        request.setRequestMessage(payload.message)
        if (payload.status === 'TIMED_OUT') {
          void fetchTraceWithRetry(payload.traceId).then((detail) => {
            if (!lifecycle.isCurrentRun(runId)) return
            applyFetchedTrace(detail)
            void loadRecentTraces()
          }).catch(() => undefined)
        }
      },
      onTerminal: (payload, nextStatus) => {
        if (!lifecycle.isCurrentRun(runId)) return
        startTransition(() => {
          runtime.setStreamStatus(nextStatus)
          runtime.setTraceDetail((current) => current?.traceId === payload.traceId
            ? {
                ...current,
                endedAt: payload.timestamp,
                durationMs: payload.durationMs,
                httpStatus: payload.httpStatus,
                resultStatus: payload.resultStatus,
                traceCollectionStatus: current.source === 'OPENTELEMETRY'
                  ? 'COMPLETED'
                  : current.traceCollectionStatus,
              }
            : current)
          request.setRequestMessage(nextStatus === 'completed'
            ? 'Trace 수집이 완료됐습니다. 상세 결과를 정리합니다...'
            : `${payload.errorType ?? '알 수 없는 지점'}에서 Trace가 실패했습니다. 상세 결과를 정리합니다...`)
        })
        void fetchTraceWithRetry(payload.traceId).then((detail) => {
          if (!lifecycle.isCurrentRun(runId)) return
          applyFetchedTrace(detail)
          void loadRecentTraces()
        }).catch(() => undefined)
      },
      onConnectionTimeout: (payload) => {
        if (!lifecycle.isCurrentRun(runId)) return
        startTransition(() => {
          runtime.setStreamStatus('connection_timeout')
          request.setRequestMessage(`${payload.message} Trace 수집 시간 초과와는 별개입니다.`)
        })
      },
      onDisconnected: () => {
        if (!lifecycle.isCurrentRun(runId)) return
        startTransition(() => {
          runtime.setStreamStatus('error')
          request.setRequestMessage('실시간 연결 종료: 요청 결과는 최근 Trace에서 다시 확인하세요.')
        })
      },
    }), [applyFetchedTrace, lifecycle, loadRecentTraces, request, runtime])

  const selectTrace = useCallback(async (traceId: string) => {
    lifecycle.invalidateActiveRun()
    const runId = runtime.activeRunIdRef.current
    const detail = await fetchTraceWithRetry(traceId)
    if (!lifecycle.isCurrentRun(runId)) return
    const matchingApi = project.apiCatalog.find((api) => matchesTraceEndpoint(api, detail))
    startTransition(() => {
      runtime.setTraceDetail(detail)
      runtime.setSelectedNodeId(null)
      runtime.setTraceCollectionStatus(detail.traceCollectionStatus)
      if (matchingApi) {
        project.setSelectedApiId(matchingApi.id)
        project.setSelectedDomainId(matchingApi.domainId)
      }
      request.setLastResponseBody(null)
      runtime.setStreamStatus('idle')
      request.setRequestState('idle')
      request.setRequestMessage(`기록에서 Trace ${detail.traceId.slice(0, 8)}를 불러왔습니다.`)
    })
  }, [lifecycle, project, request, runtime])

  return { loadRecentTraces, openTraceStream, selectTrace }
}

export type TraceActions = ReturnType<typeof useTraceActions>
