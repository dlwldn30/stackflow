import { useState } from 'react'
import { useInstrumentationStatus } from '../../../hooks/useInstrumentationStatus'
import type { InstrumentationProfile, ProjectStructure } from '../../../types/trace'
import type { ActionFields, AnalysisTarget, ApiDefinition, ApiScope, AsyncState, StateFields } from '../types'

export function useProjectWorkspace(
  initialStructure: ProjectStructure,
  initialCatalog: ApiDefinition[],
) {
  const [projectPath, setProjectPath] = useState(import.meta.env.VITE_DEFAULT_PROJECT_PATH ?? '')
  const [folderPickerState, setFolderPickerState] = useState<AsyncState>('idle')
  const [folderPickerMessage, setFolderPickerMessage] = useState('Finder에서 프로젝트 폴더를 선택할 수 있습니다.')
  const [apiCatalog, setApiCatalog] = useState<ApiDefinition[]>(initialCatalog)
  const [projectStructure, setProjectStructure] = useState<ProjectStructure>(initialStructure)
  const [catalogSource, setCatalogSource] = useState<'analyzed' | 'fallback'>('fallback')
  const [analysisTarget, setAnalysisTarget] = useState<AnalysisTarget>('sample')
  const [analysisState, setAnalysisState] = useState<AsyncState>('idle')
  const [analysisMessage, setAnalysisMessage] = useState('기본 StackFlow 샘플 프로젝트를 사용하고 있습니다.')
  const [selectedApiId, setSelectedApiId] = useState(initialCatalog[0]?.id ?? 'empty-api')
  const [selectedDomainId, setSelectedDomainId] = useState(initialStructure.domains[0]?.id ?? 'empty')
  const [apiScope, setApiScope] = useState<ApiScope>('domain')
  const [agentPath, setAgentPath] = useState('~/.stackflow/agents/opentelemetry-javaagent.jar')
  const [collectorBaseUrl, setCollectorBaseUrl] = useState('http://localhost:18080')
  const [instrumentationProfile, setInstrumentationProfile] = useState<InstrumentationProfile | null>(null)
  const [profileState, setProfileState] = useState<AsyncState>('idle')
  const [profileMessage, setProfileMessage] = useState('Agent 경로와 수집 주소를 확인한 뒤 실행 명령을 생성하세요.')
  const instrumentationStatus = useInstrumentationStatus(instrumentationProfile)

  const resetInstrumentationProfile = () => {
    setInstrumentationProfile(null)
    setProfileState('idle')
    setProfileMessage('Agent 경로와 수집 주소를 확인한 뒤 실행 명령을 생성하세요.')
  }

  return {
    projectPath, setProjectPath,
    folderPickerState, setFolderPickerState,
    folderPickerMessage, setFolderPickerMessage,
    apiCatalog, setApiCatalog,
    projectStructure, setProjectStructure,
    catalogSource, setCatalogSource,
    analysisTarget, setAnalysisTarget,
    analysisState, setAnalysisState,
    analysisMessage, setAnalysisMessage,
    selectedApiId, setSelectedApiId,
    selectedDomainId, setSelectedDomainId,
    apiScope, setApiScope,
    agentPath, setAgentPath,
    collectorBaseUrl, setCollectorBaseUrl,
    instrumentationProfile, setInstrumentationProfile,
    profileState, setProfileState,
    profileMessage, setProfileMessage,
    instrumentationStatus,
    resetInstrumentationProfile,
  }
}

export type ProjectWorkspaceModel = ReturnType<typeof useProjectWorkspace>
export type ProjectWorkspaceActions = ActionFields<ProjectWorkspaceModel>
export type ProjectWorkspaceState = StateFields<ProjectWorkspaceModel>
