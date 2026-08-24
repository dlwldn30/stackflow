import { Background, Controls, ReactFlow } from '@xyflow/react'
import { AlertCircle, ArrowLeft, ArrowRight, Boxes, Braces, CheckCircle2, ChevronRight, Database, FolderOpen, Network, Plus, Route, ScanSearch, Send, Trash2 } from 'lucide-react'
import '../../App.css'
import { StatusBadge } from '../../components/StatusBadge'
import { TraceWaterfall } from '../../components/TraceWaterfall'
import { EVENT_STATUS_LABEL, PROJECT_STATUS_LABEL, TRACE_COLLECTION_STATUS_LABEL } from '../../ui/copy'
import { AppShell } from './components/AppShell'
import { SCENARIOS } from './fixtures'
import { useWorkbenchController } from './hooks/useWorkbenchController'
import { countEnabledEntries } from './requestModel'
import {
  formatProfileLastSeen,
  getApiMethodBadgeClassName,
  getApiMethodLabel,
  getDomainDescription,
  getDomainDisplayMode,
} from './workbenchModel'
import { LayerEvidenceList, ProjectView } from './views/ProjectView'
import { RequestView } from './views/RequestView'
import { TraceView } from './views/TraceView'

export function StackFlowWorkbench() {
  const {
    activeView,
    setActiveView,
    projectPath,
    setProjectPath,
    folderPickerState,
    setFolderPickerState,
    folderPickerMessage,
    apiCatalog,
    projectStructure,
    analysisTarget,
    analysisState,
    analysisMessage,
    setSelectedApiId,
    selectedDomainId,
    apiScope,
    setApiScope,
    agentPath,
    setAgentPath,
    collectorBaseUrl,
    setCollectorBaseUrl,
    instrumentationProfile,
    profileState,
    profileMessage,
    instrumentationStatus,
    productId,
    setProductId,
    targetBaseUrl,
    setTargetBaseUrl,
    queryParams,
    requestHeaders,
    requestBody,
    setRequestBody,
    requestBodyError,
    setRequestBodyError,
    externalRequestSnapshot,
    scenario,
    setScenario,
    requestOptionTab,
    setRequestOptionTab,
    requestState,
    requestMessage,
    externalResponse,
    setExternalResponse,
    updateQueryParam,
    updateRequestHeader,
    removeQueryParam,
    removeRequestHeader,
    addQueryParam,
    addRequestHeader,
    traceDetail,
    recentTraces,
    setSelectedNodeId,
    traceViewTab,
    setTraceViewTab,
    traceCollectionStatus,
    flowInstanceRef,
    graph,
    waterfall,
    orderedTraceEvents,
    primaryFailureEvent,
    primaryFailureNodeId,
    selectedNode,
    activeNodeCount,
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
    externalTargetPreview,
    bodyAllowed,
    selectedApiMethodLabel,
    selectedApiMethodClassName,
    recentEvents,
    formattedResponseBody,
    formattedExternalResponseBody,
    analyzeProjectPath,
    selectLocalProjectFolder,
    generateInstrumentationProfile,
    selectDomain,
    selectApi,
    runRequest,
    selectTrace,
  } = useWorkbenchController()

  return (
    <AppShell
      activeView={activeView}
      projectName={projectStructure.projectName}
      projectStatus={projectStructure.analysisStatus}
      analysisTarget={analysisTarget}
      hasDetectedApis={hasDetectedApis}
      requestReady={hasDetectedApis && hasConcreteMethod}
      traceId={traceDetail?.traceId ?? null}
      traceResultStatus={currentResultStatus}
      traceDisplayStatus={traceDisplayStatus}
      traceEventCount={traceDetail?.events.length ?? 0}
      onViewChange={setActiveView}
    >
      <section className={`workspace workspace--${activeView}`}>
        <aside className="left-panel control-rail">
          <div className="panel-card control-card">
            <div className="panel-header control-header">
              <div>
                <span className="section-label">
                  {activeView === 'project' ? '프로젝트 탐색' : activeView === 'api' ? 'API 선택' : 'Trace 기록'}
                </span>
                <h2>
                  {activeView === 'project' ? '프로젝트 열기' : activeView === 'api' ? apiScope === 'all' ? '전체 API' : selectedDomain.name : '최근 Trace'}
                </h2>
                <p>
                  {activeView === 'project'
                    ? 'Spring Boot 루트 폴더를 선택하세요.'
                    : activeView === 'api'
                      ? '실행하거나 확인할 endpoint를 선택하세요.'
                      : '이전 실행 기록을 다시 확인할 수 있습니다.'}
                </p>
              </div>
              <StatusBadge tone={activeView === 'project' && analysisTarget === 'external' ? 'success' : 'info'}>
                {activeView === 'project'
                  ? (analysisTarget === 'external' ? '외부 프로젝트' : '샘플')
                  : activeView === 'api'
                    ? `${visibleApis.length}개 API`
                    : `${recentTraces.length}개 기록`}
              </StatusBadge>
            </div>

            <ProjectView active={activeView === 'project'}>
              <section className="setup-step setup-step--project">
              <div className="setup-step__head">
                <ScanSearch size={18} aria-hidden="true" />
                <div>
                  <strong>분석할 프로젝트</strong>
                  <small>build.gradle 또는 pom.xml이 있는 폴더를 선택합니다.</small>
                </div>
              </div>

              <div className="project-path-form">
                <div className="project-path-input-row">
                  <label className="field">
                    <span>프로젝트 루트 경로</span>
                    <input
                      value={projectPath}
                      onChange={(event) => {
                        setProjectPath(event.target.value)
                        setFolderPickerState('idle')
                      }}
                      placeholder="/Users/jiwoo/Desktop/my-spring-project"
                    />
                  </label>
                  <button
                    className="folder-picker-button"
                    type="button"
                    onClick={() => void selectLocalProjectFolder()}
                    disabled={folderPickerState === 'loading' || analysisState === 'loading'}
                  >
                    <FolderOpen size={16} aria-hidden="true" />
                    {folderPickerState === 'loading' ? '선택 중' : '폴더 선택'}
                  </button>
                </div>
                <p className={`project-path-help ${folderPickerState === 'error' ? 'project-path-help--error' : ''}`}>
                  {folderPickerMessage}
                </p>
                <div className="project-primary-actions">
                  <button
                    className="analyze-button"
                    type="button"
                    onClick={() => void analyzeProjectPath()}
                    disabled={analysisState === 'loading' || !projectPath.trim()}
                  >
                    <ScanSearch size={17} aria-hidden="true" />
                    {analysisState === 'loading' ? '분석 중' : '프로젝트 분석'}
                  </button>
                  <button className="sample-project-button" type="button" onClick={() => void analyzeProjectPath('')} disabled={analysisState === 'loading'}>
                    데모 프로젝트
                  </button>
                </div>

                <div className={`analysis-summary analysis-summary--${analysisState === 'error' ? 'failed' : projectStructure.analysisStatus.toLowerCase()}`}>
                  {analysisState !== 'error' && projectStructure.analysisStatus === 'SUCCESS' ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertCircle size={18} aria-hidden="true" />}
                  <div>
                    <span>{analysisTarget === 'external' ? projectStructure.projectName : 'StackFlow 샘플'}</span>
                    <strong>
                      {analysisState === 'error'
                        ? analysisMessage
                        : projectStructure.analysisStatus === 'SUCCESS'
                          ? `도메인 ${projectStructure.domains.length}개 · API ${apiCatalog.length}개`
                          : PROJECT_STATUS_LABEL[projectStructure.analysisStatus]}
                    </strong>
                  </div>
                  {hasDetectedApis && analysisState !== 'error' ? (
                    <button type="button" onClick={() => setActiveView('api')}>
                      API 보기
                      <ArrowRight size={15} aria-hidden="true" />
                    </button>
                  ) : null}
                  <details>
                    <summary>기술 메시지</summary>
                    <p>{analysisMessage}</p>
                    <p>{projectStructure.analysisMessage}</p>
                  </details>
                </div>
              </div>

              <div className="domain-compact">
                <div className="section-row domain-compact__head">
                  <span className="section-label">도메인</span>
                  <span>{projectStructure.domains.length}개</span>
                </div>
                <div className="domain-list domain-list--compact">
                  {hasDetectedDomains ? (
                    projectStructure.domains.map((domain) => {
                      const displayMode = getDomainDisplayMode(domain, analysisTarget === 'sample')

                      return (
                        <button
                          key={domain.id}
                          type="button"
                          className={`domain-item${selectedDomainId === domain.id ? ' is-selected' : ''}`}
                          onClick={() => selectDomain(domain)}
                        >
                          <div className="domain-item__title">
                            <strong>{domain.name}</strong>
                            <small>{domain.endpoints.length}개 API</small>
                          </div>
                          {displayMode ? (
                            <span className={`domain-mode-badge domain-mode-badge--${displayMode.tone}`}>
                              {displayMode.label}
                            </span>
                          ) : null}
                          <em>{domain.controllers.map((controller) => controller.name).join(', ')}</em>
                        </button>
                      )
                    })
                  ) : (
                    <p className="empty-copy">분석 결과에서 API 도메인을 찾지 못했습니다.</p>
                  )}
                </div>
              </div>
              </section>
            </ProjectView>

            <RequestView active={activeView === 'api'}>
              <>
                <section className="setup-step setup-step--endpoint">
              <div className="setup-step__head">
                <ChevronRight size={18} aria-hidden="true" />
                <div>
                  <strong>Endpoint 선택</strong>
                  <small>전체 API를 보거나 선택한 도메인만 좁혀서 확인합니다.</small>
                </div>
              </div>

              <div className="api-scope-control" role="group" aria-label="API 표시 범위">
                <button type="button" className={apiScope === 'all' ? 'is-active' : ''} onClick={() => setApiScope('all')}>
                  전체 API <strong>{apiCatalog.length}</strong>
                </button>
                <button type="button" className={apiScope === 'domain' ? 'is-active' : ''} onClick={() => setApiScope('domain')}>
                  {selectedDomain.name} <strong>{domainApis.length}</strong>
                </button>
              </div>

              <div className="section-row">
                <span className="section-label">API 목록</span>
                <span>{apiScope === 'all' ? `전체 ${apiCatalog.length}개` : `${selectedDomain.name} ${domainApis.length}개 · 전체 ${apiCatalog.length}개`}</span>
              </div>
              <div className="api-list api-list--catalog">
                {hasDetectedApis ? (
                  visibleApis.map((api) => (
                    <button
                      key={api.id}
                      type="button"
                      className={`api-item${selectedApi.id === api.id ? ' is-selected' : ''}`}
                      onClick={() => selectApi(api)}
                    >
                      <span className={getApiMethodBadgeClassName(api)}>{getApiMethodLabel(api)}</span>
                      <div>
                        <strong>{api.label}</strong>
                        <span>{api.pathTemplate}</span>
                        <p>{api.requestType} · {api.description}</p>
                        <span className="api-item__handler">{api.controller}.{api.handler}</span>
                        {!api.methodSpecified ? (
                          <span className="api-item__handler">정적 분석만 가능 · HTTP method 미지정</span>
                        ) : null}
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="empty-copy">요청하거나 Trace를 확인할 REST API가 없습니다.</p>
                )}
              </div>
                </section>

                <section className="setup-step setup-step--run">
              <div className="request-context-bar">
                <button type="button" onClick={() => setActiveView('project')}>
                  <ArrowLeft size={15} aria-hidden="true" />
                  프로젝트 구조
                </button>
                <span>
                  <strong>{selectedDomain.name}</strong>
                  {selectedApiMethodLabel} {selectedApi.pathTemplate}
                </span>
              </div>
              <div className="setup-step__head">
                <Send size={18} aria-hidden="true" />
                <div>
                  <strong>
                    {runtimeSupported || externalTraceVerified
                      ? 'API 요청과 Trace 실행'
                      : externalTraceConfigured
                        ? 'API 요청으로 Agent 확인'
                        : '외부 API 요청'}
                  </strong>
                  <small>
                    {runtimeSupported
                      ? '실시간 연결을 연 뒤 선택한 API를 실행합니다.'
                      : externalTraceVerified
                        ? '요청에 traceparent를 넣고 Java Agent가 보낸 실제 span을 수집합니다.'
                        : externalTraceConfigured
                          ? '요청에 traceparent를 넣고 최초 span이 도착하는지 확인합니다.'
                        : 'StackFlow backend proxy를 통해 선택한 endpoint를 호출합니다.'}
                  </small>
                </div>
              </div>

              <div className="selected-request">
                <span className={selectedApiMethodClassName}>{selectedApiMethodLabel}</span>
                <div>
                  <strong>{selectedApi.label}</strong>
                  <small>{selectedApi.pathTemplate}</small>
                  {!selectedApi.methodSpecified ? <small>HTTP method가 명시되지 않아 정적 분석만 가능합니다.</small> : null}
                </div>
                <span className={`pill pill--inline ${runtimeSupported ? 'pill--success' : 'pill--warning'}`}>
                      {runtimeModeLabel}
                </span>
              </div>

              <div className="request-form">
                {externalRunnable ? (
                  <>
                    <div className="request-block request-block--basic">
                      <div className="request-block__head">
                        <span>요청 대상</span>
                        <small>기본값은 공개 URL만 허용합니다.</small>
                      </div>
                      <label className="field">
                        <span>대상 기본 URL</span>
                        <input
                          value={targetBaseUrl}
                          onChange={(event) => setTargetBaseUrl(event.target.value)}
                          placeholder="https://api.example.com"
                        />
                      </label>
                      {selectedApi.requiresProductId ? (
                        <label className="field">
                          <span>Path variable 값</span>
                          <input value={productId} onChange={(event) => setProductId(event.target.value)} />
                        </label>
                      ) : null}
                      <details className="security-note">
                        <summary>로컬·사설 URL 요청 안내</summary>
                        <p>로컬 앱을 호출하려면 backend에서 private target 허용 설정을 켜야 합니다.</p>
                      </details>
                    </div>
                    <div className="request-options">
                      <div className="request-option-tabs" role="tablist" aria-label="요청 옵션">
                        <button type="button" role="tab" aria-selected={requestOptionTab === 'query'} className={requestOptionTab === 'query' ? 'is-active' : ''} onClick={() => setRequestOptionTab('query')}>
                          Query <span>{countEnabledEntries(queryParams)}</span>
                        </button>
                        <button type="button" role="tab" aria-selected={requestOptionTab === 'headers'} className={requestOptionTab === 'headers' ? 'is-active' : ''} onClick={() => setRequestOptionTab('headers')}>
                          Header <span>{countEnabledEntries(requestHeaders)}</span>
                        </button>
                        <button type="button" role="tab" aria-selected={requestOptionTab === 'body'} className={requestOptionTab === 'body' ? 'is-active' : ''} onClick={() => setRequestOptionTab('body')}>
                          Body <span>{bodyAllowed ? 'JSON' : '-'}</span>
                        </button>
                      </div>
                      {requestOptionTab === 'query' ? (
                        <div className="request-editor">
                          <div className="request-editor__head">
                            <span>쿼리 파라미터</span>
                            <button type="button" onClick={addQueryParam}>
                              <Plus size={14} aria-hidden="true" />
                              항목 추가
                            </button>
                          </div>
                          <div className="request-entry-list">
                            {queryParams.map((entry) => (
                              <div key={entry.id} className={`request-entry${entry.enabled ? '' : ' is-disabled'}`}>
                                <label className="entry-toggle">
                                  <input
                                    type="checkbox"
                                    checked={entry.enabled}
                                    onChange={(event) => updateQueryParam(entry.id, { enabled: event.target.checked })}
                                  />
                                  <span>{entry.enabled ? '사용' : '제외'}</span>
                                </label>
                                <input
                                  value={entry.key}
                                  onChange={(event) => updateQueryParam(entry.id, { key: event.target.value })}
                                  placeholder="key"
                                />
                                <input
                                  value={entry.value}
                                  onChange={(event) => updateQueryParam(entry.id, { value: event.target.value })}
                                  placeholder="value"
                                />
                                <button type="button" onClick={() => removeQueryParam(entry.id)} aria-label="쿼리 파라미터 삭제">
                                  <Trash2 size={14} aria-hidden="true" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {requestOptionTab === 'headers' ? (
                        <div className="request-editor">
                          <div className="request-editor__head">
                            <span>요청 헤더</span>
                            <button type="button" onClick={addRequestHeader}>
                              <Plus size={14} aria-hidden="true" />
                              항목 추가
                            </button>
                          </div>
                          <div className="request-entry-list">
                            {requestHeaders.map((entry) => (
                              <div key={entry.id} className={`request-entry${entry.enabled ? '' : ' is-disabled'}`}>
                                <label className="entry-toggle">
                                  <input
                                    type="checkbox"
                                    checked={entry.enabled}
                                    onChange={(event) => updateRequestHeader(entry.id, { enabled: event.target.checked })}
                                  />
                                  <span>{entry.enabled ? '사용' : '제외'}</span>
                                </label>
                                <input
                                  value={entry.key}
                                  onChange={(event) => updateRequestHeader(entry.id, { key: event.target.value })}
                                  placeholder="Authorization"
                                />
                                <input
                                  value={entry.value}
                                  onChange={(event) => updateRequestHeader(entry.id, { value: event.target.value })}
                                  placeholder="Bearer token"
                                />
                                <button type="button" onClick={() => removeRequestHeader(entry.id)} aria-label="요청 헤더 삭제">
                                  <Trash2 size={14} aria-hidden="true" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {requestOptionTab === 'body' ? (
                        <label className={`field request-body-field${bodyAllowed ? '' : ' is-disabled'}`}>
                          <span>{bodyAllowed ? 'JSON 요청 본문' : '이 HTTP method는 요청 본문을 사용하지 않습니다'}</span>
                          <textarea
                            value={requestBody}
                            onChange={(event) => {
                              setRequestBody(event.target.value)
                              setRequestBodyError(null)
                            }}
                            disabled={!bodyAllowed}
                            rows={6}
                          />
                        </label>
                      ) : null}
                    </div>
                    <div className="request-preview request-preview--send">
                      <span>실행할 요청</span>
                      <div>
                        <span className={selectedApiMethodClassName}>{selectedApiMethodLabel}</span>
                        <strong>{externalTargetPreview}</strong>
                      </div>
                    </div>
                    {requestBodyError ? <p className="request-message request-message--error">{requestBodyError}</p> : null}
                  </>
                ) : null}
                {selectedApi.requiresProductId && !externalRunnable ? (
                  <label className="field">
                    <span>Product ID</span>
                    <input value={productId} onChange={(event) => setProductId(event.target.value)} />
                  </label>
                ) : null}
                {runtimeSupported ? (
                  <label className="field">
                    <span>실행 시나리오</span>
                    <select value={scenario} onChange={(event) => setScenario(event.target.value as (typeof SCENARIOS)[number]['value'])}>
                      {SCENARIOS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button className="run-button" type="button" onClick={() => void runRequest()} disabled={requestState === 'loading' || !hasDetectedApis || analyzeOnly}>
                  <Send size={17} aria-hidden="true" />
                  {requestState === 'loading'
                    ? (runtimeSupported ? 'Trace 수집 중...' : '외부 API 요청 중...')
                    : runtimeSupported
                      ? '요청 보내고 Trace 보기'
                    : externalRunnable
                        ? externalTraceVerified
                          ? '요청 보내고 Trace 보기'
                          : externalTraceConfigured
                            ? '요청 보내고 Agent 확인'
                            : '외부 API 요청'
                        : '정적 분석만 가능'}
                </button>
                <p className="request-message">{requestMessage}</p>

                <section className="request-result-panel" aria-label="API 응답">
                  <div className="section-row">
                    <div>
                      <span className="section-label">응답</span>
                      <strong>{externalRunnable ? '외부 HTTP 결과' : '실행 결과'}</strong>
                    </div>
                    <span className={`pill pill--inline pill--${((externalRunnable ? externalResponse?.resultStatus : traceDetail?.resultStatus) ?? 'idle').toLowerCase()}`}>
                      {externalRunnable
                        ? externalResponse ? `HTTP ${externalResponse.httpStatus || '-'}` : '대기'
                        : traceDetail ? `HTTP ${traceDetail.httpStatus || '-'}` : '대기'}
                    </span>
                  </div>
                  {externalRunnable ? (
                    externalResponse ? (
                      <>
                        <div className="request-result-meta">
                          <span><strong>{externalResponse.durationMs}ms</strong>소요 시간</span>
                          <span><strong>{externalResponse.contentType || '-'}</strong>Content-Type</span>
                          <span><strong>{externalResponse.traceId?.slice(0, 8) || '-'}</strong>Trace ID</span>
                        </div>
                        {externalResponse.errorMessage ? <p className="external-error">{externalResponse.errorMessage}</p> : null}
                        {formattedExternalResponseBody ? (
                          <pre className="response-body response-body--external">{formattedExternalResponseBody}</pre>
                        ) : <p className="empty-copy">대상 API가 빈 응답 본문을 반환했습니다.</p>}
                      </>
                    ) : <p className="empty-copy">대상 URL을 입력하고 요청을 보내면 여기에 응답이 표시됩니다.</p>
                  ) : formattedResponseBody ? (
                    <>
                      <div className="request-result-meta">
                        <span><strong>{traceDetail?.durationMs ?? 0}ms</strong>소요 시간</span>
                        <span><strong>{traceDetail?.events.length ?? 0}</strong>실행 이벤트</span>
                        <span><strong>{traceDetail?.traceId.slice(0, 8) ?? '-'}</strong>Trace ID</span>
                      </div>
                      <pre className="response-body response-body--external">{formattedResponseBody}</pre>
                    </>
                  ) : <p className="empty-copy">요청을 실행하면 JSON 응답이 여기에 표시됩니다.</p>}
                </section>
              </div>
                </section>
              </>
            </RequestView>
          </div>

          <TraceView active={activeView === 'runtime'}>
            <div className="panel-card recent-card">
            <div className="panel-header">
              <h2>최근 Trace</h2>
              <span>{recentTraces.length}</span>
            </div>
            <div className="trace-list">
              {recentTraces.length === 0 ? (
                <p className="empty-copy">아직 수집된 Trace가 없습니다.</p>
              ) : (
                recentTraces.map((trace) => (
                  <button
                    key={trace.traceId}
                    type="button"
                    className={`trace-item${traceDetail?.traceId === trace.traceId ? ' is-selected' : ''}`}
                    onClick={() => void selectTrace(trace.traceId)}
                  >
                    <div>
                      <strong>{trace.endpoint}</strong>
                      <span>{trace.traceId.slice(0, 8)}</span>
                    </div>
                    <div>
                      <span className={`pill pill--inline pill--${trace.resultStatus.toLowerCase()}`}>{EVENT_STATUS_LABEL[trace.resultStatus]}</span>
                      <span>{trace.durationMs}ms</span>
                    </div>
                  </button>
                ))
              )}
            </div>
            </div>
          </TraceView>
        </aside>

        <section className="graph-panel">
          <ProjectView active={activeView === 'project'}>
            <div className="panel-card panel-card--map">
              <header className="project-overview-head">
                <div className="project-overview-title">
                  <span className="section-label">분석된 프로젝트</span>
                  <div>
                    <h2>{projectStructure.projectName}</h2>
                    <StatusBadge tone={projectStructure.analysisStatus === 'SUCCESS' ? 'success' : projectStructure.analysisStatus === 'FAILED' ? 'error' : 'warning'}>
                      {PROJECT_STATUS_LABEL[projectStructure.analysisStatus]}
                    </StatusBadge>
                  </div>
                  <p>
                    {projectStructure.framework} · source root {projectStructure.analysisCoverage.sourceRoots.length}개 · Java {projectStructure.analysisCoverage.scannedJavaFiles}개
                  </p>
                </div>
                <p>{projectStatusContent.headerSummary}</p>
              </header>

              <section className="project-metric-strip" aria-label="프로젝트 분석 요약">
                {projectMetrics.map((metric) => (
                  <article key={metric.id}>
                    <span className="project-metric-icon" aria-hidden="true">
                      {metric.id === 'domains' ? <Boxes size={17} /> : metric.id === 'apis' ? <Braces size={17} /> : metric.id === 'controllers' ? <Network size={17} /> : <Database size={17} />}
                    </span>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                    <small>{metric.detail}</small>
                  </article>
                ))}
              </section>

              <div className="map-board" aria-label="분석된 프로젝트 구조">
                <section className="map-column map-column--domain-detail">
                  <header className="domain-focus-head">
                    <div>
                      <span className="section-label">선택한 도메인</span>
                      <div className="domain-focus-title">
                        <strong>{hasDetectedDomains ? selectedDomain.name : '감지된 도메인 없음'}</strong>
                        {hasDetectedDomains && selectedDomainDisplayMode ? (
                          <span className={`domain-mode-badge domain-mode-badge--${selectedDomainDisplayMode.tone}`}>
                            {selectedDomainDisplayMode.label}
                          </span>
                        ) : null}
                      </div>
                      <p>{hasDetectedDomains ? getDomainDescription(selectedDomain, analysisTarget === 'sample') : projectStatusContent.headerSummary}</p>
                    </div>
                    {selectedDomain.endpoints.length > 0 ? (
                      <button className="domain-primary-action" type="button" onClick={() => setActiveView('api')}>
                        선택한 API로 요청
                        <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    ) : null}
                  </header>

                  <div className="domain-identity-strip">
                    <span>
                      <small>Controller</small>
                      <strong>{selectedDomain.controllers.map((controller) => controller.name).join(', ') || '감지되지 않음'}</strong>
                    </span>
                    <span>
                      <small>Base path</small>
                      <strong>{selectedDomain.controllers.map((controller) => controller.basePath || '/').join(' · ') || '-'}</strong>
                    </span>
                    <span>
                      <small>Endpoint</small>
                      <strong>{selectedDomain.endpoints.length}개</strong>
                    </span>
                  </div>

                  <section className="domain-structure-section" aria-label="도메인 구조 경로">
                    <div className="section-row">
                      <div>
                        <span className="section-label">구조 경로</span>
                        <strong>코드에서 감지한 주요 역할</strong>
                      </div>
                      <span>실제 실행 순서는 Trace에서 확인합니다.</span>
                    </div>
                    {domainStructurePath.length > 0 ? (
                      <div className="domain-structure-path">
                        {domainStructurePath.map((step) => (
                          <article key={step.id} className={`domain-structure-step domain-structure-step--${step.tone}`}>
                            <span>{step.label}</span>
                            <strong>{step.value}</strong>
                            <small>{step.detail}</small>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-copy">이 도메인에서 역할이 명확한 클래스를 찾지 못했습니다.</p>
                    )}
                    {supportingDomainGroups.length > 0 ? (
                      <div className="domain-supporting-groups">
                        {supportingDomainGroups.map((group) => (
                          <span key={group.id}>
                            <strong>{group.label}</strong>
                            {group.classes.length}개
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </section>

                  <div className="section-row map-endpoint-head">
                    <div>
                      <span className="section-label">감지된 API</span>
                      <strong>{selectedApiMethodLabel} {selectedApi.pathTemplate}</strong>
                    </div>
                    <span>{selectedDomain.endpoints.length}개</span>
                  </div>
                  <div className="map-endpoint-list">
                    {selectedDomain.endpoints.length > 0 ? (
                      selectedDomain.endpoints.map((endpoint) => (
                        <button
                          key={endpoint.id}
                          type="button"
                          className={`map-endpoint-card${selectedApi.id === endpoint.id ? ' is-selected' : ''}`}
                          onClick={() => {
                            setSelectedApiId(endpoint.id)
                            setExternalResponse(null)
                          }}
                        >
                          <span className={getApiMethodBadgeClassName(endpoint)}>{getApiMethodLabel(endpoint)}</span>
                          <span className="map-endpoint-card__content">
                            <strong>{endpoint.path}</strong>
                            <small>{endpoint.controller}.{endpoint.handler}</small>
                            {!endpoint.methodSpecified ? <small>정적 분석만 가능 · HTTP method 미지정</small> : null}
                          </span>
                          <ChevronRight size={16} aria-hidden="true" />
                        </button>
                      ))
                    ) : (
                      <p className="empty-copy">{projectStatusContent.emptyEndpointMessage}</p>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </ProjectView>

          <RequestView active={activeView === 'api'}>
            <div className="panel-card panel-card--api-flow">
              <details className="request-flow-disclosure">
                <summary>
                  <span>
                    <span className="section-label">보조 정보</span>
                    <strong>예상 호출 경로</strong>
                    <small>{selectedApiMethodLabel} {selectedApi.pathTemplate} · 코드 구조 기반</small>
                  </span>
                  <span>{estimatedFlow.length}단계</span>
                </summary>
                <div className="request-flow-content">
              <div className="api-flow-summary">
                <span>
                  <strong>도메인</strong>
                  {selectedDomain.name}
                </span>
                <span>
                  <strong>Handler</strong>
                  {selectedApi.controller}.{selectedApi.handler}
                </span>
                <span>
                  <strong>요청 유형</strong>
                  {selectedApi.requestType}
                </span>
                <span>
                  <strong>근거 수준</strong>
                  {hasIntegrationBoundary ? '외부 연동 경계 포함' : '코드 구조 기반 예상'}
                </span>
              </div>

              <div className="estimated-flow" aria-label="예상 API 흐름">
                {estimatedFlow.length > 0 ? (
                  estimatedFlow.map((step, index) => (
                    <article key={step.id} className="estimated-step">
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <em>{step.layer}</em>
                        <strong>{step.label}</strong>
                      </div>
                      <small>
                        {step.detail}
                        <b>{step.source}</b>
                      </small>
                    </article>
                  ))
                ) : (
                  <p className="empty-copy">REST API를 찾지 못해 예상 요청 경로를 만들 수 없습니다.</p>
                )}
              </div>

              <div className="analysis-boundary">
                <strong>
                  {runtimeSupported
                    ? '이 API는 요청 후 실제 Trace를 확인할 수 있습니다.'
                    : !selectedApi.methodSpecified
                      ? 'Handler mapping에 HTTP method가 없어 정적 분석만 제공합니다.'
                      : externalRunnable && externalTraceVerified
                        ? '외부 요청에 Trace Context를 연결해 실제 span을 수집합니다.'
                        : externalRunnable && externalTraceConfigured
                          ? '외부 요청을 보내 Agent의 최초 span 수신을 확인합니다.'
                        : externalRunnable
                          ? '실행 명령을 생성하고 Agent로 대상 앱을 재시작하세요.'
                      : hasIntegrationBoundary
                      ? '외부 연동 경계를 정적 분석으로 표시합니다.'
                      : '이 샘플 API는 정적 분석만 제공합니다.'}
                </strong>
                <p>
                  {runtimeSupported
                    ? '왼쪽 요청 설정에서 API를 실행하면 Trace 탭으로 이동합니다.'
                    : !selectedApi.methodSpecified
                      ? 'StackFlow는 HTTP method를 임의로 추측하지 않습니다. 소스에서 method를 확인하세요.'
                      : externalRunnable && externalTraceVerified
                        ? '요청 시 traceparent를 강제로 주입하고 같은 trace ID의 OTLP span을 기다립니다.'
                        : externalRunnable && externalTraceConfigured
                          ? '실행 명령으로 앱을 재시작했다면 이 요청이 Agent 확인 요청이 됩니다.'
                        : externalRunnable
                          ? '프로젝트 구조 탭의 실행 Trace 설정에서 재실행 명령을 만들 수 있습니다.'
                      : hasIntegrationBoundary
                      ? 'Gateway와 Client는 naming과 package 구조에서 감지한 외부 호출 경계입니다.'
                      : 'Product 샘플 API를 선택하면 내장 Runtime Trace를 실행할 수 있습니다.'}
                </p>
              </div>
                </div>
              </details>
            </div>
          </RequestView>

          <TraceView active={activeView === 'runtime'}>
            <div className="panel-card panel-card--graph">
              <div className="graph-head">
                <div>
                  <span className="section-label">실제 실행 결과 · Runtime Trace</span>
                  <h2>{selectedDomain.name} 요청 흐름</h2>
                  <p>
                    {traceDetail
                      ? `${traceDetail.method} ${traceDetail.endpoint} · HTTP ${traceDetail.httpStatus || '-'}`
                      : runtimeSupported
                        ? `${selectedApiMethodLabel} ${selectedApi.pathTemplate} 요청을 실행하면 실제 흐름이 표시됩니다.`
                        : externalTraceConfigured
                          ? `${selectedApiMethodLabel} ${selectedApi.pathTemplate} 요청 후 실제 OpenTelemetry span을 표시합니다.`
                        : !selectedApi.methodSpecified
                          ? 'HTTP method가 명시되지 않아 정적 분석만 가능합니다.'
                          : '프로젝트 구조에서 Agent 실행 설정을 먼저 생성하세요.'}
                  </p>
                </div>
                <StatusBadge tone={traceDisplayTone}>
                  {traceDisplayStatus}
                </StatusBadge>
              </div>

              {!traceDetail ? (
                <div className="trace-empty-state">
                  <Route size={34} aria-hidden="true" />
                  <strong>먼저 API 요청을 실행하세요</strong>
                  <p>{analysisTarget === 'external' ? 'Agent로 대상 앱을 재시작한 뒤 API 요청을 보내면 실제 부모·자식 span을 확인할 수 있습니다.' : '실행 가능한 Product API를 보내면 Controller부터 Response까지 실제 호출 경로를 확인할 수 있습니다.'}</p>
                  <button type="button" onClick={() => setActiveView('api')}>
                    API 요청으로 이동
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <>
              <div className="graph-context" aria-label="현재 Trace 정보">
                <span>
                  <strong>도메인</strong>
                  {selectedDomain.name}
                </span>
                <span>
                  <strong>{traceDetail.source === 'OPENTELEMETRY' ? 'Service' : 'Controller'}</strong>
                  {traceDetail.source === 'OPENTELEMETRY' ? traceDetail.serviceName ?? '-' : selectedApi.controller}
                </span>
                <span>
                  <strong>Endpoint</strong>
                  {traceDetail.method} {traceDetail.endpoint}
                </span>
                <span>
                  <strong>확인 목표</strong>
                  첫 실패 지점 찾기
                </span>
              </div>

              {primaryFailureEvent ? (
                <section className="trace-failure-summary" aria-label="첫 실패 지점">
                  <AlertCircle size={18} aria-hidden="true" />
                  <div>
                    <span>첫 실패 지점</span>
                    <strong>{primaryFailureLabel} · {primaryFailureEvent.errorType ?? EVENT_STATUS_LABEL[primaryFailureEvent.status]}</strong>
                    <p>{primaryFailureEvent.errorMessage ?? `${primaryFailureEvent.eventType} 실행 중 실패했습니다.`}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedNodeId(primaryFailureNodeId)}>
                    상세 보기
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                </section>
              ) : null}

              <div className="trace-view-tabs" role="tablist" aria-label="Trace 보기 방식">
                <button type="button" role="tab" aria-selected={traceViewTab === 'timeline'} className={traceViewTab === 'timeline' ? 'is-active' : ''} onClick={() => setTraceViewTab('timeline')}>
                  타임라인
                </button>
                <button type="button" role="tab" aria-selected={traceViewTab === 'graph'} className={traceViewTab === 'graph' ? 'is-active' : ''} onClick={() => setTraceViewTab('graph')}>
                  그래프
                </button>
                <button type="button" role="tab" aria-selected={traceViewTab === 'events'} className={traceViewTab === 'events' ? 'is-active' : ''} onClick={() => setTraceViewTab('events')}>
                  이벤트 <span>{traceDetail.events.length}</span>
                </button>
              </div>

              {traceViewTab === 'timeline' ? (
                <TraceWaterfall
                  model={waterfall}
                  selectedSpanId={selectedNode?.id ?? null}
                  onSelectSpan={setSelectedNodeId}
                />
              ) : null}

              {traceViewTab === 'graph' ? (
                <>
              {traceComparison ? (
                <section className="trace-comparison" aria-label="예상 흐름과 실제 Trace 비교">
                  <div>
                    <span className="section-label">정적 예상 단계</span>
                    {traceComparison.expected.map((item) => (
                      <p key={item.id} className={item.matched ? 'is-matched' : 'is-missing'}>
                        <strong>{item.label}</strong>
                        <span>{item.matched ? '실제 호출 확인' : '실행되지 않은 예상 단계'}</span>
                      </p>
                    ))}
                  </div>
                  <div>
                    <span className="section-label">실제 OpenTelemetry span</span>
                    {traceComparison.actual.map((item) => (
                      <p key={item.id} className={item.expected ? 'is-matched' : 'is-unexpected'}>
                        <strong>{item.label}</strong>
                        <span>{item.expected ? '예상 흐름과 일치' : '예상에 없던 실제 호출'}</span>
                      </p>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className={`flow-route${traceDetail.source === 'OPENTELEMETRY' ? ' flow-route--spans' : ''}`}>
                {graph.states.map((state) => (
                  <button
                    key={state.id}
                    type="button"
                    className={`route-step route-step--${state.status.toLowerCase()}${state.active ? ' is-active' : ''}${selectedNode?.id === state.id ? ' is-selected' : ''}`}
                    onClick={() => setSelectedNodeId(state.id)}
                  >
                    <span>{state.label}</span>
                    <strong>{state.active ? `${state.durationMs}ms` : '대기'}</strong>
                  </button>
                ))}
              </div>

              <div className="graph-toolbar">
                <div>
                  <span>{traceDetail.events.length}개 실행 이벤트</span>
                  <strong>{activeRoute.length > 0 ? activeRoute.map((state) => state.label).join(' → ') : '실행된 경로가 없습니다'}</strong>
                </div>
                <div className="legend-strip" aria-label="그래프 상태 범례">
                  <span className="legend-chip legend-chip--success">성공</span>
                  <span className="legend-chip legend-chip--warning">주의</span>
                  <span className="legend-chip legend-chip--error">실패</span>
                  <span className="legend-chip legend-chip--idle">대기</span>
                </div>
              </div>

              <div className="graph-surface">
                {traceDetail.source === 'SAMPLE' ? (
                  <div className="graph-lanes" aria-hidden="true">
                    <span>client</span>
                    <span>application</span>
                    <span>cache</span>
                    <span>data</span>
                    <span>response</span>
                  </div>
                ) : null}
                <ReactFlow
                  key={traceDetail?.traceId ?? 'empty-flow'}
                  fitView
                  fitViewOptions={{ padding: 0.16 }}
                  onInit={(instance) => {
                    flowInstanceRef.current = instance
                    window.requestAnimationFrame(() => {
                      instance.fitView({ padding: 0.14, duration: 120, includeHiddenNodes: true })
                    })
                    window.setTimeout(() => {
                      instance.fitView({ padding: 0.14, duration: 0, includeHiddenNodes: true })
                    }, 180)
                  }}
                  nodes={graph.nodes}
                  edges={graph.edges}
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  nodesConnectable={false}
                  nodesDraggable={false}
                  elementsSelectable
                  minZoom={0.35}
                  maxZoom={1.35}
                  proOptions={{ hideAttribution: true }}
                >
                  <Controls showInteractive={false} />
                  <Background gap={20} size={1} />
                </ReactFlow>
              </div>
                </>
              ) : null}

              {traceViewTab === 'events' ? (
                <section className="trace-event-table" aria-label="시간순 Trace 이벤트">
                  <header>
                    <span>시작</span>
                    <span>Span</span>
                    <span>구성 요소</span>
                    <span>소요 시간</span>
                    <span>상태</span>
                  </header>
                  {orderedTraceEvents.map((event) => (
                    <button
                      key={event.eventId}
                      type="button"
                      className={selectedNode?.id === (event.spanId ?? event.component) ? 'is-selected' : ''}
                      onClick={() => setSelectedNodeId(event.spanId ?? event.component)}
                    >
                      <span>{new Date(event.startedAt).toLocaleTimeString('ko-KR', { hour12: false, fractionalSecondDigits: 3 })}</span>
                      <strong>{event.eventType}</strong>
                      <span>{event.component}</span>
                      <span>{event.durationMs}ms</span>
                      <StatusBadge tone={event.status === 'SUCCESS' ? 'success' : event.status === 'WARNING' ? 'warning' : 'error'}>
                        {EVENT_STATUS_LABEL[event.status]}
                      </StatusBadge>
                    </button>
                  ))}
                </section>
              ) : null}
                </>
              )}
            </div>
          </TraceView>
        </section>

        <aside className="right-panel inspector-rail">
          <ProjectView active={activeView === 'project'}>
            <div className="panel-card inspector-workbench">
              <div className="panel-header">
                <div>
                  <span className="section-label">상세 정보</span>
                  <h2>분석 근거</h2>
                  <p>{hasDetectedDomains ? `${selectedDomain.name} 도메인에 연결된 코드 근거입니다.` : projectStatusContent.headerSummary}</p>
                </div>
                <StatusBadge tone="neutral">{hasDetectedDomains ? selectedDomain.name : projectStructure.projectName}</StatusBadge>
              </div>
              <div className="evidence-scope-strip">
                <span><strong>{selectedDomain.layers.flatMap((layer) => layer.classes).length}</strong>개 클래스</span>
                <span><strong>{selectedDomain.infrastructure.length}</strong>개 인프라</span>
              </div>

              {analysisTarget === 'external' && projectStructure.analysisStatus === 'SUCCESS' ? (
                <details className="inspector-disclosure">
                  <summary>
                    <span>
                      <strong>실행 Trace 설정</strong>
                      <small>Java Agent 재실행 명령</small>
                    </span>
                    <StatusBadge tone={demoTraceReady || externalTraceVerified ? 'success' : profileState === 'error' || instrumentationStatus.state === 'error' ? 'error' : instrumentationProfile ? 'warning' : 'neutral'}>
                      {demoTraceReady
                        ? '데모 Trace 설정됨'
                        : instrumentationStatus.state === 'error'
                          ? '상태 확인 실패'
                          : externalTraceVerified
                            ? 'Span 수신 확인'
                            : instrumentationProfile
                              ? 'Agent 확인 전'
                              : '실행 Trace 설정 필요'}
                    </StatusBadge>
                  </summary>
                  <div className="instrumentation-setup">
                    {demoTraceReady ? (
                      <p className="instrumentation-setup__intro">
                        Docker 데모에 Java Agent와 OTLP 수집 주소가 설정되어 있습니다. API 요청으로 실제 span 수신을 확인합니다.
                      </p>
                    ) : (
                      <>
                        <p className="instrumentation-setup__intro">
                          소스 수정 없이 Java Agent로 대상 앱을 재시작합니다.
                        </p>
                        <label className="field">
                          <span>OpenTelemetry Java Agent JAR</span>
                          <input value={agentPath} onChange={(event) => setAgentPath(event.target.value)} />
                        </label>
                        <label className="field">
                          <span>StackFlow 수집 주소</span>
                          <input value={collectorBaseUrl} onChange={(event) => setCollectorBaseUrl(event.target.value)} />
                        </label>
                        <div className="instrumentation-setup__actions">
                          <button type="button" onClick={() => void generateInstrumentationProfile()} disabled={profileState === 'loading'}>
                            <ScanSearch size={15} aria-hidden="true" />
                            {profileState === 'loading' ? '설정 생성 중' : '실행 명령 생성'}
                          </button>
                          <a href="https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases" target="_blank" rel="noreferrer">
                            공식 Agent 다운로드
                          </a>
                        </div>
                        <p className={profileState === 'error' ? 'external-error' : 'empty-copy'}>{profileMessage}</p>
                        {instrumentationProfile ? (
                          <div className={`instrumentation-connection instrumentation-connection--${instrumentationStatus.state}`}>
                            <strong>
                              {instrumentationStatus.state === 'received' ? 'Agent span 수신 확인' : instrumentationStatus.state === 'error' ? '상태를 확인하지 못했습니다' : 'Agent 확인 전'}
                            </strong>
                            <p>
                              {instrumentationStatus.state === 'received'
                                ? `${instrumentationStatus.status?.serviceName ?? instrumentationProfile.serviceName} · 마지막 수신 ${formatProfileLastSeen(instrumentationStatus.status?.lastSeenAt)}`
                                : instrumentationStatus.state === 'error'
                                  ? '상태 조회가 중단됐습니다. backend와 profile 만료 여부를 확인하세요.'
                                  : '명령을 실행해 앱을 재시작한 뒤 API 요청 화면에서 요청을 보내세요.'}
                            </p>
                            {instrumentationStatus.state === 'error' ? (
                              <button type="button" onClick={instrumentationStatus.retry}>다시 확인</button>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    )}
                    {instrumentationProfile && instrumentationCommand ? (
                      <div className="instrumentation-profile">
                        <div className="evidence-grid">
                          <span><strong>Build</strong>{instrumentationProfile.buildTool}</span>
                          <span><strong>계측 클래스</strong>{instrumentationProfile.instrumentedClasses.length}개</span>
                          <span><strong>public method</strong>{instrumentationProfile.instrumentedMethodCount}개</span>
                        </div>
                        <pre className="instrumentation-command">{instrumentationCommand}</pre>
                        <details>
                          <summary>계측 대상과 환경 변수 보기</summary>
                          <p>{instrumentationProfile.instrumentedClasses.join('\n') || '추가 method 계측 대상 없음'}</p>
                          <pre className="instrumentation-command">{Object.entries(instrumentationProfile.environment).map(([key, value]) => `${key}=${value}`).join('\n')}</pre>
                        </details>
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}

              <details className="inspector-disclosure">
                <summary>
                  <span><strong>클래스 근거</strong><small>역할별로 분류된 코드</small></span>
                  <strong>{selectedDomain.layers.flatMap((layer) => layer.classes).length}개</strong>
                </summary>
                <LayerEvidenceList groups={domainLayerGroups} emptyMessage="이 도메인에 확실히 연결된 클래스가 없습니다." />
              </details>

              <details className="inspector-disclosure project-common-evidence">
                <summary>
                  <span><strong>프로젝트 공통 클래스</strong><small>도메인 미귀속 근거</small></span>
                  <strong>{commonClassCount}개</strong>
                </summary>
                <p>특정 도메인 관계가 확실하지 않은 클래스입니다.</p>
                <LayerEvidenceList groups={commonLayerGroups} emptyMessage="도메인 밖에 남은 공통 클래스가 없습니다." />
              </details>

              <details className="inspector-disclosure coverage-evidence">
                <summary>
                  <span>
                    <strong>분석 범위와 누락 가능성</strong>
                    <small>source root {projectStructure.analysisCoverage.sourceRoots.length}개 · Java {projectStructure.analysisCoverage.scannedJavaFiles}개</small>
                  </span>
                  <StatusBadge tone={projectStructure.analysisCoverage.warnings.length > 0 ? 'warning' : 'success'}>
                    {projectStructure.analysisCoverage.warnings.length > 0 ? `경고 ${projectStructure.analysisCoverage.warnings.length}개` : '경고 없음'}
                  </StatusBadge>
                </summary>
                <div className="coverage-evidence__body">
                  <div className="coverage-metrics" aria-label="분석 범위 수치">
                    <span><strong>{projectStructure.analysisCoverage.scannedJavaFiles}</strong>Java 파일</span>
                    <span><strong>{projectStructure.analysisCoverage.controllerCandidates}</strong>Controller 후보</span>
                    <span><strong>{projectStructure.analysisCoverage.detectedControllers}</strong>감지 Controller</span>
                    <span><strong>{projectStructure.analysisCoverage.detectedEndpoints}</strong>감지 API</span>
                  </div>
                  <div className="coverage-source-roots">
                    <strong>탐색한 source root</strong>
                    {projectStructure.analysisCoverage.sourceRoots.length > 0 ? (
                      <ul>{projectStructure.analysisCoverage.sourceRoots.map((root) => <li key={root}>{root}</li>)}</ul>
                    ) : <p>감지된 Java source root가 없습니다.</p>}
                  </div>
                  {projectStructure.analysisCoverage.warnings.length > 0 ? (
                    <div className="coverage-warnings">
                      <strong>누락 가능성</strong>
                      <ul>{projectStructure.analysisCoverage.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                    </div>
                  ) : <p className="coverage-complete">현재 지원 범위에서 별도 경고가 없습니다.</p>}
                </div>
              </details>

              <details className="inspector-disclosure source-evidence">
                <summary><span><strong>소스 분석 근거</strong><small>경로·패키지·탐지 규칙</small></span></summary>
                <dl>
                  <div><dt>프로젝트</dt><dd>{projectStructure.projectName} · {projectStructure.framework}</dd></div>
                  <div><dt>소스 루트</dt><dd>{projectStructure.sourceRoot || '-'}</dd></div>
                  <div><dt>소스 파일</dt><dd>{selectedDomain.controllers.map((controller) => controller.sourceFile).join(' / ') || '-'}</dd></div>
                  <div><dt>패키지</dt><dd>{selectedDomain.packageRoots.join(' / ') || '-'}</dd></div>
                  <div><dt>Layer 근거</dt><dd>{selectedDomain.layers.map((layer) => layer.evidence).join(' / ') || '-'}</dd></div>
                  <div><dt>Infra 근거</dt><dd>{selectedDomain.infrastructureDetails.map((item) => `${item.name}: ${item.evidence}`).join(' / ') || '-'}</dd></div>
                </dl>
              </details>
            </div>
          </ProjectView>

          <RequestView active={activeView === 'api'}>
            <div className="panel-card inspector-workbench">
              <div className="panel-header">
                <div>
                  <span className="section-label">선택한 API 근거</span>
                  <h2>{selectedApi.label}</h2>
                  <p>{selectedApi.description}</p>
                </div>
                <span className={`pill pill--inline ${runtimeSupported ? 'pill--success' : 'pill--warning'}`}>
                  {runtimeModeLabel}
                </span>
              </div>
              <div className="insight-list">
                <article>
                  <span>Handler</span>
                  <strong>{selectedApi.controller}.{selectedApi.handler}</strong>
                  <p>{selectedApiMethodLabel} {selectedApi.pathTemplate}</p>
                </article>
                <article>
                  <span>예상 경로</span>
                  <strong>{estimatedFlow.map((step) => step.label).join(' → ')}</strong>
                  <p>{hasIntegrationBoundary ? 'UseCase, Gateway, Client를 분리해 외부 연동 경계를 표시합니다.' : '감지된 domain layer의 클래스 이름을 기준으로 구성합니다.'}</p>
                </article>
                <article>
                  <span>실행 가능 범위</span>
                  <strong>{runtimeSupported || externalTraceVerified ? '실제 Trace 가능' : externalTraceConfigured ? 'Agent 확인 전' : !selectedApi.methodSpecified ? '정적 분석만 가능' : externalRunnable ? 'Agent 설정 필요' : hasIntegrationBoundary ? '외부 연동 구조만 표시' : '정적 분석만 가능'}</strong>
                  <p>{runtimeSupported ? '요청을 실행하면 Trace 탭에서 실제 흐름을 확인할 수 있습니다.' : externalTraceVerified ? 'Agent span 수신 이력이 있으며 traceparent로 실제 흐름을 연결합니다.' : externalTraceConfigured ? '앱을 Agent로 재시작한 뒤 이 API를 요청하면 최초 span 수신을 확인합니다.' : !selectedApi.methodSpecified ? 'Controller method에 HTTP verb가 명시되지 않았습니다.' : externalRunnable ? '프로젝트 구조에서 실행 명령을 생성하고 대상 앱을 재시작하세요.' : hasIntegrationBoundary ? '이 샘플 API는 연동 계층을 정적으로 설명합니다.' : '이 API는 현재 정적 분석만 제공합니다.'}</p>
                </article>
              </div>
              {externalRunnable ? (
                <section className="inspector-section response-card external-response-card">
                  <div className="section-row">
                    <span className="section-label">외부 HTTP 결과</span>
                    <span className={`pill pill--inline pill--${(externalResponse?.resultStatus ?? 'idle').toLowerCase()}`}>
                      {externalResponse ? `HTTP ${externalResponse.httpStatus || '-'}` : '대기'}
                    </span>
                  </div>
                  {externalResponse ? (
                    <>
                      <article className="evidence-block evidence-block--request">
                        <header>
                          <span>보낸 요청</span>
                          <strong>{externalRequestSnapshot?.method ?? (selectedApi.methodSpecified ? selectedApi.method : selectedApiMethodLabel)}</strong>
                        </header>
                        <p>{externalRequestSnapshot?.targetUrl ?? externalTargetPreview}</p>
                        <div className="evidence-grid">
                          <span>
                            <strong>Query</strong>
                            {countEnabledEntries(externalRequestSnapshot?.queryParams ?? [])}
                          </span>
                          <span>
                            <strong>Header</strong>
                            {countEnabledEntries(externalRequestSnapshot?.headers ?? [])}
                          </span>
                          <span>
                            <strong>Body</strong>
                            {externalRequestSnapshot?.requestBody ? '사용' : '없음'}
                          </span>
                        </div>
                      </article>
                      <article className="evidence-block evidence-block--response">
                        <header>
                          <span>받은 응답</span>
                          <strong>HTTP {externalResponse.httpStatus || '-'}</strong>
                        </header>
                        <div className="evidence-grid">
                          <span>
                            <strong>소요 시간</strong>
                            {externalResponse.durationMs}ms
                          </span>
                          <span>
                            <strong>Content-Type</strong>
                            {externalResponse.contentType || '-'}
                          </span>
                          {externalResponse.traceId ? (
                            <span>
                              <strong>Trace</strong>
                              {externalResponse.traceId.slice(0, 8)} · {TRACE_COLLECTION_STATUS_LABEL[traceCollectionStatus]}
                            </span>
                          ) : null}
                        </div>
                      </article>
                      {externalResponse.errorMessage ? (
                        <p className="external-error">{externalResponse.errorMessage}</p>
                      ) : null}
                      {formattedExternalResponseBody ? (
                        <pre className="response-body response-body--external">{formattedExternalResponseBody}</pre>
                      ) : (
                        <p className="empty-copy">대상 API가 빈 응답 본문을 반환했습니다.</p>
                      )}
                    </>
                  ) : (
                    <p className="empty-copy">대상 기본 URL을 입력하고 요청을 실행하면 응답을 확인할 수 있습니다.</p>
                  )}
                </section>
              ) : null}
              {!externalRunnable ? (
                <section className="inspector-section response-card external-response-card">
                  <div className="section-row">
                    <span className="section-label">응답</span>
                    <span className={`pill pill--inline pill--${(traceDetail?.resultStatus ?? 'idle').toLowerCase()}`}>
                      {traceDetail ? `HTTP ${traceDetail.httpStatus || '-'}` : '대기'}
                    </span>
                  </div>
                  {formattedResponseBody ? (
                    <>
                      <article className="evidence-block evidence-block--response">
                        <header>
                          <span>받은 응답</span>
                          <strong>{traceDetail?.durationMs ?? 0}ms</strong>
                        </header>
                        <div className="evidence-grid">
                          <span>
                            <strong>Trace</strong>
                            {traceDetail?.traceId.slice(0, 8) ?? '-'}
                          </span>
                          <span>
                            <strong>이벤트</strong>
                            {traceDetail?.events.length ?? 0}
                          </span>
                          <span>
                            <strong>결과</strong>
                            {traceDetail ? EVENT_STATUS_LABEL[traceDetail.resultStatus] : '대기'}
                          </span>
                        </div>
                      </article>
                      <pre className="response-body response-body--external">{formattedResponseBody}</pre>
                    </>
                  ) : (
                    <p className="empty-copy">선택한 API를 실행하면 JSON 응답이 표시됩니다.</p>
                  )}
                </section>
              ) : null}
            </div>
          </RequestView>

          <TraceView active={activeView === 'runtime'}>
            <>
              <div className="panel-card inspector-workbench">
                <div className="panel-header">
                  <div>
                    <span className="section-label">실행 근거</span>
                    <h2>{inspectorEvent ? inspectorEvent.component : 'Trace 대기'}</h2>
                    <p>{inspectorEvent ? inspectorEvent.eventType : 'API 요청을 실행한 뒤 그래프 node를 선택하세요.'}</p>
                  </div>
                  <span className={`pill pill--inline pill--${(traceDetail?.resultStatus ?? 'success').toLowerCase()}`}>
                    HTTP {traceDetail?.httpStatus || '-'}
                  </span>
                </div>

                <div className="runtime-meter runtime-meter--compact">
                  <span>{traceDetail ? `${traceDetail.durationMs}ms` : '0ms'}</span>
                  <span>{activeNodeCount}개 활성 node</span>
                </div>

                <section className="inspector-section response-card">
                  <div className="section-row">
                    <span className="section-label">응답 JSON</span>
                    <span>{traceDetail ? EVENT_STATUS_LABEL[traceDetail.resultStatus] : '대기'}</span>
                  </div>
                  {formattedResponseBody ? (
                    <pre className="response-body">{formattedResponseBody}</pre>
                  ) : (
                    <p className="empty-copy">요청을 실행하면 응답 본문이 표시됩니다.</p>
                  )}
                </section>

                <section className="inspector-section inspector-card">
                  <div className="section-row">
                    <span className="section-label">선택한 node 근거</span>
                    {selectedNode ? (
                      <span className={`pill pill--inline pill--${selectedNode.status.toLowerCase()}`}>
                        {EVENT_STATUS_LABEL[selectedNode.status]}
                      </span>
                    ) : null}
                  </div>
                  {!selectedNode ? (
                    <p className="empty-copy">그래프에서 확인할 실행 node를 선택하세요.</p>
                  ) : (
                    <div className="detail-stack">
                      <div className="detail-summary">
                        <strong>{selectedNode.label}</strong>
                        <span>총 {selectedNode.durationMs}ms</span>
                      </div>
                      <div className="detail-grid">
                        <div>
                          <span>Trace ID</span>
                          <strong>{traceDetail?.traceId ?? '-'}</strong>
                        </div>
                        <div>
                          <span>호출 횟수</span>
                          <strong>{selectedNode.visits.length}</strong>
                        </div>
                      </div>
                      <div className="visit-list">
                        {selectedNode.visits.length === 0 ? (
                          <p className="empty-copy">현재 Trace에서 이 node는 호출되지 않았습니다.</p>
                        ) : (
                          selectedNode.visits.map((event) => (
                            <article key={event.eventId} className="visit-card">
                              <header>
                                <strong>{event.eventType}</strong>
                                <span className={`pill pill--inline pill--${event.status.toLowerCase()}`}>{EVENT_STATUS_LABEL[event.status]}</span>
                              </header>
                              <dl>
                                <div>
                                  <dt>소요 시간</dt>
                                  <dd>{event.durationMs}ms</dd>
                                </div>
                                <div>
                                  <dt>오류 유형</dt>
                                  <dd>{event.errorType ?? '-'}</dd>
                                </div>
                                <div>
                                  <dt>오류 메시지</dt>
                                  <dd>{event.errorMessage ?? '-'}</dd>
                                </div>
                                {event.spanId ? (
                                  <div>
                                    <dt>Span / Parent</dt>
                                    <dd>{event.spanId} / {event.parentSpanId ?? 'root'}</dd>
                                  </div>
                                ) : null}
                                {event.serviceName ? (
                                  <div>
                                    <dt>Service / Kind</dt>
                                    <dd>{event.serviceName} / {event.spanKind ?? '-'}</dd>
                                  </div>
                                ) : null}
                              </dl>
                              <div className="metadata-list">
                                {Object.keys(event.metadata).length === 0 ? (
                                  <span className="metadata-item">metadata 없음</span>
                                ) : (
                                  Object.entries(event.metadata).map(([key, value]) => (
                                    <span key={key} className="metadata-item">
                                      {key}: {value}
                                    </span>
                                  ))
                                )}
                              </div>
                            </article>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </section>
              </div>

              <div className="panel-card timeline-card timeline-card--compact">
                <div className="panel-header">
                  <div>
                    <h2>실행 이벤트</h2>
                    <p>발생 시간순으로 표시합니다.</p>
                  </div>
                  <span>{recentEvents.length}</span>
                </div>
                <div className="timeline-list">
                {recentEvents.length === 0 ? (
                  <p className="empty-copy">아직 수집된 실행 이벤트가 없습니다.</p>
                ) : (
                  recentEvents.map((event, index) => (
                    <article key={event.eventId} className="timeline-item">
                      <div className="timeline-item__marker">
                        <span>{index + 1}</span>
                      </div>
                      <div className="timeline-item__body">
                        <header>
                          <strong>{event.component}</strong>
                          <span className={`pill pill--inline pill--${event.status.toLowerCase()}`}>{EVENT_STATUS_LABEL[event.status]}</span>
                        </header>
                        <p>{event.eventType}</p>
                        <div className="timeline-item__meta">
                          <span>{event.durationMs}ms</span>
                          <span>{new Date(event.startedAt).toLocaleTimeString()}</span>
                          <span>{event.errorType ?? '오류 없음'}</span>
                        </div>
                      </div>
                    </article>
                  ))
                )}
                </div>
              </div>
            </>
          </TraceView>
        </aside>
      </section>
    </AppShell>
  )
}
