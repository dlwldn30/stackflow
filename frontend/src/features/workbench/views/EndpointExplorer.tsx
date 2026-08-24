import { Search, X } from 'lucide-react'
import type { ApiDefinition, ApiScope } from '../types'
import { getApiMethodBadgeClassName, getApiMethodLabel } from '../workbenchModel'

type EndpointExplorerProps = {
  apiCatalogCount: number
  domainName: string
  domainApiCount: number
  apiScope: ApiScope
  endpointSearch: string
  visibleApis: ApiDefinition[]
  selectedApiId: string
  onScopeChange: (scope: ApiScope) => void
  onSearchChange: (value: string) => void
  onSelectApi: (api: ApiDefinition) => void
}

export function EndpointExplorer({
  apiCatalogCount,
  domainName,
  domainApiCount,
  apiScope,
  endpointSearch,
  visibleApis,
  selectedApiId,
  onScopeChange,
  onSearchChange,
  onSelectApi,
}: EndpointExplorerProps) {
  return (
    <section className="request-endpoint-explorer" aria-label="Endpoint 탐색">
      <header className="request-endpoint-explorer__head">
        <div>
          <span className="section-label">Endpoint 탐색</span>
          <strong>요청할 API 선택</strong>
        </div>
        <span>{visibleApis.length}개</span>
      </header>

      <div className="api-scope-control" role="group" aria-label="API 표시 범위">
        <button type="button" className={apiScope === 'all' ? 'is-active' : ''} onClick={() => onScopeChange('all')}>
          전체 API <strong>{apiCatalogCount}</strong>
        </button>
        <button type="button" className={apiScope === 'domain' ? 'is-active' : ''} onClick={() => onScopeChange('domain')}>
          {domainName} <strong>{domainApiCount}</strong>
        </button>
      </div>

      <label className="endpoint-search">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={endpointSearch}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="경로, method, handler 검색"
          aria-label="Endpoint 검색"
        />
        {endpointSearch ? (
          <button type="button" onClick={() => onSearchChange('')} aria-label="검색어 지우기">
            <X size={14} aria-hidden="true" />
          </button>
        ) : null}
      </label>

      <div className="api-list api-list--catalog request-endpoint-list">
        {visibleApis.length > 0 ? visibleApis.map((api) => (
          <button
            key={api.id}
            type="button"
            className={`api-item request-endpoint-item${selectedApiId === api.id ? ' is-selected' : ''}`}
            onClick={() => onSelectApi(api)}
          >
            <span className={getApiMethodBadgeClassName(api)}>{getApiMethodLabel(api)}</span>
            <span className="request-endpoint-item__body">
              <strong>{api.pathTemplate}</strong>
              <small>{api.controller}.{api.handler}</small>
              {!api.methodSpecified ? <small>HTTP method 미지정</small> : null}
            </span>
          </button>
        )) : (
          <div className="request-endpoint-empty">
            <strong>일치하는 API가 없습니다</strong>
            <p>검색어를 지우거나 다른 도메인을 선택하세요.</p>
          </div>
        )}
      </div>
    </section>
  )
}
