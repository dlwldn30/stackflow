import { startTransition, useCallback } from 'react'
import {
  analyzeProject,
  analyzeWorkspace,
  createWorkspaceInstrumentationProfile,
  getProjectStructure,
  selectProjectFolder,
} from '../../../api/stackflow'
import type { ProjectDomain, ProjectStructure, WorkspaceAnalysis, WorkspaceService } from '../../../types/trace'
import type { ViewMode } from '../../../ui/copy'
import { EMPTY_API_DEFINITION, EMPTY_DOMAIN } from '../fixtures'
import type { AnalysisTarget, ApiDefinition } from '../types'
import { getDefaultPathVariable } from '../requestModel'
import { flattenProjectApis, flattenServiceApis } from '../workbenchModel'
import type { ProjectWorkspaceModel } from './useProjectWorkspace'
import type { RequestExecutionModel } from './useRequestExecution'
import type { TraceRuntimeModel } from './useTraceRuntime'
import type { WorkbenchRunLifecycle } from './useWorkbenchRunLifecycle'

type ProjectActionsOptions = {
  project: ProjectWorkspaceModel
  request: RequestExecutionModel
  runtime: TraceRuntimeModel
  lifecycle: WorkbenchRunLifecycle
  setActiveView: (view: ViewMode) => void
}

