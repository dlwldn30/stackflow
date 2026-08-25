import { startTransition, useCallback } from 'react'
import { createTraceSession, executeExternalRequest } from '../../../api/stackflow'
import { getPrimaryFailureEvent } from '../../../lib/waterfall'
import type { HttpMethod, ProductPayload } from '../../../types/trace'
import type { ViewMode } from '../../../ui/copy'
import {
  buildExternalRequestMessage,
  buildExternalTargetPreview,
  buildRequestMessage,
  parseResponseBody,
  toEnabledEntries,
} from '../requestModel'
import { upsertRecentTrace } from '../traceModel'
import type { ApiDefinition, ExternalRequestSnapshot } from '../types'
import { createPlaceholderTrace, fetchTraceWithRetry, getApiMethodLabel } from '../workbenchModel'
import type { ProjectWorkspaceModel } from './useProjectWorkspace'
import type { RequestExecutionModel } from './useRequestExecution'
import type { TraceActions } from './useTraceActions'
import type { TraceRuntimeModel } from './useTraceRuntime'
import type { WorkbenchRunLifecycle } from './useWorkbenchRunLifecycle'

type RequestActionsOptions = {
  project: ProjectWorkspaceModel
  request: RequestExecutionModel
  runtime: TraceRuntimeModel
  traceActions: TraceActions
  lifecycle: WorkbenchRunLifecycle
  selectedApi: ApiDefinition
  hasDetectedApis: boolean
  runtimeSupported: boolean
  externalRunnable: boolean
  analyzeOnly: boolean
  externalTraceConfigured: boolean
  setActiveView: (view: ViewMode) => void
}

