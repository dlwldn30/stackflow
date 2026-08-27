import { AlertCircle, ArrowRight, Boxes, Braces, CheckCircle2, ChevronRight, Database, FolderOpen, Network, ScanSearch, Server } from 'lucide-react'
import { StatusBadge } from '../../../components/StatusBadge'
import { PROJECT_STATUS_LABEL } from '../../../ui/copy'
import type { WorkbenchController } from '../hooks/useWorkbenchController'
import {
  formatProfileLastSeen,
  getApiMethodBadgeClassName,
  getApiMethodLabel,
  getDomainDescription,
  getDomainDisplayMode,
} from '../workbenchModel'
import './ProjectView.css'

type ProjectViewProps = {
  model: WorkbenchController['projectView']
}

export function ProjectView({ model }: ProjectViewProps) {
  const {
    projectPath, setProjectPath, folderPickerState, setFolderPickerState,
    folderPickerMessage, apiCatalog, projectStructure, analysisTarget,
    analysisState, analysisMessage, setSelectedApiId,
    selectedDomainId, agentPath, setAgentPath, collectorBaseUrl,
    setCollectorBaseUrl, instrumentationProfile, profileState, profileMessage,
    instrumentationStatus, analyzeProjectPath, selectLocalProjectFolder,
    generateInstrumentationProfile, selectDomain, setActiveView,
    setExternalResponse, selectedDomain, hasDetectedDomains, hasDetectedApis,
    projectMetrics, domainLayerGroups, domainStructurePath,
    supportingDomainGroups, commonLayerGroups, commonClassCount, selectedApi,
    selectedApiMethodLabel, selectedDomainDisplayMode,
    controllerBasePathSummary, projectStatusContent, demoTraceReady,
    externalTraceVerified, instrumentationCommand,
    workspaceServices, selectedService, workspaceMetrics, receivedAgentCount,
    workspaceProfiles, workspaceInstrumentationStatuses, selectService,
  } = model

  return (
    <section className="workspace workspace--project">
      <aside className="left-panel control-rail">
        <div className="panel-card control-card">
          <div className="panel-header control-header">
            <div>
              <span className="section-label">프로젝트 탐색</span>
              <h2>프로젝트 열기</h2>
              <p>Spring Boot 루트 폴더를 선택하세요.</p>
            </div>
            <StatusBadge tone={analysisTarget === 'external' ? 'success' : 'info'}>
              {analysisTarget === 'external' ? '외부 프로젝트' : '샘플'}
            </StatusBadge>
          </div>
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
                          ? workspaceServices.length > 0
                            ? `서비스 ${workspaceMetrics.services}개 · 도메인 ${workspaceMetrics.domains}개 · API ${workspaceMetrics.apis}개`
                            : `도메인 ${projectStructure.domains.length}개 · API ${apiCatalog.length}개`
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

              {workspaceServices.length > 0 ? (
                <div className="service-compact">
                  <div className="section-row service-compact__head">
                    <span className="section-label">서비스</span>
                    <span>{workspaceServices.length}개 JVM</span>
                  </div>
                  <div className="service-list">
                    {workspaceServices.map((service, index) => {
                      const status = workspaceInstrumentationStatuses[service.serviceId]
                      return (
                        <button
                          key={service.serviceId}
                          type="button"
                          className={`service-item service-item--${index % 3}${selectedService?.serviceId === service.serviceId ? ' is-selected' : ''}`}
                          onClick={() => selectService(service)}
                        >
                          <Server size={16} aria-hidden="true" />
                          <span>
                            <strong>{service.structure.projectName}</strong>
                            <small>{service.relativePath} · API {service.structure.analysisCoverage.detectedEndpoints}개</small>
                          </span>
                          <StatusBadge tone={status?.connectionStatus === 'SPAN_RECEIVED' || demoTraceReady ? 'success' : 'neutral'}>
                            {status?.connectionStatus === 'SPAN_RECEIVED' ? 'Span 확인' : demoTraceReady ? '데모 설정' : PROJECT_STATUS_LABEL[service.structure.analysisStatus]}
                          </StatusBadge>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

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

        </div>
      </aside>
      <section className="graph-panel">
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
                      <strong
                        title={controllerBasePathSummary.fullLabel}
                        aria-label={`Base path: ${controllerBasePathSummary.fullLabel}`}
                      >
                        {controllerBasePathSummary.label}
                      </strong>
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
                      selectedDomain.endpoints.map((endpoint) => {
                        const endpointApi = apiCatalog.find((api) =>
                          api.pathTemplate === endpoint.path
                            && api.controller === endpoint.controller
                            && api.handler === endpoint.handler)
                        const endpointId = endpointApi?.id ?? endpoint.id
                        return (
                        <button
                          key={endpointId}
                          type="button"
                          className={`map-endpoint-card${selectedApi.id === endpointId ? ' is-selected' : ''}`}
                          onClick={() => {
                            setSelectedApiId(endpointId)
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
                        )
                      })
                    ) : (
                      <p className="empty-copy">{projectStatusContent.emptyEndpointMessage}</p>
                    )}
                  </div>
                </section>
              </div>
            </div>

      </section>
      <aside className="right-panel inspector-rail">
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
                      <small>{workspaceServices.length > 1 ? demoTraceReady ? `${workspaceServices.length}개 Agent 데모 설정됨` : `${workspaceServices.length}개 중 ${receivedAgentCount}개 Agent span 수신` : 'Java Agent 재실행 명령'}</small>
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
                    {instrumentationProfile && instrumentationCommand && workspaceProfiles.length <= 1 ? (
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
                    {workspaceProfiles.length > 1 ? (
                      <div className="workspace-profile-list" aria-label="서비스별 Agent 실행 설정">
                        {workspaceProfiles.map((item, index) => {
                          const status = workspaceInstrumentationStatuses[item.serviceId]
                          const command = item.profile.commands[item.profile.buildTool.toLowerCase()] ?? item.profile.commands.jar
                          return (
                            <details key={item.serviceId} className={`workspace-profile workspace-profile--${index % 3}`}>
                              <summary>
                                <span><strong>{item.profile.serviceName}</strong><small>{item.relativePath}</small></span>
                                <StatusBadge tone={status?.connectionStatus === 'SPAN_RECEIVED' ? 'success' : 'warning'}>
                                  {status?.connectionStatus === 'SPAN_RECEIVED' ? 'Span 수신 확인' : 'Agent 확인 전'}
                                </StatusBadge>
                              </summary>
                              <p className="workspace-profile__directory">실행 위치: {item.workingDirectory}</p>
                              <pre className="instrumentation-command">{command}</pre>
                            </details>
                          )
                        })}
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

      </aside>
    </section>
  )
}

export function LayerEvidenceList({ groups, emptyMessage }: {
  groups: WorkbenchController['projectView']['domainLayerGroups']
  emptyMessage: string
}) {
  const populatedGroups = groups.filter((group) => group.classes.length > 0)
  if (populatedGroups.length === 0) return <p className="empty-copy">{emptyMessage}</p>

  return (
    <div className="layer-evidence-list">
      {populatedGroups.map((group) => {
        const previewClasses = group.classes.slice(0, 5)
        const remainingClasses = group.classes.slice(5)
        return (
          <details key={group.id} className="layer-evidence-group">
            <summary><span>{group.label}</span><strong>{group.classes.length}</strong></summary>
            <small>{group.layerNames.join(' · ')}</small>
            <div className="layer-class-list">
              {previewClasses.map((className) => <code key={className}>{className}</code>)}
            </div>
            {remainingClasses.length > 0 ? (
              <details className="layer-evidence-more">
                <summary>{remainingClasses.length}개 더 보기</summary>
                <div className="layer-class-list">
                  {remainingClasses.map((className) => <code key={className}>{className}</code>)}
                </div>
              </details>
            ) : null}
          </details>
        )
      })}
    </div>
  )
}
