import { StatusBadge } from '../../../components/StatusBadge'
import type { WorkbenchController } from '../hooks/useWorkbenchController'
import { EndpointExplorer } from './EndpointExplorer'
import { RequestComposer } from './RequestComposer'
import { RequestEvidencePanel } from './RequestEvidencePanel'
import { RequestFlowPanel } from './RequestFlowPanel'
import './RequestView.css'

type RequestViewProps = {
  model: WorkbenchController['requestView']
}
export function RequestView({ model }: RequestViewProps) {
  const {
    apiCatalog, selectedDomain, domainApis, apiScope, endpointSearch,
    visibleApis, selectedApiId, setApiScope, setEndpointSearch, selectApi,
    selectedApi, selectedApiMethodLabel, selectedApiMethodClassName,
    runtimeModeLabel, runtimeSupported, externalRunnable,
    externalTraceConfigured, externalTraceVerified, analyzeOnly,
    hasDetectedApis, targetBaseUrl, externalPath, externalTargetPreview,
    productId, scenario, requestOptionTab, queryParams, requestHeaders,
    requestBody, requestBodyError, bodyAllowed, requestState, requestMessage,
    externalResponse, traceDetail, traceCollectionStatus,
    formattedExternalResponseBody, formattedResponseBody, setActiveView,
    setTargetBaseUrl, setProductId, setScenario, setRequestOptionTab,
    setRequestBody, setRequestBodyError, addQueryParam, addRequestHeader,
    updateQueryParam, updateRequestHeader, removeQueryParam,
    removeRequestHeader, runRequest, hasIntegrationBoundary, estimatedFlow,
  } = model

  return (
    <section className="workspace workspace--api">
      <aside className="left-panel control-rail">
        <div className="panel-card control-card">
          <div className="panel-header control-header">
            <div>
              <span className="section-label">API 요청</span>
              <h2>{selectedApi.label}</h2>
              <p>요청을 작성하고 응답을 확인하세요.</p>
            </div>
            <StatusBadge tone="info">{visibleApis.length}개 API</StatusBadge>
          </div>
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

        </div>
      </aside>
      <section className="graph-panel">
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

      </section>
      <aside className="right-panel inspector-rail">
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

      </aside>
    </section>
  )
}
