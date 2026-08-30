import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { WorkbenchController } from '../hooks/useWorkbenchController'
import { EndpointExplorer } from './EndpointExplorer'
import { RequestComposer } from './RequestComposer'
import { RequestEvidencePanel } from './RequestEvidencePanel'
import { RequestFlowPanel } from './RequestFlowPanel'
import { RequestResponsePanel } from './RequestResponsePanel'
import './RequestView.css'

type RequestViewProps = {
  model: WorkbenchController['requestView']
}
export function RequestView({ model }: RequestViewProps) {
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(false)
  const {
    apiCatalog, selectedDomain, domainApis, apiScope, endpointSearch,
    visibleApis, selectedApiId, setApiScope, setEndpointSearch, selectApi,
    selectedApi, selectedApiMethodLabel, selectedApiMethodClassName,
    runtimeModeLabel, runtimeSupported, externalRunnable,
    externalTraceConfigured, externalTraceVerified, analyzeOnly,
    hasDetectedApis, targetBaseUrl, externalPath, externalTargetPreview,
    productId, scenario, requestOptionTab, queryParams, requestHeaders,
    requestBody, requestBodyError, bodyAllowed, requestState, requestMessage,
    traceCollectionStatus, requestResponsePresentation, setActiveView,
    setTargetBaseUrl, setProductId, setScenario, setRequestOptionTab,
    setRequestBody, setRequestBodyError, addQueryParam, addRequestHeader,
    updateQueryParam, updateRequestHeader, removeQueryParam,
    removeRequestHeader, runRequest, hasIntegrationBoundary, estimatedFlow,
  } = model

  return (
    <section className="workspace workspace--api">
      <aside className={`left-panel control-rail request-endpoint-rail${mobileExplorerOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className="mobile-endpoint-toggle"
          aria-expanded={mobileExplorerOpen}
          aria-controls="request-endpoint-explorer"
          onClick={() => setMobileExplorerOpen((current) => !current)}
        >
          <span className={selectedApiMethodClassName}>{selectedApiMethodLabel}</span>
          <strong>{selectedApi.pathTemplate}</strong>
          <small>{mobileExplorerOpen ? '목록 닫기' : 'API 변경'}</small>
          <ChevronDown size={15} aria-hidden="true" />
        </button>
        <div id="request-endpoint-explorer" className="request-endpoint-rail__content">
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
            onSelectApi={(api) => {
              selectApi(api)
              setMobileExplorerOpen(false)
            }}
          />
        </div>
      </aside>

      <section className="request-main-panel">
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
          traceCollectionStatus={traceCollectionStatus}
          responseAvailable={requestResponsePresentation.phase !== 'idle'
            && requestResponsePresentation.phase !== 'loading'}
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
        />
        <RequestResponsePanel
          presentation={requestResponsePresentation}
          onOpenTrace={() => setActiveView('runtime')}
        />
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
        />
      </aside>

      <section className="request-flow-region">
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
      </section>
    </section>
  )
}
