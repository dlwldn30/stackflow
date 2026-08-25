import { startTransition, useCallback } from 'react'
import {
  analyzeProject,
  createInstrumentationProfile,
  getProjectStructure,
  selectProjectFolder,
} from '../../../api/stackflow'
import type { ProjectDomain, ProjectStructure } from '../../../types/trace'
import type { ViewMode } from '../../../ui/copy'
import { EMPTY_API_DEFINITION, EMPTY_DOMAIN, FALLBACK_API_CATALOG, FALLBACK_PROJECT_STRUCTURE } from '../fixtures'
import type { AnalysisTarget, ApiDefinition } from '../types'
import { flattenProjectApis } from '../workbenchModel'
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
  ) => {
    lifecycle.invalidateActiveRun()
    startTransition(() => {
      project.setProjectStructure(structure)
      project.setApiCatalog(analyzedCatalog)
      project.setCatalogSource('analyzed')
      project.setAnalysisTarget(target)
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

  const loadApiCatalog = useCallback(async () => {
    const runId = runtime.activeRunIdRef.current
    try {
      const defaultProjectPath = import.meta.env.VITE_DEFAULT_PROJECT_PATH
      const structure = defaultProjectPath
        ? await analyzeProject(defaultProjectPath)
        : await getProjectStructure()
      if (!lifecycle.isCurrentRun(runId)) return
      applyProjectStructure(
        structure,
        flattenProjectApis(structure),
        structure.analysisMessage,
        defaultProjectPath ? 'external' : 'sample',
      )
    } catch {
      if (!lifecycle.isCurrentRun(runId)) return
      startTransition(() => {
        project.setProjectStructure(FALLBACK_PROJECT_STRUCTURE)
        project.setApiCatalog(FALLBACK_API_CATALOG)
        project.setCatalogSource('fallback')
        project.setAnalysisTarget('sample')
        project.setAnalysisMessage('샘플 프로젝트를 표시하고 있습니다. 직접 분석하려면 프로젝트 경로를 입력하세요.')
        project.setSelectedDomainId((current) => FALLBACK_PROJECT_STRUCTURE.domains.some((domain) => domain.id === current)
          ? current
          : FALLBACK_PROJECT_STRUCTURE.domains[0].id)
        project.setSelectedApiId((current) => FALLBACK_API_CATALOG.some((api) => api.id === current)
          ? current
          : FALLBACK_API_CATALOG[0].id)
      })
    }
  }, [applyProjectStructure, lifecycle, project, runtime.activeRunIdRef])

  const analyzeProjectPath = useCallback(async (pathOverride?: string) => {
    const requestedPath = pathOverride ?? project.projectPath
    if (pathOverride === undefined && !requestedPath.trim()) {
      project.setAnalysisState('error')
      project.setAnalysisMessage('분석할 프로젝트 폴더를 선택하거나 절대 경로를 입력하세요. 데모는 별도 버튼으로 열 수 있습니다.')
      return
    }

    lifecycle.invalidateActiveRun()
    const runId = runtime.activeRunIdRef.current
    project.setAnalysisState('loading')
    project.setAnalysisMessage('프로젝트 파일과 Spring mapping을 읽고 있습니다...')
    const target: AnalysisTarget = requestedPath.trim() === '' ? 'sample' : 'external'
    try {
      const structure = await analyzeProject(requestedPath)
      if (!lifecycle.isCurrentRun(runId)) return
      applyProjectStructure(structure, flattenProjectApis(structure), structure.analysisMessage, target)
      project.setAnalysisState(structure.analysisStatus === 'FAILED' ? 'error' : 'idle')
      setActiveView('project')
    } catch (error) {
      if (!lifecycle.isCurrentRun(runId)) return
      project.setAnalysisState('error')
      project.setAnalysisMessage(error instanceof Error ? error.message : '프로젝트 분석에 실패했습니다.')
    }
  }, [applyProjectStructure, lifecycle, project, runtime.activeRunIdRef, setActiveView])

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
    if (project.analysisTarget !== 'external' || !project.projectPath.trim()) {
      project.setProfileState('error')
      project.setProfileMessage('먼저 외부 Spring 프로젝트 경로를 분석하세요.')
      return
    }
    project.setProfileState('loading')
    project.setProfileMessage('분석된 클래스와 public method로 Agent 실행 설정을 만들고 있습니다...')
    try {
      const profile = await createInstrumentationProfile({
        projectPath: project.projectPath.trim(),
        collectorBaseUrl: project.collectorBaseUrl.trim(),
        agentPath: project.agentPath.trim(),
      })
      project.setInstrumentationProfile(profile)
      project.setProfileState('idle')
      project.setProfileMessage('명령을 터미널에서 실행해 대상 앱을 Agent와 함께 재시작하세요.')
    } catch (error) {
      project.setProfileState('error')
      project.setProfileMessage(error instanceof Error ? error.message : '실행 Trace 설정 생성에 실패했습니다.')
    }
  }, [project])

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
  }
}

export type ProjectActions = ReturnType<typeof useProjectActions>