export function useProjectActions({ project, request, runtime, lifecycle, setActiveView }: ProjectActionsOptions) {
  const applyProjectStructure = useCallback((
    structure: ProjectStructure,
    analyzedCatalog: ApiDefinition[],
    message: string,
    target: AnalysisTarget,
    successfulPath?: string | null,
  ) => {
    lifecycle.invalidateActiveRun()
    startTransition(() => {
      project.setProjectStructure(structure)
      project.setApiCatalog(analyzedCatalog)
      project.setCatalogSource('analyzed')
      project.setAnalysisTarget(target)
      project.setAnalysisResultState('current')
      project.setLastSuccessfulProjectPath(target === 'external'
        ? (successfulPath ?? project.projectPath.trim())
        : null)
      project.setApiScope(target === 'external' ? 'all' : 'domain')
      project.setAnalysisMessage(message)
      project.setSelectedDomainId((current) => structure.domains.some((domain) => domain.id === current)
        ? current
        : (structure.domains[0]?.id ?? EMPTY_DOMAIN.id))
      project.setSelectedApiId((current) => analyzedCatalog.some((api) => api.id === current)
        ? current
        : (analyzedCatalog[0]?.id ?? EMPTY_API_DEFINITION.id))
      if (target === 'external') {
        project.resetInstrumentationProfile()
        runtime.resetTraceRuntime()
        request.resetForExternalProject()
      } else {
        request.resetForSampleProject()
      }
    })
  }, [lifecycle, project, request, runtime])

  const applyWorkspaceAnalysis = useCallback((workspace: WorkspaceAnalysis, successfulPath?: string) => {
    const selectedService = workspace.services.find((service) => service.serviceId === project.selectedServiceId)
      ?? workspace.services[0]
    if (!selectedService) throw new Error('Workspace에서 분석 가능한 Spring 서비스를 찾지 못했습니다.')
    const catalog = flattenServiceApis(selectedService.structure, selectedService.serviceId)
    applyProjectStructure(
      selectedService.structure,
      catalog,
      `${workspace.services.length}개 서비스를 분석했습니다. 서비스를 선택해 API 구조를 확인하세요.`,
      'external',
      successfulPath,
    )
    project.setWorkspace(workspace)
    project.setSelectedServiceId(selectedService.serviceId)
    if (catalog[0]?.requiresProductId) request.setProductId(getDefaultPathVariable(catalog[0]))
  }, [applyProjectStructure, project, request])

  const loadApiCatalog = useCallback(async () => {
    const runId = runtime.activeRunIdRef.current
    const defaultProjectPath = import.meta.env.VITE_DEFAULT_PROJECT_PATH
    try {
      if (defaultProjectPath) {
        const workspace = await analyzeWorkspace(defaultProjectPath)
        if (!lifecycle.isCurrentRun(runId)) return
        const failed = workspace.services.length === 0
          || workspace.services.every((service) => service.structure.analysisStatus === 'FAILED')
        if (failed) {
          throw new Error(workspace.warnings[0]
            ?? workspace.services[0]?.structure.analysisMessage
            ?? 'Workspace에서 분석 가능한 Spring 서비스를 찾지 못했습니다.')
        }
        applyWorkspaceAnalysis(workspace, defaultProjectPath)
        project.setAnalysisState('idle')
        return
      }
      const structure = await getProjectStructure()
      if (!lifecycle.isCurrentRun(runId)) return
      if (structure.analysisStatus === 'FAILED') throw new Error(structure.analysisMessage)
      applyProjectStructure(
        structure,
        flattenProjectApis(structure),
        structure.analysisMessage,
        defaultProjectPath ? 'external' : 'sample',
      )
      project.setAnalysisState('idle')
    } catch (error) {
      if (!lifecycle.isCurrentRun(runId)) return
      startTransition(() => {
        project.setAnalysisTarget(defaultProjectPath ? 'external' : 'sample')
        project.setAnalysisState('error')
        project.setAnalysisResultState('none')
        project.setAnalysisMessage(error instanceof Error ? error.message : '프로젝트 분석에 실패했습니다.')
      })
    }
  }, [applyProjectStructure, applyWorkspaceAnalysis, lifecycle, project, runtime.activeRunIdRef])

  const analyzeProjectPath = useCallback(async (pathOverride?: string) => {
    const requestedPath = pathOverride ?? project.projectPath
    if (pathOverride === undefined && !requestedPath.trim()) {
      project.setAnalysisState('error')
      project.setAnalysisResultState(project.analysisResultState === 'none' ? 'none' : 'stale')
      project.setAnalysisMessage('분석할 프로젝트 폴더를 선택하거나 절대 경로를 입력하세요. 데모는 별도 버튼으로 열 수 있습니다.')
      return
    }

    lifecycle.invalidateActiveRun()
    const runId = runtime.activeRunIdRef.current
    project.setAnalysisState('loading')
    project.setAnalysisMessage('프로젝트 파일과 Spring mapping을 읽고 있습니다...')
    const target: AnalysisTarget = requestedPath.trim() === '' ? 'sample' : 'external'
    try {
      if (target === 'external') {
        const workspace = await analyzeWorkspace(requestedPath)
        if (!lifecycle.isCurrentRun(runId)) return
        const failed = workspace.services.length === 0
          || workspace.services.every((service) => service.structure.analysisStatus === 'FAILED')
        if (failed) {
          throw new Error(workspace.warnings[0]
            ?? workspace.services[0]?.structure.analysisMessage
            ?? 'Workspace에서 분석 가능한 Spring 서비스를 찾지 못했습니다.')
        }
        applyWorkspaceAnalysis(workspace, requestedPath.trim())
        project.setAnalysisState('idle')
      } else {
        const structure = await analyzeProject(requestedPath)
        if (!lifecycle.isCurrentRun(runId)) return
        if (structure.analysisStatus === 'FAILED') throw new Error(structure.analysisMessage)
        project.setWorkspace(null)
        project.setSelectedServiceId(null)
        applyProjectStructure(structure, flattenProjectApis(structure), structure.analysisMessage, target, null)
        project.setAnalysisState('idle')
      }
      setActiveView('project')
    } catch (error) {
      if (!lifecycle.isCurrentRun(runId)) return
      project.setAnalysisState('error')
      project.setAnalysisResultState(project.analysisResultState === 'none' ? 'none' : 'stale')
      project.setAnalysisMessage(error instanceof Error ? error.message : '프로젝트 분석에 실패했습니다.')
      setActiveView('project')
    }
  }, [applyProjectStructure, applyWorkspaceAnalysis, lifecycle, project, runtime.activeRunIdRef, setActiveView])

  const selectLocalProjectFolder = useCallback(async () => {
    project.setFolderPickerState('loading')
    project.setFolderPickerMessage('폴더 선택창을 여는 중입니다...')
    try {
      const selection = await selectProjectFolder()
      if (!selection.supported) {
        project.setFolderPickerState('error')
        project.setFolderPickerMessage(selection.message)
        return
      }
      if (!selection.selected || !selection.projectPath) {
        project.setFolderPickerState('idle')
        project.setFolderPickerMessage(selection.message)
        return
      }
      project.setProjectPath(selection.projectPath)
      project.setFolderPickerState('idle')
      project.setFolderPickerMessage('선택한 경로가 입력되었습니다. 프로젝트 분석을 실행하세요.')
    } catch (error) {
      project.setFolderPickerState('error')
      project.setFolderPickerMessage(error instanceof Error ? error.message : '폴더 선택창을 열지 못했습니다.')
    }
  }, [project])

  const generateInstrumentationProfile = useCallback(async () => {
    if (project.analysisResultState !== 'current' || project.analysisTarget !== 'external' || !project.projectPath.trim()) {
      project.setProfileState('error')
      project.setProfileMessage('먼저 외부 Spring 프로젝트 경로를 분석하세요.')
      return
    }
    project.setProfileState('loading')
    project.setProfileMessage('분석된 클래스와 public method로 Agent 실행 설정을 만들고 있습니다...')
    try {
      const workspaceProfile = await createWorkspaceInstrumentationProfile({
        workspacePath: project.projectPath.trim(),
        collectorBaseUrl: project.collectorBaseUrl.trim(),
        agentPath: project.agentPath.trim(),
      })
      project.setWorkspaceProfiles(workspaceProfile.profiles)
      project.setInstrumentationProfile(
        workspaceProfile.profiles.find((item) => item.serviceId === project.selectedServiceId)?.profile
          ?? workspaceProfile.profiles[0]?.profile
          ?? null,
      )
      project.setProfileState('idle')
      project.setProfileMessage('명령을 터미널에서 실행해 대상 앱을 Agent와 함께 재시작하세요.')
    } catch (error) {
      project.setProfileState('error')
      project.setProfileMessage(error instanceof Error ? error.message : '실행 Trace 설정 생성에 실패했습니다.')
    }
  }, [project])

  const selectService = useCallback((service: WorkspaceService) => {
    if (service.serviceId === project.selectedServiceId) return
    lifecycle.invalidateActiveRun()
    const catalog = flattenServiceApis(service.structure, service.serviceId)
    runtime.resetTraceRuntime()
    request.resetForExternalProject()
    project.setSelectedServiceId(service.serviceId)
    project.setProjectStructure(service.structure)
    project.setApiCatalog(catalog)
    project.setSelectedDomainId(service.structure.domains[0]?.id ?? EMPTY_DOMAIN.id)
    project.setSelectedApiId(catalog[0]?.id ?? EMPTY_API_DEFINITION.id)
    if (catalog[0]?.requiresProductId) request.setProductId(getDefaultPathVariable(catalog[0]))
    project.setApiScope('all')
    project.setInstrumentationProfile(
      project.workspaceProfiles.find((item) => item.serviceId === service.serviceId)?.profile ?? null,
    )
    setActiveView('project')
  }, [lifecycle, project, request, runtime, setActiveView])

  const selectDomain = useCallback((domain: ProjectDomain) => {
    if (domain.id === EMPTY_DOMAIN.id) return
    if (domain.id !== project.selectedDomainId) lifecycle.invalidateActiveRun()
    project.setSelectedDomainId(domain.id)
    project.setApiScope('domain')
    setActiveView('project')
    const nextApi = project.apiCatalog.find((api) => api.domainId === domain.id)
    if (nextApi) {
      project.setSelectedApiId(nextApi.id)
      request.setExternalResponse(null)
    }
  }, [lifecycle, project, request, setActiveView])

  return {
    loadApiCatalog,
    analyzeProjectPath,
    selectLocalProjectFolder,
    applyProjectStructure,
    generateInstrumentationProfile,
    selectDomain,
    selectService,
  }
}

export type ProjectActions = ReturnType<typeof useProjectActions>
