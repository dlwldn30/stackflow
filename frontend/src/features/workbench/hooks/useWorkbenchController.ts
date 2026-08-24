import { startTransition, useEffect, useMemo, useState } from 'react'
import { analyzeProject, createInstrumentationProfile, createTraceSession, executeExternalRequest, getProjectStructure, getRecentTraces, selectProjectFolder } from '../../../api/stackflow'
import { connectTraceStream } from '../../../api/traceStream'
import { buildGraph, getNodeDetail } from '../../../lib/graph'
import { buildWaterfall, getPrimaryFailureEvent } from '../../../lib/waterfall'
import type { HttpMethod, ProductPayload, ProjectDomain, ProjectStructure } from '../../../types/trace'
import { EVENT_STATUS_LABEL, STREAM_STATUS_LABEL, TRACE_COLLECTION_STATUS_LABEL } from '../../../ui/copy'
import type { ViewMode } from '../../../ui/copy'
import { useProjectWorkspace } from './useProjectWorkspace'
import { useRequestExecution } from './useRequestExecution'
import { useTraceRuntime } from './useTraceRuntime'
import type { ApiDefinition, ExternalRequestSnapshot } from '../types'
import { EMPTY_API_DEFINITION, EMPTY_DOMAIN, FALLBACK_API_CATALOG, FALLBACK_PROJECT_STRUCTURE, PROJECT_STATUS_CONTENT, matchesTraceEndpoint } from '../fixtures'
import { buildExternalRequestMessage, buildExternalTargetPreview, buildRequestMessage, createRequestEntry, filterApis, formatResponseBody, parseResponseBody, toEnabledEntries } from '../requestModel'
import { buildCommonProjectLayers, buildDomainStructurePath, buildEstimatedFlow, buildProjectMetrics, compareEstimatedAndActualFlow, createPlaceholderTrace, fetchTraceWithRetry, flattenProjectApis, getApiMethodBadgeClassName, getApiMethodLabel, getDomainDisplayMode, groupProjectLayers, isConcreteMethodApi, isStackFlowRuntimeApi } from '../workbenchModel'

