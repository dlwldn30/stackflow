import { useEffect, useState } from 'react'
import { buildGraph, getNodeDetail } from '../../../lib/graph'
import { buildWaterfall, getPrimaryFailureEvent } from '../../../lib/waterfall'
import type { ViewMode } from '../../../ui/copy'
import { EMPTY_API_DEFINITION, EMPTY_DOMAIN, FALLBACK_API_CATALOG, FALLBACK_PROJECT_STRUCTURE, PROJECT_STATUS_CONTENT } from '../fixtures'
import { buildRequestResponsePresentation, createRequestEntry, filterApis } from '../requestModel'
import { buildFailurePropagationPath, buildTraceOutcomePresentation, filterTraceHistory, getDefaultInspectionEvent, getInspectorEvent, getTraceCollectionPresentation } from '../traceModel'
import {
  buildCommonProjectLayers,
  buildDomainStructurePath,
  buildEstimatedFlow,
  buildProjectMetrics,
  compareEstimatedAndActualFlow,
  getApiMethodBadgeClassName,
  getApiMethodLabel,
  getControllerBasePathSummary,
  getDomainDisplayMode,
  groupProjectLayers,
  isConcreteMethodApi,
  isStackFlowRuntimeApi,
} from '../workbenchModel'
import { useProjectActions } from './useProjectActions'
import { useProjectWorkspace } from './useProjectWorkspace'
import { useRequestActions } from './useRequestActions'
import { useRequestExecution } from './useRequestExecution'
import { useTraceActions } from './useTraceActions'
import { useTraceRuntime } from './useTraceRuntime'
import { useWorkbenchRunLifecycle } from './useWorkbenchRunLifecycle'

