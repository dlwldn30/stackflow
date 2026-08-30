import { Plus, Send, Trash2 } from 'lucide-react'
import type {
  ExternalRequestEntry,
  TraceCollectionStatus,
} from '../../../types/trace'
import { SCENARIOS } from '../fixtures'
import { countEnabledEntries } from '../requestModel'
import type { ApiDefinition, AsyncState, RequestOptionTab, ScenarioValue } from '../types'

type RequestComposerProps = {
  selectedApi: ApiDefinition
  domainName: string
  methodLabel: string
  methodClassName: string
  runtimeModeLabel: string
  runtimeSupported: boolean
  externalRunnable: boolean
  externalTraceConfigured: boolean
  externalTraceVerified: boolean
  analyzeOnly: boolean
  hasDetectedApis: boolean
  targetBaseUrl: string
  externalPath: string
  externalTargetPreview: string
  productId: string
  scenario: ScenarioValue
  requestOptionTab: RequestOptionTab
  queryParams: ExternalRequestEntry[]
  requestHeaders: ExternalRequestEntry[]
  requestBody: string
  requestBodyError: string | null
  bodyAllowed: boolean
  requestState: AsyncState
  requestMessage: string
  traceCollectionStatus: TraceCollectionStatus
  responseAvailable: boolean
  onTargetBaseUrlChange: (value: string) => void
  onProductIdChange: (value: string) => void
  onScenarioChange: (value: ScenarioValue) => void
  onRequestOptionTabChange: (value: RequestOptionTab) => void
  onRequestBodyChange: (value: string) => void
  onClearRequestBodyError: () => void
  onAddQueryParam: () => void
  onAddRequestHeader: () => void
  onUpdateQueryParam: (id: string, patch: Partial<ExternalRequestEntry>) => void
  onUpdateRequestHeader: (id: string, patch: Partial<ExternalRequestEntry>) => void
  onRemoveQueryParam: (id: string) => void
  onRemoveRequestHeader: (id: string) => void
  onRunRequest: () => void
}

