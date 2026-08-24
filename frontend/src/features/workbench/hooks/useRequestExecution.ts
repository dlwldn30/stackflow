import { useState } from 'react'
import type { ExternalRequestEntry, ExternalRequestResponse } from '../../../types/trace'
import type {
  AsyncState,
  ActionFields,
  ExternalRequestSnapshot,
  RequestOptionTab,
  ScenarioValue,
  StateFields,
} from '../types'
import { removeRequestEntry, updateRequestEntries } from '../requestModel'

type CreateEntry = (key: string, value: string, enabled: boolean) => ExternalRequestEntry

export function useRequestExecution(createEntry: CreateEntry) {
  const [productId, setProductId] = useState('1001')
  const [targetBaseUrl, setTargetBaseUrl] = useState(import.meta.env.VITE_DEFAULT_TARGET_BASE_URL ?? '')
  const [endpointSearch, setEndpointSearch] = useState('')
  const [queryParams, setQueryParams] = useState<ExternalRequestEntry[]>([])
  const [requestHeaders, setRequestHeaders] = useState<ExternalRequestEntry[]>([])
  const [requestBody, setRequestBody] = useState('{\n  "name": "Sample product"\n}')
  const [requestBodyError, setRequestBodyError] = useState<string | null>(null)
  const [externalRequestSnapshot, setExternalRequestSnapshot] = useState<ExternalRequestSnapshot | null>(null)
  const [scenario, setScenario] = useState<ScenarioValue>('normal')
  const [requestOptionTab, setRequestOptionTab] = useState<RequestOptionTab>('query')
  const [requestState, setRequestState] = useState<AsyncState>('idle')
  const [requestMessage, setRequestMessage] = useState('API를 선택하고 요청을 실행하세요.')
  const [lastResponseBody, setLastResponseBody] = useState<unknown>(null)
  const [externalResponse, setExternalResponse] = useState<ExternalRequestResponse | null>(null)

  const updateQueryParam = (id: string, patch: Partial<ExternalRequestEntry>) =>
    setQueryParams((current) => updateRequestEntries(current, id, patch))
  const updateRequestHeader = (id: string, patch: Partial<ExternalRequestEntry>) =>
    setRequestHeaders((current) => updateRequestEntries(current, id, patch))
  const removeQueryParam = (id: string) =>
    setQueryParams((current) => removeRequestEntry(current, id))
  const removeRequestHeader = (id: string) =>
    setRequestHeaders((current) => removeRequestEntry(current, id))
  const addQueryParam = () => setQueryParams((current) => [...current, createEntry('', '', true)])
  const addRequestHeader = () => setRequestHeaders((current) => [...current, createEntry('', '', true)])
  const resetForExternalProject = () => {
    setLastResponseBody(null)
    setExternalResponse(null)
    setExternalRequestSnapshot(null)
    setRequestState('idle')
    setRequestBodyError(null)
    setRequestMessage('외부 프로젝트를 불러왔습니다. 대상 URL을 입력한 뒤 요청을 실행하세요.')
  }
  const resetForSampleProject = () => {
    setExternalResponse(null)
    setExternalRequestSnapshot(null)
    setRequestState('idle')
    setRequestBodyError(null)
    setRequestMessage('API를 선택하고 요청을 실행하세요.')
  }

  return {
    productId, setProductId,
    targetBaseUrl, setTargetBaseUrl,
    endpointSearch, setEndpointSearch,
    queryParams, setQueryParams,
    requestHeaders, setRequestHeaders,
    requestBody, setRequestBody,
    requestBodyError, setRequestBodyError,
    externalRequestSnapshot, setExternalRequestSnapshot,
    scenario, setScenario,
    requestOptionTab, setRequestOptionTab,
    requestState, setRequestState,
    requestMessage, setRequestMessage,
    lastResponseBody, setLastResponseBody,
    externalResponse, setExternalResponse,
    updateQueryParam, updateRequestHeader,
    removeQueryParam, removeRequestHeader,
    addQueryParam, addRequestHeader,
    resetForExternalProject, resetForSampleProject,
  }
}

type RequestExecutionModel = ReturnType<typeof useRequestExecution>
export type RequestExecutionActions = ActionFields<RequestExecutionModel>
export type RequestExecutionState = StateFields<RequestExecutionModel>
