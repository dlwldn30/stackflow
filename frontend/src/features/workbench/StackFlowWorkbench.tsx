import { Background, Controls, ReactFlow } from '@xyflow/react'
import { AlertCircle, ArrowRight, Boxes, Braces, CheckCircle2, ChevronRight, Database, FolderOpen, Network, Route, ScanSearch } from 'lucide-react'
import '../../App.css'
import { StatusBadge } from '../../components/StatusBadge'
import { TraceWaterfall } from '../../components/TraceWaterfall'
import { EVENT_STATUS_LABEL, PROJECT_STATUS_LABEL } from '../../ui/copy'
import { AppShell } from './components/AppShell'
import { useWorkbenchController } from './hooks/useWorkbenchController'
import {
  formatProfileLastSeen,
  getApiMethodBadgeClassName,
  getApiMethodLabel,
  getDomainDescription,
  getDomainDisplayMode,
} from './workbenchModel'
import { LayerEvidenceList, ProjectView } from './views/ProjectView'
import { EndpointExplorer } from './views/EndpointExplorer'
import { RequestComposer } from './views/RequestComposer'
import { RequestEvidencePanel } from './views/RequestEvidencePanel'
import { RequestFlowPanel } from './views/RequestFlowPanel'
import { RequestView } from './views/RequestView'
import './views/RequestView.css'
import { TraceHistoryPanel } from './views/TraceHistoryPanel'
import { TraceInspector } from './views/TraceInspector'
import { TraceOutcomeSummary } from './views/TraceOutcomeSummary'
import { TraceView } from './views/TraceView'
import './views/TraceView.css'

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
    selectedApiId,
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
    endpointSearch,
    setEndpointSearch,
    queryParams,
    requestHeaders,
    requestBody,
    setRequestBody,
    requestBodyError,
    setRequestBodyError,
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
    traceHistoryFilter,
    setTraceHistoryFilter,
    traceCollectionStatus,
    flowInstanceRef,
    graph,
    waterfall,
    orderedTraceEvents,
    primaryFailureEvent,
    primaryFailureNodeId,
    selectedNode,
    inspectorEvent,
    primaryFailureLabel,
    traceOutcome,
    failurePropagationPath,
    filteredRecentTraces,
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
                  {activeView === 'project' ? '프로젝트 탐색' : activeView === 'api' ? 'API 요청' : 'Trace 기록'}
                </span>
                <h2>
                  {activeView === 'project' ? '프로젝트 열기' : activeView === 'api' ? selectedApi.label : '최근 Trace'}
                </h2>
                <p>
                  {activeView === 'project'
                    ? 'Spring Boot 루트 폴더를 선택하세요.'
                    : activeView === 'api'
                      ? '요청을 작성하고 응답을 확인하세요.'
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
              <EndpointExplorer
                apiCatalogCount={apiCatalog.length}
                domainName={selectedDomain.name}
                domainApiCount={domainApis.length}
                apiScope={apiScope}
                endpointSearch={endpointSearch}
                visibleApis={visibleApis}
                selectedApiId={selectedApiId}
                onScopeChange={setApiScope}
                onSearchChange={setEndpointSearch}
                onSelectApi={selectApi}
              />
              <RequestComposer
                selectedApi={selectedApi}
                domainName={selectedDomain.name}
                methodLabel={selectedApiMethodLabel}
                methodClassName={selectedApiMethodClassName}
                runtimeModeLabel={runtimeModeLabel}
                runtimeSupported={runtimeSupported}
                externalRunnable={externalRunnable}
                externalTraceConfigured={externalTraceConfigured}
                externalTraceVerified={externalTraceVerified}
                analyzeOnly={analyzeOnly}
                hasDetectedApis={hasDetectedApis}
                targetBaseUrl={targetBaseUrl}
                externalPath={externalPath}
                externalTargetPreview={externalTargetPreview}
                productId={productId}
                scenario={scenario}
                requestOptionTab={requestOptionTab}
                queryParams={queryParams}
                requestHeaders={requestHeaders}
                requestBody={requestBody}
                requestBodyError={requestBodyError}
                bodyAllowed={bodyAllowed}
                requestState={requestState}
                requestMessage={requestMessage}
                externalResponse={externalResponse}
                traceDetail={traceDetail}
                traceCollectionStatus={traceCollectionStatus}
                formattedExternalResponseBody={formattedExternalResponseBody}
                formattedResponseBody={formattedResponseBody}
                onBackProject={() => setActiveView('project')}
                onTargetBaseUrlChange={setTargetBaseUrl}
                onProductIdChange={setProductId}
                onScenarioChange={setScenario}
                onRequestOptionTabChange={setRequestOptionTab}
                onRequestBodyChange={setRequestBody}
                onClearRequestBodyError={() => setRequestBodyError(null)}
                onAddQueryParam={addQueryParam}
                onAddRequestHeader={addRequestHeader}
                onUpdateQueryParam={updateQueryParam}
                onUpdateRequestHeader={updateRequestHeader}
                onRemoveQueryParam={removeQueryParam}
                onRemoveRequestHeader={removeRequestHeader}
                onRunRequest={() => void runRequest()}
                onOpenTrace={() => setActiveView('runtime')}
              />
            </RequestView>
          </div>

          <TraceView active={activeView === 'runtime'}>
            <TraceHistoryPanel
              traces={filteredRecentTraces}
              totalCount={recentTraces.length}
              filter={traceHistoryFilter}
              selectedTraceId={traceDetail?.traceId ?? null}
              onFilterChange={setTraceHistoryFilter}
              onSelectTrace={(traceId) => void selectTrace(traceId)}
            />
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
              <RequestFlowPanel
                methodLabel={selectedApiMethodLabel}
                path={selectedApi.pathTemplate}
                estimatedFlow={estimatedFlow}
                runtimeSupported={runtimeSupported}
                methodSpecified={selectedApi.methodSpecified}
                externalRunnable={externalRunnable}
                externalTraceConfigured={externalTraceConfigured}
                externalTraceVerified={externalTraceVerified}
                hasIntegrationBoundary={hasIntegrationBoundary}
              />
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
              <TraceOutcomeSummary
                trace={traceDetail}
                outcome={traceOutcome ?? 'success'}
                failureEvent={primaryFailureEvent}
                failureLabel={primaryFailureLabel}
                propagationPath={failurePropagationPath}
                onInspectFailure={() => setSelectedNodeId(primaryFailureNodeId)}
              />

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
                  primaryFailureSpanId={primaryFailureNodeId}
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
            <RequestEvidencePanel
              selectedApi={selectedApi}
              methodLabel={selectedApiMethodLabel}
              runtimeModeLabel={runtimeModeLabel}
              runtimeSupported={runtimeSupported}
              externalRunnable={externalRunnable}
              externalTraceConfigured={externalTraceConfigured}
              externalTraceVerified={externalTraceVerified}
              hasIntegrationBoundary={hasIntegrationBoundary}
              estimatedFlow={estimatedFlow}
            />
          </RequestView>

          <TraceView active={activeView === 'runtime'}>
            <TraceInspector
              trace={traceDetail}
              selectedNode={selectedNode}
              selectedEvent={inspectorEvent}
              primaryFailureEvent={primaryFailureEvent}
              primaryFailureLabel={primaryFailureLabel}
              formattedResponseBody={formattedResponseBody}
              onInspectPrimaryFailure={() => setSelectedNodeId(primaryFailureNodeId)}
            />
          </TraceView>
        </aside>
      </section>
    </AppShell>
  )
}