export function useWorkbenchController() {
  const [activeView, setActiveViewState] = useState<ViewMode>('project')
  const project = useProjectWorkspace(FALLBACK_PROJECT_STRUCTURE, FALLBACK_API_CATALOG)
  const request = useRequestExecution(createRequestEntry)
  const runtime = useTraceRuntime()
  const lifecycle = useWorkbenchRunLifecycle(request, runtime)

  const selectedDomain = project.projectStructure.domains.find((domain) => domain.id === project.selectedDomainId)
    ?? project.projectStructure.domains[0]
    ?? EMPTY_DOMAIN
  const workspaceServices = project.workspace?.services ?? []
  const selectedService = workspaceServices.find((service) => service.serviceId === project.selectedServiceId)
    ?? workspaceServices[0]
    ?? null
  const hasDetectedDomains = project.projectStructure.domains.length > 0
  const hasDetectedApis = project.apiCatalog.length > 0
  const analysisUsable = project.analysisResultState === 'current' && project.analysisState === 'idle'
  const hasUsableApis = analysisUsable && hasDetectedApis
  const domainApis = project.apiCatalog.filter((api) => api.domainId === selectedDomain.id)
  const scopedApis = project.apiScope === 'all' ? project.apiCatalog : domainApis
  const visibleApis = filterApis(scopedApis, request.endpointSearch)
  const selectedApi = scopedApis.find((api) => api.id === project.selectedApiId) ?? scopedApis[0] ?? EMPTY_API_DEFINITION
  const hasConcreteMethod = hasUsableApis && isConcreteMethodApi(selectedApi)
  const runtimeSupported = hasConcreteMethod
    && project.analysisTarget === 'sample'
    && isStackFlowRuntimeApi(selectedApi)
  const externalRunnable = hasConcreteMethod && project.analysisTarget === 'external'
  const analyzeOnly = hasUsableApis && !runtimeSupported && !externalRunnable
  const demoTraceReady = import.meta.env.VITE_DEMO_TRACE_READY === 'true'
    && project.projectPath.trim() === import.meta.env.VITE_DEFAULT_PROJECT_PATH
  const externalTraceConfigured = project.analysisTarget === 'external'
    && (demoTraceReady || Boolean(project.instrumentationProfile))
  const externalTraceVerified = project.analysisTarget === 'external'
    && (demoTraceReady || project.instrumentationStatus.status?.connectionStatus === 'SPAN_RECEIVED')

  const traceActions = useTraceActions({ project, request, runtime, lifecycle })
  const requestActions = useRequestActions({
    project, request, runtime, traceActions, lifecycle, selectedApi,
    hasDetectedApis: hasUsableApis, runtimeSupported, externalRunnable, analyzeOnly,
    externalTraceConfigured, setActiveView: setActiveViewState,
  })
  const projectActions = useProjectActions({
    project, request, runtime, lifecycle, setActiveView: setActiveViewState,
  })

  const graph = buildGraph(runtime.traceDetail)
  const waterfall = buildWaterfall(runtime.traceDetail?.events ?? [])
  const orderedTraceEvents = [...(runtime.traceDetail?.events ?? [])].sort((left, right) =>
    Date.parse(left.startedAt) - Date.parse(right.startedAt))
  const primaryFailureEvent = getPrimaryFailureEvent(runtime.traceDetail?.events ?? [])
  const primaryFailureNodeId = primaryFailureEvent?.spanId ?? primaryFailureEvent?.component ?? null
  const defaultInspectionEvent = getDefaultInspectionEvent(runtime.traceDetail, primaryFailureEvent)
  const defaultInspectionNodeId = defaultInspectionEvent?.spanId ?? defaultInspectionEvent?.component ?? null
  const selectedNode = getNodeDetail(graph.states, runtime.selectedNodeId)
    ?? getNodeDetail(graph.states, defaultInspectionNodeId)
  const inspectorEvent = getInspectorEvent(selectedNode)
  const primaryFailureLabel = primaryFailureEvent?.eventType
    ?? graph.states.find((state) => state.id === primaryFailureNodeId)?.label
    ?? primaryFailureEvent?.component
    ?? null
  const traceOutcome = runtime.traceDetail
    ? buildTraceOutcomePresentation(runtime.traceDetail, primaryFailureEvent)
    : null
  const failurePropagationPath = buildFailurePropagationPath(runtime.traceDetail?.events ?? [], primaryFailureEvent)
  const filteredRecentTraces = filterTraceHistory(runtime.recentTraces, runtime.traceHistoryFilter)
  const projectMetrics = buildProjectMetrics(project.projectStructure)
  const workspaceMetrics = {
    services: workspaceServices.length,
    domains: workspaceServices.reduce((sum, service) => sum + service.structure.domains.length, 0),
    apis: workspaceServices.reduce((sum, service) => sum + service.structure.analysisCoverage.detectedEndpoints, 0),
  }
  const receivedAgentCount = workspaceServices.filter((service) =>
    project.workspaceInstrumentationStatuses[service.serviceId]?.connectionStatus === 'SPAN_RECEIVED').length
  const domainLayerGroups = groupProjectLayers(selectedDomain.layers)
  const domainStructurePath = buildDomainStructurePath(domainLayerGroups, selectedDomain.infrastructure)
  const supportingDomainGroups = domainLayerGroups.filter((group) =>
    (group.id === 'model' || group.id === 'support') && group.classes.length > 0)
  const commonLayerGroups = groupProjectLayers(buildCommonProjectLayers(project.projectStructure))
  const commonClassCount = commonLayerGroups.reduce((sum, group) => sum + group.classes.length, 0)
  const activeRoute = graph.states.filter((state) => state.active)
  const estimatedFlow = hasUsableApis ? buildEstimatedFlow(selectedApi, selectedDomain) : []
  const selectedRuntimeServiceName = selectedService
    ? normalizeServiceName(selectedService.structure.projectName)
    : runtime.traceDetail?.serviceName
  const traceComparison = runtime.traceDetail?.source === 'OPENTELEMETRY'
    ? compareEstimatedAndActualFlow(
        estimatedFlow,
        runtime.traceDetail.events.filter((event) => !selectedRuntimeServiceName || event.serviceName === selectedRuntimeServiceName),
      )
    : null
  const traceServiceGroups = (runtime.traceDetail?.serviceNames ?? []).map((serviceName) => ({
    serviceName,
    events: runtime.traceDetail?.events.filter((event) => event.serviceName === serviceName) ?? [],
  }))
  const projectStatusContent = PROJECT_STATUS_CONTENT[project.projectStructure.analysisStatus]
  const selectedDomainDisplayMode = getDomainDisplayMode(selectedDomain, project.analysisTarget === 'sample')
  const controllerBasePathSummary = getControllerBasePathSummary(selectedDomain.controllers)
  const hasIntegrationBoundary = selectedDomainDisplayMode?.tone === 'integration'
  const instrumentationCommand = project.instrumentationProfile
    ? project.instrumentationProfile.commands[project.instrumentationProfile.buildTool.toLowerCase()]
      ?? project.instrumentationProfile.commands.jar
    : null
  const runtimeModeLabel = runtimeSupported
    ? '요청·Trace 가능'
    : externalRunnable
      ? externalTraceVerified
        ? '요청 후 Trace 확인'
        : externalTraceConfigured ? 'Trace 설정됨 · 확인 전' : '외부 API 요청'
      : '정적 분석만 가능'
  const traceCollectionPresentation = getTraceCollectionPresentation(
    runtime.streamStatus,
    runtime.traceDetail?.traceCollectionStatus ?? runtime.traceCollectionStatus,
    Boolean(runtime.traceDetail),
  )
  const selectedApiMethodLabel = getApiMethodLabel(selectedApi)
  const selectedApiMethodClassName = getApiMethodBadgeClassName(selectedApi)
  const requestResponsePresentation = buildRequestResponsePresentation({
    externalRunnable,
    requestState: request.requestState,
    requestMessage: request.requestMessage,
    externalResponse: request.externalResponse,
    traceDetail: runtime.traceDetail,
    traceCollectionStatus: runtime.traceCollectionStatus,
    sampleResponseBody: request.lastResponseBody,
  })
  const graphFitKey = `${runtime.traceDetail?.traceId ?? 'empty'}-${runtime.traceDetail?.events.length ?? 0}`
  const selectedTraceId = runtime.traceDetail?.traceId
  const setSelectedNodeId = runtime.setSelectedNodeId
  const effectiveProjectStatus = project.analysisState === 'error' || project.analysisResultState === 'none'
    ? 'FAILED'
    : project.projectStructure.analysisStatus
  const projectDisplayName = project.analysisResultState === 'none' && project.projectPath.trim()
    ? project.projectPath.trim().split(/[/\\]/).filter(Boolean).at(-1) ?? '외부 프로젝트'
    : project.projectStructure.projectName

  /* oxlint-disable react-hooks/exhaustive-deps -- Initial loading runs once; action hooks own cancellation. */
  useEffect(() => {
    void projectActions.loadApiCatalog()
    void traceActions.loadRecentTraces()
    return lifecycle.invalidateActiveRun
  }, [])
  /* oxlint-enable react-hooks/exhaustive-deps */

  useEffect(() => setSelectedNodeId(null), [selectedTraceId, setSelectedNodeId])
  useEffect(() => {
    if (!runtime.flowInstanceRef.current) return
    const frame = window.requestAnimationFrame(() => runtime.flowInstanceRef.current?.fitView({ padding: 0.14, duration: 180, includeHiddenNodes: true }))
    const settledFit = window.setTimeout(() => runtime.flowInstanceRef.current?.fitView({ padding: 0.14, duration: 0, includeHiddenNodes: true }), 180)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(settledFit)
    }
  }, [graphFitKey, runtime.flowInstanceRef])

  const setActiveView = (view: ViewMode) => {
    if (view !== activeView) lifecycle.invalidateActiveRun()
    setActiveViewState(view)
  }

  return {
    shell: {
      activeView, setActiveView,
      projectName: projectDisplayName,
      projectStatus: effectiveProjectStatus,
      analysisTarget: project.analysisTarget,
      hasDetectedApis: hasUsableApis,
      requestReady: hasUsableApis && hasConcreteMethod,
      traceId: runtime.traceDetail?.traceId ?? null,
      traceCollectionPresentation,
    },
    projectView: {
      ...project, ...projectActions,
      setActiveView, selectApi: requestActions.selectApi,
      setExternalResponse: request.setExternalResponse,
      selectedDomain, hasDetectedDomains, hasDetectedApis, analysisUsable, projectMetrics,
      workspaceServices, selectedService, workspaceMetrics, receivedAgentCount,
      domainLayerGroups, domainStructurePath, supportingDomainGroups,
      commonLayerGroups, commonClassCount, selectedApi, selectedApiMethodLabel,
      selectedDomainDisplayMode, controllerBasePathSummary, projectStatusContent,
      runtimeModeLabel, externalRunnable, demoTraceReady, externalTraceConfigured,
      externalTraceVerified, instrumentationCommand,
    },
    requestView: {
      ...project, ...request, ...requestActions,
      setActiveView, selectedDomain, domainApis, visibleApis, selectedApi,
      hasDetectedApis: hasUsableApis, hasConcreteMethod, runtimeSupported, externalRunnable, analyzeOnly,
      externalTraceConfigured, externalTraceVerified, hasIntegrationBoundary,
      estimatedFlow, runtimeModeLabel, selectedApiMethodLabel,
      selectedApiMethodClassName, requestResponsePresentation,
      traceDetail: runtime.traceDetail,
      traceCollectionStatus: runtime.traceCollectionStatus,
    },
    traceView: {
      ...runtime, selectTrace: traceActions.selectTrace,
      setActiveView,
      graph, waterfall, orderedTraceEvents, primaryFailureEvent, primaryFailureNodeId,
      selectedNode, inspectorEvent, primaryFailureLabel, traceOutcome,
      failurePropagationPath, filteredRecentTraces, activeRoute, traceComparison,
      traceServiceGroups,
      selectedApi, selectedDomain,
      analysisTarget: project.analysisTarget,
      runtimeSupported, externalTraceConfigured, selectedApiMethodLabel,
    },
  }
}

export type WorkbenchController = ReturnType<typeof useWorkbenchController>

function normalizeServiceName(value: string) {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '')
}