export function useRequestActions(options: RequestActionsOptions) {
  const {
    project, request, runtime, traceActions, lifecycle, selectedApi,
    hasDetectedApis, runtimeSupported, externalRunnable, analyzeOnly,
    externalTraceConfigured, setActiveView,
  } = options
  const methodLabel = getApiMethodLabel(selectedApi)
  const externalPath = selectedApi.buildPath(request.productId)
  const externalTargetPreview = buildExternalTargetPreview(request.targetBaseUrl, externalPath, request.queryParams)
  const bodyAllowed = selectedApi.methodSpecified && ['POST', 'PUT', 'PATCH'].includes(selectedApi.method)

  const selectApi = useCallback((api: ApiDefinition) => {
    if (api.id !== selectedApi.id) {
      lifecycle.invalidateActiveRun()
      runtime.setTraceDetail(null)
      runtime.setSelectedNodeId(null)
      runtime.setStreamStatus('idle')
      runtime.setTraceCollectionStatus('DISABLED')
      request.setExternalResponse(null)
      request.setExternalRequestSnapshot(null)
      request.setLastResponseBody(null)
      request.setRequestState('idle')
      request.setRequestMessage('선택한 API의 요청을 작성하세요.')
    }
    project.setSelectedApiId(api.id)
    project.setSelectedDomainId(api.domainId)
    setActiveView('api')
  }, [lifecycle, project, request, runtime, selectedApi.id, setActiveView])

  const runExternalRequest = useCallback(async () => {
    if (!externalRunnable) {
      setActiveView('api')
      request.setRequestState('error')
      runtime.setStreamStatus('idle')
      request.setRequestMessage(selectedApi.methodSpecified
        ? '이 샘플 API는 정적 분석만 제공합니다. Product API를 선택하면 샘플 Trace를 실행할 수 있습니다.'
        : 'endpoint의 HTTP method가 명시되지 않았습니다. 소스에서 method를 확인한 뒤 요청하세요.')
      return
    }

    const normalizedTargetBaseUrl = request.targetBaseUrl.trim()
    const requestMethod = selectedApi.method as HttpMethod
    if (!normalizedTargetBaseUrl) {
      setActiveView('api')
      request.setRequestState('error')
      runtime.setStreamStatus('idle')
      request.setRequestMessage('외부 API를 요청하려면 대상 기본 URL을 입력하세요.')
      return
    }

    lifecycle.invalidateActiveRun()
    const runId = runtime.activeRunIdRef.current
    setActiveView('api')
    request.setRequestState('loading')
    runtime.setStreamStatus('idle')
    runtime.setTraceCollectionStatus(externalTraceConfigured ? 'PENDING' : 'DISABLED')
    runtime.setTraceDetail(null)
    runtime.setSelectedNodeId(null)
    request.setLastResponseBody(null)
    request.setExternalResponse(null)
    request.setExternalRequestSnapshot(null)
    request.setRequestBodyError(null)

    const nextRequestBody = bodyAllowed ? request.requestBody.trim() : ''
    if (nextRequestBody) {
      try {
        JSON.parse(nextRequestBody)
      } catch {
        request.setRequestState('error')
        request.setRequestBodyError('요청 본문은 올바른 JSON 형식이어야 합니다.')
        request.setRequestMessage('JSON 요청 본문을 수정한 뒤 다시 실행하세요.')
        return
      }
    }

    const requestSnapshot: ExternalRequestSnapshot = {
      method: requestMethod,
      targetUrl: externalTargetPreview,
      queryParams: request.queryParams,
      headers: request.requestHeaders,
      requestBody: nextRequestBody,
    }
    request.setRequestMessage(`${methodLabel} ${externalTargetPreview} 요청 중...`)
    const abortController = request.beginExternalRequest()
    try {
      const payload = await executeExternalRequest({
        targetBaseUrl: normalizedTargetBaseUrl,
        method: requestMethod,
        path: externalPath,
        queryParams: toEnabledEntries(request.queryParams),
        headers: toEnabledEntries(request.requestHeaders),
        requestBody: nextRequestBody || null,
        captureTrace: externalTraceConfigured,
      }, abortController.signal)
      request.completeExternalRequest(abortController)
      if (!lifecycle.isCurrentRun(runId)) return
      request.setExternalResponse(payload)
      request.setLastResponseBody(parseResponseBody(payload.responseBody))
      request.setExternalRequestSnapshot(requestSnapshot)
      request.setRequestState(payload.resultStatus === 'SUCCESS' ? 'idle' : 'error')
      runtime.setTraceCollectionStatus(payload.traceCollectionStatus)
      request.setRequestMessage(buildExternalRequestMessage(payload))

      if (payload.traceId) {
        const traceId = payload.traceId
        runtime.setTraceDetail(createPlaceholderTrace(
          traceId,
          methodLabel,
          externalPath,
          'external-opentelemetry',
          'OPENTELEMETRY',
          project.instrumentationProfile?.serviceName ?? project.projectStructure.projectName,
        ))
        runtime.setStreamStatus('connecting')
        setActiveView('runtime')
        request.setRequestMessage('외부 요청은 완료됐습니다. OpenTelemetry span을 기다리고 있습니다...')
        try {
          const stream = await traceActions.openTraceStream(traceId, runId)
          if (!lifecycle.isCurrentRun(runId)) {
            stream.close()
            return
          }
          runtime.activeStreamRef.current = stream
        } catch (error) {
          if (!lifecycle.isCurrentRun(runId)) return
          runtime.setStreamStatus('error')
          request.setRequestMessage(`${error instanceof Error ? error.message : '실시간 연결 실패'} Agent와 수집 주소를 확인하세요.`)
        }
      }
    } catch (error) {
      request.completeExternalRequest(abortController)
      if (!lifecycle.isCurrentRun(runId) || error instanceof Error && error.name === 'AbortError') return
      request.setRequestState('error')
      request.setRequestMessage(error instanceof Error ? error.message : '외부 API 요청 중 오류가 발생했습니다.')
    }
  }, [bodyAllowed, externalPath, externalRunnable, externalTargetPreview, externalTraceConfigured, lifecycle, methodLabel, project, request, runtime, selectedApi, setActiveView, traceActions])

  const runRequest = useCallback(async () => {
    if (!hasDetectedApis) {
      setActiveView('project')
      request.setRequestState('error')
      runtime.setStreamStatus('idle')
      request.setRequestMessage('현재 분석 결과에는 실행할 REST API가 없습니다.')
      return
    }
    if (analyzeOnly) {
      setActiveView('api')
      request.setRequestState('error')
      runtime.setStreamStatus('idle')
      request.setRequestMessage(selectedApi.methodSpecified
        ? '이 API는 정적 분석만 가능합니다. Product API를 선택하면 실제 Trace를 확인할 수 있습니다.'
        : '정적 분석에서 endpoint는 찾았지만 HTTP method가 명시되지 않았습니다. 소스에서 method를 먼저 확인하세요.')
      return
    }
    if (!runtimeSupported) {
      await runExternalRequest()
      return
    }

    lifecycle.invalidateActiveRun()
    const runId = runtime.activeRunIdRef.current
    const requestMethod = selectedApi.method as HttpMethod
    request.setRequestState('loading')
    runtime.setStreamStatus('connecting')
    setActiveView('runtime')
    request.setRequestMessage('Trace 세션을 만들고 실시간 연결을 여는 중입니다...')
    request.setLastResponseBody(null)
    request.setExternalResponse(null)
    try {
      const session = await createTraceSession()
      const traceId = session.traceId
      const endpoint = selectedApi.buildPath(request.productId)
      startTransition(() => {
        runtime.setTraceDetail(createPlaceholderTrace(traceId, methodLabel, endpoint, request.scenario))
        runtime.setSelectedNodeId(null)
      })
      try {
        const stream = await traceActions.openTraceStream(traceId, runId)
        if (!lifecycle.isCurrentRun(runId)) {
          stream.close()
          return
        }
        runtime.activeStreamRef.current = stream
        runtime.setStreamStatus('streaming')
        request.setRequestMessage('실시간 연결이 열렸습니다. API 요청을 실행합니다...')
      } catch (error) {
        if (!lifecycle.isCurrentRun(runId)) return
        runtime.setStreamStatus('error')
        request.setRequestMessage(`${error instanceof Error ? error.message : '실시간 연결 실패'} 요청 후 최종 Trace를 불러옵니다...`)
      }

      const search = new URLSearchParams({ traceId })
      if (request.scenario !== 'normal') search.set('scenario', request.scenario)
      const response = await fetch(`${endpoint}?${search.toString()}`, { method: requestMethod })
      const payload = (await response.json()) as ProductPayload
      if (!lifecycle.isCurrentRun(runId)) return
      request.setLastResponseBody(payload)
      if (!payload.traceId) throw new Error('응답에서 Trace ID를 받지 못했습니다.')
      const finalTrace = await fetchTraceWithRetry(payload.traceId)
      if (!lifecycle.isCurrentRun(runId)) return
      startTransition(() => {
        runtime.setTraceDetail(finalTrace)
        const failureEvent = getPrimaryFailureEvent(finalTrace.events)
        runtime.setSelectedNodeId(
          failureEvent?.spanId
            ?? failureEvent?.component
            ?? finalTrace.events.at(-1)?.spanId
            ?? finalTrace.events.at(-1)?.component
            ?? null,
        )
        request.setRequestState(response.ok ? 'idle' : 'error')
        runtime.setStreamStatus(response.ok ? 'completed' : 'error')
        request.setRequestMessage(buildRequestMessage(finalTrace.resultStatus, payload))
        runtime.setRecentTraces((current) => upsertRecentTrace(current, {
          traceId: finalTrace.traceId,
          endpoint: finalTrace.endpoint,
          scenario: finalTrace.scenario,
          resultStatus: finalTrace.resultStatus,
          httpStatus: finalTrace.httpStatus,
          durationMs: finalTrace.durationMs,
          startedAt: finalTrace.startedAt,
          traceCollectionStatus: finalTrace.traceCollectionStatus,
        }))
      })
    } catch (error) {
      if (!lifecycle.isCurrentRun(runId)) return
      request.setRequestState('error')
      runtime.setStreamStatus('error')
      request.setRequestMessage(error instanceof Error ? error.message : '요청 실행 중 오류가 발생했습니다.')
    }
  }, [analyzeOnly, hasDetectedApis, lifecycle, methodLabel, request, runExternalRequest, runtime, runtimeSupported, selectedApi, setActiveView, traceActions])

  return {
    selectApi,
    runRequest,
    runExternalRequest,
    externalPath,
    externalTargetPreview,
    bodyAllowed,
  }
}

export type RequestActions = ReturnType<typeof useRequestActions>