export function RequestComposer(props: RequestComposerProps) {
  const {
    selectedApi,
    domainName,
    methodLabel,
    methodClassName,
    runtimeModeLabel,
    runtimeSupported,
    externalRunnable,
    externalTraceConfigured,
    externalTraceVerified,
    analyzeOnly,
    hasDetectedApis,
    targetBaseUrl,
    externalPath,
    externalTargetPreview,
    productId,
    scenario,
    requestOptionTab,
    queryParams,
    requestHeaders,
    requestBody,
    requestBodyError,
    bodyAllowed,
    requestState,
    requestMessage,
    traceCollectionStatus,
    responseAvailable,
  } = props
  const runLabel = getRunLabel(requestState, runtimeSupported, externalRunnable, externalTraceConfigured, externalTraceVerified)
  const targetMissing = externalRunnable && !targetBaseUrl.trim()
  const requestBodyValidationError = requestBodyError ?? validateRequestBody(bodyAllowed, requestBody)
  const showLiveStatus = requestState === 'loading'
    || requestState === 'error' && !responseAvailable
    || traceCollectionStatus === 'PENDING'
    || traceCollectionStatus === 'COLLECTING'

  return (
    <section className="request-composer" aria-label="API 요청 작성">
      <header className="request-composer__header">
        <div className="request-breadcrumb">
          <span>{domainName}</span>
          <strong>{selectedApi.controller}.{selectedApi.handler}</strong>
        </div>
        <span className={`pill pill--inline ${runtimeSupported || externalTraceVerified ? 'pill--success' : 'pill--warning'}`}>
          {runtimeModeLabel}
        </span>
      </header>

      <div className="request-composer__title">
        <span className="section-label">API 요청</span>
        <h2>{selectedApi.label}</h2>
        <p>{selectedApi.description}</p>
      </div>

      <div className="request-command-bar">
        <span className={methodClassName}>{methodLabel}</span>
        {externalRunnable ? (
          <label className="request-command-target">
            <span className="sr-only">대상 기본 URL</span>
            <input
              value={targetBaseUrl}
              onChange={(event) => props.onTargetBaseUrlChange(event.target.value)}
              placeholder="https://api.example.com"
              aria-label="대상 기본 URL"
            />
            <code>{externalPath}</code>
          </label>
        ) : (
          <code className="request-command-path">{externalPath}</code>
        )}
        <button
          className="run-button request-command-run"
          type="button"
          onClick={props.onRunRequest}
          disabled={requestState === 'loading'
            || !hasDetectedApis
            || analyzeOnly
            || targetMissing
            || Boolean(requestBodyValidationError)}
        >
          <Send size={17} aria-hidden="true" />
          {runLabel}
        </button>
      </div>

      {!selectedApi.methodSpecified ? (
        <p className="request-method-warning">Controller mapping에 HTTP method가 명시되지 않아 요청을 실행할 수 없습니다.</p>
      ) : null}
      {targetMissing ? (
        <p className="request-method-warning">요청을 실행하려면 대상 기본 URL을 입력하세요.</p>
      ) : null}

      <div className="request-form request-form--workspace">
        {externalRunnable ? (
          <>
            {selectedApi.requiresProductId ? (
              <label className="field request-path-variable">
                <span>Path variable 값</span>
                <input value={productId} onChange={(event) => props.onProductIdChange(event.target.value)} />
              </label>
            ) : null}
            <div className="request-options">
              <div className="request-option-tabs" role="tablist" aria-label="요청 옵션">
                <RequestOptionButton label="Query" count={countEnabledEntries(queryParams)} value="query" selected={requestOptionTab} onChange={props.onRequestOptionTabChange} />
                <RequestOptionButton label="Header" count={countEnabledEntries(requestHeaders)} value="headers" selected={requestOptionTab} onChange={props.onRequestOptionTabChange} />
                <RequestOptionButton label="Body" count={bodyAllowed ? 'JSON' : '-'} value="body" selected={requestOptionTab} onChange={props.onRequestOptionTabChange} />
              </div>

              {requestOptionTab === 'query' ? (
                <RequestEntryEditor
                  label="쿼리 파라미터"
                  emptyMessage="사용할 쿼리 파라미터가 없습니다."
                  entries={queryParams}
                  keyPlaceholder="page"
                  valuePlaceholder="1"
                  onAdd={props.onAddQueryParam}
                  onUpdate={props.onUpdateQueryParam}
                  onRemove={props.onRemoveQueryParam}
                />
              ) : null}
              {requestOptionTab === 'headers' ? (
                <RequestEntryEditor
                  label="요청 헤더"
                  emptyMessage="추가한 요청 헤더가 없습니다."
                  entries={requestHeaders}
                  keyPlaceholder="Authorization"
                  valuePlaceholder="Bearer token"
                  onAdd={props.onAddRequestHeader}
                  onUpdate={props.onUpdateRequestHeader}
                  onRemove={props.onRemoveRequestHeader}
                />
              ) : null}
              {requestOptionTab === 'body' ? (
                <label className={`field request-body-field${bodyAllowed ? '' : ' is-disabled'}`}>
                  <span>{bodyAllowed ? 'JSON 요청 본문' : '이 HTTP method는 요청 본문을 사용하지 않습니다'}</span>
                  <textarea
                    value={requestBody}
                    onChange={(event) => {
                      props.onRequestBodyChange(event.target.value)
                      props.onClearRequestBodyError()
                    }}
                    disabled={!bodyAllowed}
                    rows={8}
                    spellCheck={false}
                  />
                  {requestBodyValidationError ? <small className="request-message--error">{requestBodyValidationError}</small> : null}
                </label>
              ) : null}
            </div>
            <div className="request-resolved-target">
              <span>실행 URL</span>
              <code>{externalTargetPreview}</code>
            </div>
            <details className="security-note request-security-note">
              <summary>로컬·사설 URL 요청 정책</summary>
              <p>로컬 앱을 호출하려면 backend에서 private target 허용 설정을 켜야 합니다.</p>
            </details>
          </>
        ) : null}

        {selectedApi.requiresProductId && !externalRunnable ? (
          <label className="field request-path-variable">
            <span>Product ID</span>
            <input value={productId} onChange={(event) => props.onProductIdChange(event.target.value)} />
          </label>
        ) : null}
        {runtimeSupported ? (
          <label className="field request-scenario-field">
            <span>실행 시나리오</span>
            <select value={scenario} onChange={(event) => props.onScenarioChange(event.target.value as ScenarioValue)}>
              {SCENARIOS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        ) : null}

        {showLiveStatus ? (
          <div className={`request-live-status request-live-status--${requestState}`} aria-live="polite">
            <span>{getExecutionStatus(requestState, traceCollectionStatus)}</span>
            <p>{requestMessage}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function RequestOptionButton({
  label,
  count,
  value,
  selected,
  onChange,
}: {
  label: string
  count: number | string
  value: RequestOptionTab
  selected: RequestOptionTab
  onChange: (value: RequestOptionTab) => void
}) {
  return (
    <button type="button" role="tab" aria-selected={selected === value} className={selected === value ? 'is-active' : ''} onClick={() => onChange(value)}>
      {label} <span>{count}</span>
    </button>
  )
}

function RequestEntryEditor({
  label,
  emptyMessage,
  entries,
  keyPlaceholder,
  valuePlaceholder,
  onAdd,
  onUpdate,
  onRemove,
}: {
  label: string
  emptyMessage: string
  entries: ExternalRequestEntry[]
  keyPlaceholder: string
  valuePlaceholder: string
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<ExternalRequestEntry>) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="request-editor">
      <div className="request-editor__head">
        <span>{label}</span>
        <button type="button" onClick={onAdd}><Plus size={14} aria-hidden="true" />항목 추가</button>
      </div>
      {entries.length > 0 ? (
        <div className="request-entry-list">
          {entries.map((entry) => (
            <div key={entry.id} className={`request-entry${entry.enabled ? '' : ' is-disabled'}`}>
              <label className="entry-toggle">
                <input type="checkbox" checked={entry.enabled} onChange={(event) => onUpdate(entry.id, { enabled: event.target.checked })} />
                <span>{entry.enabled ? '사용' : '제외'}</span>
              </label>
              <input value={entry.key} onChange={(event) => onUpdate(entry.id, { key: event.target.value })} placeholder={keyPlaceholder} aria-label={`${label} key`} />
              <input value={entry.value} onChange={(event) => onUpdate(entry.id, { value: event.target.value })} placeholder={valuePlaceholder} aria-label={`${label} value`} />
              <button type="button" onClick={() => onRemove(entry.id)} aria-label={`${label} 삭제`}><Trash2 size={14} aria-hidden="true" /></button>
            </div>
          ))}
        </div>
      ) : <p className="request-editor__empty">{emptyMessage}</p>}
    </div>
  )
}

function getRunLabel(
  requestState: AsyncState,
  runtimeSupported: boolean,
  externalRunnable: boolean,
  externalTraceConfigured: boolean,
  externalTraceVerified: boolean,
) {
  if (requestState === 'loading') return runtimeSupported ? 'Trace 수집 중' : '요청 중'
  if (runtimeSupported || externalTraceVerified) return '요청 보내고 Trace 보기'
  if (externalRunnable && externalTraceConfigured) return '요청 보내고 Agent 확인'
  if (externalRunnable) return '외부 API 요청'
  return '정적 분석만 가능'
}

function getExecutionStatus(
  requestState: AsyncState,
  traceCollectionStatus: TraceCollectionStatus,
) {
  if (requestState === 'loading') return traceCollectionStatus === 'PENDING' ? 'Span 대기' : '요청 중'
  if (requestState === 'error') return '요청 실패'
  if (traceCollectionStatus === 'PENDING') return 'Span 대기'
  if (traceCollectionStatus === 'COLLECTING') return '수집 중'
  return '응답 수신'
}

function validateRequestBody(bodyAllowed: boolean, requestBody: string) {
  if (!bodyAllowed || !requestBody.trim()) return null
  try {
    JSON.parse(requestBody)
    return null
  } catch {
    return '요청 본문은 올바른 JSON 형식이어야 합니다.'
  }
}