export function useWorkbenchController() {
  const [activeView, setActiveView] = useState<ViewMode>('project')
  const project = useProjectWorkspace(FALLBACK_PROJECT_STRUCTURE, FALLBACK_API_CATALOG)
  const request = useRequestExecution(createRequestEntry)
  const runtime = useTraceRuntime()
  const {
    projectPath, setProjectPath, folderPickerState, setFolderPickerState,
    folderPickerMessage, setFolderPickerMessage, apiCatalog, setApiCatalog,
    projectStructure, setProjectStructure, setCatalogSource,
    analysisTarget, setAnalysisTarget, analysisState, setAnalysisState,
    analysisMessage, setAnalysisMessage, selectedApiId, setSelectedApiId,
    selectedDomainId, setSelectedDomainId, apiScope, setApiScope,
    agentPath, setAgentPath, collectorBaseUrl, setCollectorBaseUrl,
    instrumentationProfile, setInstrumentationProfile, profileState, setProfileState,
    profileMessage, setProfileMessage, instrumentationStatus, resetInstrumentationProfile,
  } = project
  const {
    productId, setProductId, targetBaseUrl, setTargetBaseUrl,
    endpointSearch, setEndpointSearch,
    queryParams, requestHeaders,
    requestBody, setRequestBody, requestBodyError, setRequestBodyError,
    externalRequestSnapshot, setExternalRequestSnapshot, scenario, setScenario,
    requestOptionTab, setRequestOptionTab, requestState, setRequestState,
    requestMessage, setRequestMessage, lastResponseBody, setLastResponseBody,
    externalResponse, setExternalResponse, updateQueryParam, updateRequestHeader,
    removeQueryParam, removeRequestHeader, addQueryParam, addRequestHeader,
    resetForExternalProject, resetForSampleProject,
  } = request
  const {
    traceDetail, setTraceDetail, recentTraces, setRecentTraces,
    selectedNodeId, setSelectedNodeId, traceViewTab, setTraceViewTab,
    streamStatus, setStreamStatus, traceCollectionStatus, setTraceCollectionStatus,
    activeStreamRef, activeRunIdRef, flowInstanceRef, closeActiveStream, resetTraceRuntime,
  } = runtime

  const graph = buildGraph(traceDetail)
  const waterfall = buildWaterfall(traceDetail?.events ?? [])
  const orderedTraceEvents = [...(traceDetail?.events ?? [])].sort((left, right) =>
    Date.parse(left.startedAt) - Date.parse(right.startedAt),
  )
  const primaryFailureEvent = getPrimaryFailureEvent(traceDetail?.events ?? [])
  const primaryFailureNodeId = primaryFailureEvent?.spanId ?? primaryFailureEvent?.component ?? null
  const selectedNode = getNodeDetail(
    graph.states,
    selectedNodeId ?? primaryFailureNodeId ?? graph.states.find((state) => state.active)?.id ?? null,
  )
  const activeNodeCount = graph.states.filter((state) => state.active).length
  const latestEvent = traceDetail?.events.at(-1) ?? null
  const inspectorEvent = primaryFailureEvent ?? latestEvent
  const primaryFailureLabel = graph.states.find((state) => state.id === primaryFailureNodeId)?.label
    ?? primaryFailureEvent?.component
    ?? null
  const selectedDomain = projectStructure.domains.find((domain) => domain.id === selectedDomainId) ?? projectStructure.domains[0] ?? EMPTY_DOMAIN
  const hasDetectedDomains = projectStructure.domains.length > 0
  const hasDetectedApis = apiCatalog.length > 0
  const domainApis = apiCatalog.filter((api) => api.domainId === selectedDomain.id)
  const scopedApis = apiScope === 'all' ? apiCatalog : domainApis
  const visibleApis = filterApis(scopedApis, endpointSearch)
  const selectedApi = scopedApis.find((api) => api.id === selectedApiId) ?? scopedApis[0] ?? EMPTY_API_DEFINITION
  const projectMetrics = buildProjectMetrics(projectStructure)
  const domainLayerGroups = groupProjectLayers(selectedDomain.layers)
  const domainStructurePath = buildDomainStructurePath(domainLayerGroups, selectedDomain.infrastructure)
  const supportingDomainGroups = domainLayerGroups.filter((group) =>
    (group.id === 'model' || group.id === 'support') && group.classes.length > 0,
  )
  const commonLayerGroups = groupProjectLayers(buildCommonProjectLayers(projectStructure))
  const commonClassCount = commonLayerGroups.reduce((sum, group) => sum + group.classes.length, 0)
  const activeRoute = graph.states.filter((state) => state.active)
  const estimatedFlow = hasDetectedApis ? buildEstimatedFlow(selectedApi, selectedDomain) : []
  const traceComparison = traceDetail?.source === 'OPENTELEMETRY'
    ? compareEstimatedAndActualFlow(estimatedFlow, traceDetail.events)
    : null
  const hasConcreteMethod = hasDetectedApis && isConcreteMethodApi(selectedApi)
  const runtimeSupported = hasDetectedApis && hasConcreteMethod && analysisTarget === 'sample' && isStackFlowRuntimeApi(selectedApi)
  const externalRunnable = hasDetectedApis && hasConcreteMethod && analysisTarget === 'external'
  const analyzeOnly = hasDetectedApis && !runtimeSupported && !externalRunnable
  const projectStatusContent = PROJECT_STATUS_CONTENT[projectStructure.analysisStatus]
  const selectedDomainDisplayMode = getDomainDisplayMode(selectedDomain, analysisTarget === 'sample')
  const hasIntegrationBoundary = selectedDomainDisplayMode?.tone === 'integration'
  const demoTraceReady = import.meta.env.VITE_DEMO_TRACE_READY === 'true'
    && projectPath.trim() === import.meta.env.VITE_DEFAULT_PROJECT_PATH
  const externalTraceConfigured = analysisTarget === 'external' && (demoTraceReady || Boolean(instrumentationProfile))
  const externalTraceVerified = analysisTarget === 'external'
    && (demoTraceReady || instrumentationStatus.status?.connectionStatus === 'SPAN_RECEIVED')
  const instrumentationCommand = instrumentationProfile
    ? instrumentationProfile.commands[instrumentationProfile.buildTool.toLowerCase()]
      ?? instrumentationProfile.commands.jar
    : null
  const runtimeModeLabel = runtimeSupported
    ? '요청·Trace 가능'
    : externalRunnable
      ? externalTraceVerified
        ? '요청 후 Trace 확인'
        : externalTraceConfigured
          ? 'Trace 설정됨 · 확인 전'
          : '외부 API 요청'
      : '정적 분석만 가능'
  const traceDisplayStatus = streamStatus === 'connection_timeout'
    ? STREAM_STATUS_LABEL[streamStatus]
    : traceDetail?.source === 'OPENTELEMETRY' && streamStatus !== 'idle'
    ? TRACE_COLLECTION_STATUS_LABEL[traceCollectionStatus]
    : traceDetail
      ? EVENT_STATUS_LABEL[traceDetail.resultStatus]
      : STREAM_STATUS_LABEL[streamStatus]
  const traceDisplayTone = streamStatus === 'idle' && traceDetail
    ? traceDetail.resultStatus === 'SUCCESS'
      ? 'success'
      : traceDetail.resultStatus === 'WARNING'
        ? 'warning'
        : 'error'
    : streamStatus === 'completed'
      ? 'success'
    : streamStatus === 'error'
      ? 'error'
      : streamStatus === 'connection_timeout'
        ? 'warning'
      : streamStatus === 'idle'
          ? 'neutral'
          : 'info'
  const currentResultStatus = externalResponse?.resultStatus ?? traceDetail?.resultStatus ?? 'IDLE'
  const externalPath = selectedApi.buildPath(productId)
  const externalTargetPreview = buildExternalTargetPreview(targetBaseUrl, externalPath, queryParams)
  const bodyAllowed = hasConcreteMethod && ['POST', 'PUT', 'PATCH'].includes(selectedApi.method)
  const selectedApiMethodLabel = getApiMethodLabel(selectedApi)
  const selectedApiMethodClassName = getApiMethodBadgeClassName(selectedApi)
  const graphFitKey = `${traceDetail?.traceId ?? 'empty'}-${traceDetail?.events.length ?? 0}`
  const recentEvents = useMemo(() => {
    return traceDetail?.events.slice(0, 8) ?? []
  }, [traceDetail])

  const formattedResponseBody = useMemo(() => {
    if (!lastResponseBody) {
      return null
    }

    return JSON.stringify(lastResponseBody, null, 2)
  }, [lastResponseBody])

  const formattedExternalResponseBody = useMemo(() => {
    if (!externalResponse) {
      return null
    }

    return formatResponseBody(externalResponse.responseBody)
  }, [externalResponse])

  /* oxlint-disable react-hooks/exhaustive-deps -- Initial loading runs once; refs are stable and graph updates use graphFitKey. */
  useEffect(() => {
    void loadApiCatalog()
    void loadRecentTraces()
  }, [])

  useEffect(() => {
    if (!flowInstanceRef.current) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      flowInstanceRef.current?.fitView({ padding: 0.14, duration: 180, includeHiddenNodes: true })
    })
    const settledFit = window.setTimeout(() => {
      flowInstanceRef.current?.fitView({ padding: 0.14, duration: 0, includeHiddenNodes: true })
    }, 180)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(settledFit)
    }
  }, [graphFitKey])
  /* oxlint-enable react-hooks/exhaustive-deps */

  async function loadApiCatalog() {
    try {
      const defaultProjectPath = import.meta.env.VITE_DEFAULT_PROJECT_PATH
      const structure = defaultProjectPath
        ? await analyzeProject(defaultProjectPath)
        : await getProjectStructure()
      const analyzedCatalog = flattenProjectApis(structure)
      applyProjectStructure(
        structure,
        analyzedCatalog,
        structure.analysisMessage,
        defaultProjectPath ? 'external' : 'sample',
      )
    } catch {
      startTransition(() => {
        setProjectStructure(FALLBACK_PROJECT_STRUCTURE)
        setApiCatalog(FALLBACK_API_CATALOG)
        setCatalogSource('fallback')
        setAnalysisTarget('sample')
        setAnalysisMessage('샘플 프로젝트를 표시하고 있습니다. 직접 분석하려면 프로젝트 경로를 입력하세요.')
        setSelectedDomainId((current) =>
          FALLBACK_PROJECT_STRUCTURE.domains.some((domain) => domain.id === current)
            ? current
            : FALLBACK_PROJECT_STRUCTURE.domains[0].id,
        )
        setSelectedApiId((current) => FALLBACK_API_CATALOG.some((api) => api.id === current) ? current : FALLBACK_API_CATALOG[0].id)
      })
    }
  }

  async function analyzeProjectPath(pathOverride?: string) {
    const requestedPath = pathOverride ?? projectPath
    if (pathOverride === undefined && !requestedPath.trim()) {
      setAnalysisState('error')
      setAnalysisMessage('분석할 프로젝트 폴더를 선택하거나 절대 경로를 입력하세요. 데모는 별도 버튼으로 열 수 있습니다.')
      return
    }

    setAnalysisState('loading')
    setAnalysisMessage('프로젝트 파일과 Spring mapping을 읽고 있습니다...')
    const nextAnalysisTarget = requestedPath.trim() === '' ? 'sample' : 'external'

    try {
      const structure = await analyzeProject(requestedPath)
      const analyzedCatalog = flattenProjectApis(structure)
      applyProjectStructure(structure, analyzedCatalog, structure.analysisMessage, nextAnalysisTarget)
      setAnalysisState(structure.analysisStatus === 'FAILED' ? 'error' : 'idle')
      setActiveView('project')
    } catch (error) {
      setAnalysisState('error')
      setAnalysisMessage(error instanceof Error ? error.message : '프로젝트 분석에 실패했습니다.')
    }
  }

  async function selectLocalProjectFolder() {
    setFolderPickerState('loading')
    setFolderPickerMessage('폴더 선택창을 여는 중입니다...')

    try {
      const selection = await selectProjectFolder()
      if (!selection.supported) {
        setFolderPickerState('error')
        setFolderPickerMessage(selection.message)
        return
      }
      if (!selection.selected || !selection.projectPath) {
        setFolderPickerState('idle')
        setFolderPickerMessage(selection.message)
        return
      }

      setProjectPath(selection.projectPath)
      setFolderPickerState('idle')
      setFolderPickerMessage('선택한 경로가 입력되었습니다. 프로젝트 분석을 실행하세요.')
    } catch (error) {
      setFolderPickerState('error')
      setFolderPickerMessage(error instanceof Error ? error.message : '폴더 선택창을 열지 못했습니다.')
    }
  }

  function applyProjectStructure(
    structure: ProjectStructure,
    analyzedCatalog: ApiDefinition[],
    message: string,
    target: 'sample' | 'external',
  ) {
    if (target === 'external') {
      closeActiveStream()
    }

    startTransition(() => {
      setProjectStructure(structure)
      setApiCatalog(analyzedCatalog)
      setCatalogSource('analyzed')
      setAnalysisTarget(target)
      setApiScope(target === 'external' ? 'all' : 'domain')
      setAnalysisMessage(message)
      setSelectedDomainId((current) => structure.domains.some((domain) => domain.id === current) ? current : (structure.domains[0]?.id ?? EMPTY_DOMAIN.id))
      setSelectedApiId((current) => analyzedCatalog.some((api) => api.id === current) ? current : (analyzedCatalog[0]?.id ?? EMPTY_API_DEFINITION.id))
      if (target === 'external') {
        resetInstrumentationProfile()
        resetTraceRuntime()
        resetForExternalProject()
      }
      if (target === 'sample') {
        resetForSampleProject()
      }
    })
  }

  async function generateInstrumentationProfile() {
    if (analysisTarget !== 'external' || !projectPath.trim()) {
      setProfileState('error')
      setProfileMessage('먼저 외부 Spring 프로젝트 경로를 분석하세요.')
      return
    }

    setProfileState('loading')
    setProfileMessage('분석된 클래스와 public method로 Agent 실행 설정을 만들고 있습니다...')
    try {
      const profile = await createInstrumentationProfile({
        projectPath: projectPath.trim(),
        collectorBaseUrl: collectorBaseUrl.trim(),
        agentPath: agentPath.trim(),
      })
      setInstrumentationProfile(profile)
      setProfileState('idle')
      setProfileMessage('명령을 터미널에서 실행해 대상 앱을 Agent와 함께 재시작하세요.')
    } catch (error) {
      setProfileState('error')
      setProfileMessage(error instanceof Error ? error.message : '실행 Trace 설정 생성에 실패했습니다.')
    }
  }

  function selectDomain(domain: ProjectDomain) {
    if (domain.id === EMPTY_DOMAIN.id) {
      return
    }
    setSelectedDomainId(domain.id)
    setApiScope('domain')
    setActiveView('project')
    const nextApi = apiCatalog.find((api) => api.domainId === domain.id)
    if (nextApi) {
      setSelectedApiId(nextApi.id)
      setExternalResponse(null)
    }
  }

  function selectApi(api: ApiDefinition) {
    if (api.id !== selectedApi.id) {
      closeActiveStream()
      setTraceDetail(null)
      setSelectedNodeId(null)
      setStreamStatus('idle')
      setTraceCollectionStatus('DISABLED')
      setExternalResponse(null)
      setExternalRequestSnapshot(null)
      setLastResponseBody(null)
      setRequestState('idle')
      setRequestMessage('선택한 API의 요청을 작성하세요.')
    }
    setSelectedApiId(api.id)
    setSelectedDomainId(api.domainId)
    setActiveView('api')
  }

  async function loadRecentTraces() {
    try {
      const traces = await getRecentTraces()
      startTransition(() => setRecentTraces(traces))
    } catch {
      // Recent history is optional while the backend is starting.
    }
  }

  async function runRequest() {
    if (!hasDetectedApis) {
      setActiveView('project')
      setRequestState('error')
      setStreamStatus('idle')
      setRequestMessage('현재 분석 결과에는 실행할 REST API가 없습니다.')
      return
    }

    if (analyzeOnly) {
      setActiveView('api')
      setRequestState('error')
      setStreamStatus('idle')
      setRequestMessage(
        selectedApi.methodSpecified
          ? '이 API는 정적 분석만 가능합니다. Product API를 선택하면 실제 Trace를 확인할 수 있습니다.'
          : '정적 분석에서 endpoint는 찾았지만 HTTP method가 명시되지 않았습니다. 소스에서 method를 먼저 확인하세요.',
      )
      return
    }

    if (!runtimeSupported) {
      await runExternalRequest()
      return
    }

    const runId = activeRunIdRef.current + 1
    const requestMethod = selectedApi.method as HttpMethod
    activeRunIdRef.current = runId
    closeActiveStream()
    setRequestState('loading')
    setStreamStatus('connecting')
    setActiveView('runtime')
    setRequestMessage('Trace 세션을 만들고 실시간 연결을 여는 중입니다...')
    setLastResponseBody(null)
    setExternalResponse(null)

    try {
      const session = await createTraceSession()
      const traceId = session.traceId
      const endpoint = selectedApi.buildPath(productId)

      startTransition(() => {
        setTraceDetail(createPlaceholderTrace(traceId, selectedApiMethodLabel, endpoint, scenario))
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
        setRequestMessage('실시간 연결이 열렸습니다. API 요청을 실행합니다...')
      } catch {
        if (activeRunIdRef.current !== runId) {
          return
        }
        setStreamStatus('error')
        setRequestMessage('실시간 연결을 열지 못했습니다. 요청 후 최종 Trace를 불러옵니다...')
      }

      const search = new URLSearchParams({ traceId })
      if (scenario !== 'normal') {
        search.set('scenario', scenario)
      }

      const response = await fetch(`${endpoint}?${search.toString()}`, { method: requestMethod })
      const payload = (await response.json()) as ProductPayload

      if (activeRunIdRef.current !== runId) {
        return
      }

      setLastResponseBody(payload)

      if (!payload.traceId) {
        throw new Error('응답에서 Trace ID를 받지 못했습니다.')
      }

      const finalTrace = await fetchTraceWithRetry(payload.traceId)
      if (activeRunIdRef.current !== runId) {
        return
      }

      startTransition(() => {
        setTraceDetail(finalTrace)
        const failureEvent = getPrimaryFailureEvent(finalTrace.events)
        setSelectedNodeId(
          failureEvent?.spanId
            ?? failureEvent?.component
            ?? finalTrace.events.at(-1)?.spanId
            ?? finalTrace.events.at(-1)?.component
            ?? null,
        )
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
      setRequestMessage(error instanceof Error ? error.message : '요청 실행 중 오류가 발생했습니다.')
    }
  }

  async function runExternalRequest() {
    if (!externalRunnable) {
      setActiveView('api')
      setRequestState('error')
      setStreamStatus('idle')
      setRequestMessage(
        selectedApi.methodSpecified
          ? '이 샘플 API는 정적 분석만 제공합니다. Product API를 선택하면 샘플 Trace를 실행할 수 있습니다.'
          : 'endpoint의 HTTP method가 명시되지 않았습니다. 소스에서 method를 확인한 뒤 요청하세요.',
      )
      return
    }

    const normalizedTargetBaseUrl = targetBaseUrl.trim()
    const requestMethod = selectedApi.method as HttpMethod
    if (!normalizedTargetBaseUrl) {
      setActiveView('api')
      setRequestState('error')
      setStreamStatus('idle')
      setRequestMessage('외부 API를 요청하려면 대상 기본 URL을 입력하세요.')
      return
    }

    const captureTrace = externalTraceConfigured
    const runId = activeRunIdRef.current + 1
    activeRunIdRef.current = runId
    closeActiveStream()
    setActiveView('api')
    setRequestState('loading')
    setStreamStatus('idle')
    setTraceCollectionStatus(captureTrace ? 'PENDING' : 'DISABLED')
    setTraceDetail(null)
    setSelectedNodeId(null)
    setLastResponseBody(null)
    setExternalResponse(null)
    setExternalRequestSnapshot(null)
    setRequestBodyError(null)

    const nextRequestBody = bodyAllowed ? requestBody.trim() : ''
    if (nextRequestBody) {
      try {
        JSON.parse(nextRequestBody)
      } catch {
        setRequestState('error')
        setRequestBodyError('요청 본문은 올바른 JSON 형식이어야 합니다.')
        setRequestMessage('JSON 요청 본문을 수정한 뒤 다시 실행하세요.')
        return
      }
    }

    const requestSnapshot: ExternalRequestSnapshot = {
      method: requestMethod,
      targetUrl: externalTargetPreview,
      queryParams,
      headers: requestHeaders,
      requestBody: nextRequestBody,
    }

    setRequestMessage(`${selectedApiMethodLabel} ${externalTargetPreview} 요청 중...`)

    try {
      const payload = await executeExternalRequest({
        targetBaseUrl: normalizedTargetBaseUrl,
        method: requestMethod,
        path: externalPath,
        queryParams: toEnabledEntries(queryParams),
        headers: toEnabledEntries(requestHeaders),
        requestBody: nextRequestBody || null,
        captureTrace,
      })
      startTransition(() => {
        setExternalResponse(payload)
        setLastResponseBody(parseResponseBody(payload.responseBody))
        setExternalRequestSnapshot(requestSnapshot)
        setRequestState(payload.resultStatus === 'SUCCESS' ? 'idle' : 'error')
        setTraceCollectionStatus(payload.traceCollectionStatus)
        setRequestMessage(buildExternalRequestMessage(payload))
      })

      if (payload.traceId) {
        const traceId = payload.traceId
        setTraceDetail(createPlaceholderTrace(
          traceId,
          selectedApiMethodLabel,
          externalPath,
          'external-opentelemetry',
          'OPENTELEMETRY',
          instrumentationProfile?.serviceName ?? projectStructure.projectName,
        ))
        setStreamStatus('connecting')
        setActiveView('runtime')
        setRequestMessage('외부 요청은 완료됐습니다. OpenTelemetry span을 기다리고 있습니다...')
        try {
          const stream = await openTraceStream(traceId, runId)
          if (activeRunIdRef.current !== runId) {
            stream.close()
            return
          }
          activeStreamRef.current = stream
        } catch {
          setStreamStatus('error')
          setRequestMessage('Trace 실시간 연결을 열지 못했습니다. Agent와 수집 주소를 확인하세요.')
        }
      }
    } catch (error) {
      setRequestState('error')
      setRequestMessage(error instanceof Error ? error.message : '외부 API 요청 중 오류가 발생했습니다.')
    }
  }

  async function openTraceStream(traceId: string, runId: number) {
    return connectTraceStream(traceId, {
      onStarted: (payload) => {
        if (activeRunIdRef.current !== runId) {
          return
        }
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
          setRequestMessage('실행 이벤트를 수집하고 있습니다...')
        })
      },
      onTraceEvent: (payload) => {
        if (activeRunIdRef.current !== runId) {
          return
        }
        startTransition(() => {
          setTraceDetail((current) => {
            if (!current || current.traceId !== payload.traceId) {
              return current
            }

            return {
              ...current,
              events: current.events.some((event) =>
                event.eventId === payload.eventId || Boolean(payload.spanId && event.spanId === payload.spanId),
              ) ? current.events : [...current.events, payload],
              endedAt: payload.endedAt,
            }
          })
          setSelectedNodeId(payload.spanId ?? payload.component)
        })
      },
      onCollectionStatus: (payload) => {
        if (activeRunIdRef.current !== runId) {
          return
        }
        setTraceCollectionStatus(payload.status)
        if (payload.status === 'PENDING') {
          setStreamStatus('connecting')
        } else if (payload.status === 'COLLECTING') {
          setStreamStatus('streaming')
        } else if (payload.status === 'COMPLETED') {
          setStreamStatus('completed')
        } else if (payload.status === 'TIMED_OUT') {
          setStreamStatus('error')
        }
        setRequestMessage(payload.message)
      },
      onTerminal: (payload, nextStatus) => {
        if (activeRunIdRef.current !== runId) {
          return
        }
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
              ? 'Trace 수집이 완료됐습니다. 상세 결과를 정리합니다...'
              : `${payload.errorType ?? '알 수 없는 지점'}에서 Trace가 실패했습니다. 상세 결과를 정리합니다...`,
          )
        })
        void fetchTraceWithRetry(payload.traceId).then((detail) => {
          if (activeRunIdRef.current !== runId) return
          setTraceDetail(detail)
          const failureEvent = getPrimaryFailureEvent(detail.events)
          setSelectedNodeId(
            failureEvent?.spanId
              ?? failureEvent?.component
              ?? detail.events[0]?.spanId
              ?? detail.events[0]?.component
              ?? null,
          )
          void loadRecentTraces()
        }).catch(() => undefined)
      },
      onConnectionTimeout: (payload) => {
        if (activeRunIdRef.current !== runId) {
          return
        }
        startTransition(() => {
          setStreamStatus('connection_timeout')
          setRequestMessage(`${payload.message} Trace 수집 시간 초과와는 별개입니다.`)
        })
      },
      onDisconnected: () => {
        if (activeRunIdRef.current !== runId) {
          return
        }
        startTransition(() => {
          setStreamStatus('error')
          setRequestMessage('실시간 연결이 종료되었습니다. 요청 결과는 최근 Trace에서 다시 확인하세요.')
        })
      },
    })
  }

  async function selectTrace(traceId: string) {
    closeActiveStream()
    const detail = await fetchTraceWithRetry(traceId)
    const matchingApi = apiCatalog.find((api) => matchesTraceEndpoint(api, detail))
    startTransition(() => {
      setTraceDetail(detail)
      setSelectedNodeId(null)
      if (matchingApi) {
        setSelectedApiId(matchingApi.id)
        setSelectedDomainId(matchingApi.domainId)
      }
      setLastResponseBody(null)
      setStreamStatus('idle')
      setRequestState('idle')
      setRequestMessage(`기록에서 Trace ${detail.traceId.slice(0, 8)}를 불러왔습니다.`)
    })
  }
  return {
    activeView,
    setActiveView,
    project,
    request,
    runtime,
    projectPath,
    setProjectPath,
    folderPickerState,
    setFolderPickerState,
    folderPickerMessage,
    setFolderPickerMessage,
    apiCatalog,
    setApiCatalog,
    projectStructure,
    setProjectStructure,
    setCatalogSource,
    analysisTarget,
    setAnalysisTarget,
    analysisState,
    setAnalysisState,
    analysisMessage,
    setAnalysisMessage,
    selectedApiId,
    setSelectedApiId,
    selectedDomainId,
    setSelectedDomainId,
    apiScope,
    setApiScope,
    agentPath,
    setAgentPath,
    collectorBaseUrl,
    setCollectorBaseUrl,
    instrumentationProfile,
    setInstrumentationProfile,
    profileState,
    setProfileState,
    profileMessage,
    setProfileMessage,
    instrumentationStatus,
    resetInstrumentationProfile,
    productId,
    setProductId,
    targetBaseUrl,
    setTargetBaseUrl,
    endpointSearch,
    setEndpointSearch,
    queryParams,
    requestHeaders,
    requestBody,
    setRequestBody,
    requestBodyError,
    setRequestBodyError,
    externalRequestSnapshot,
    setExternalRequestSnapshot,
    scenario,
    setScenario,
    requestOptionTab,
    setRequestOptionTab,
    requestState,
    setRequestState,
    requestMessage,
    setRequestMessage,
    lastResponseBody,
    setLastResponseBody,
    externalResponse,
    setExternalResponse,
    updateQueryParam,
    updateRequestHeader,
    removeQueryParam,
    removeRequestHeader,
    addQueryParam,
    addRequestHeader,
    resetForExternalProject,
    resetForSampleProject,
    traceDetail,
    setTraceDetail,
    recentTraces,
    setRecentTraces,
    selectedNodeId,
    setSelectedNodeId,
    traceViewTab,
    setTraceViewTab,
    streamStatus,
    setStreamStatus,
    traceCollectionStatus,
    setTraceCollectionStatus,
    activeStreamRef,
    activeRunIdRef,
    flowInstanceRef,
    closeActiveStream,
    resetTraceRuntime,
    graph,
    waterfall,
    orderedTraceEvents,
    primaryFailureEvent,
    primaryFailureNodeId,
    selectedNode,
    activeNodeCount,
    latestEvent,
    inspectorEvent,
    primaryFailureLabel,
    selectedDomain,
    hasDetectedDomains,
    hasDetectedApis,
    domainApis,
    visibleApis,
    selectedApi,
    projectMetrics,
    domainLayerGroups,
    domainStructurePath,
    supportingDomainGroups,
    commonLayerGroups,
    commonClassCount,
    activeRoute,
    estimatedFlow,
    traceComparison,
    hasConcreteMethod,
    runtimeSupported,
    externalRunnable,
    analyzeOnly,
    projectStatusContent,
    selectedDomainDisplayMode,
    hasIntegrationBoundary,
    demoTraceReady,
    externalTraceConfigured,
    externalTraceVerified,
    instrumentationCommand,
    runtimeModeLabel,
    traceDisplayStatus,
    traceDisplayTone,
    currentResultStatus,
    externalPath,
    externalTargetPreview,
    bodyAllowed,
    selectedApiMethodLabel,
    selectedApiMethodClassName,
    graphFitKey,
    recentEvents,
    formattedResponseBody,
    formattedExternalResponseBody,
    loadApiCatalog,
    analyzeProjectPath,
    selectLocalProjectFolder,
    applyProjectStructure,
    generateInstrumentationProfile,
    selectDomain,
    selectApi,
    loadRecentTraces,
    runRequest,
    runExternalRequest,
    openTraceStream,
    selectTrace,
  } as const
}
