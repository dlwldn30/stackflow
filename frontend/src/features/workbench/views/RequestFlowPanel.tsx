import type { EstimatedFlowStep } from '../types'

type RequestFlowPanelProps = {
  methodLabel: string
  path: string
  estimatedFlow: EstimatedFlowStep[]
  runtimeSupported: boolean
  methodSpecified: boolean
  externalRunnable: boolean
  externalTraceConfigured: boolean
  externalTraceVerified: boolean
  hasIntegrationBoundary: boolean
}

export function RequestFlowPanel({
  methodLabel,
  path,
  estimatedFlow,
  runtimeSupported,
  methodSpecified,
  externalRunnable,
  externalTraceConfigured,
  externalTraceVerified,
  hasIntegrationBoundary,
}: RequestFlowPanelProps) {
  return (
    <details className="request-flow-disclosure request-flow-panel">
      <summary>
        <span>
          <span className="section-label">보조 정보</span>
          <strong>예상 호출 경로</strong>
          <small>{methodLabel} {path} · 코드 구조 기반</small>
        </span>
        <span>{estimatedFlow.length}단계</span>
      </summary>
      <div className="request-flow-content">
        <div className="estimated-flow" aria-label="예상 API 흐름">
          {estimatedFlow.length > 0 ? estimatedFlow.map((step, index) => (
            <article key={step.id} className="estimated-step">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><em>{step.layer}</em><strong>{step.label}</strong></div>
              <small>{step.detail}<b>{step.source}</b></small>
            </article>
          )) : <p className="empty-copy">예상 요청 경로를 만들 수 없습니다.</p>}
        </div>
        <div className="analysis-boundary">
          <strong>{getBoundaryTitle(runtimeSupported, methodSpecified, externalRunnable, externalTraceConfigured, externalTraceVerified, hasIntegrationBoundary)}</strong>
          <p>{getBoundaryDetail(runtimeSupported, methodSpecified, externalRunnable, externalTraceConfigured, externalTraceVerified, hasIntegrationBoundary)}</p>
        </div>
      </div>
    </details>
  )
}

function getBoundaryTitle(
  runtimeSupported: boolean,
  methodSpecified: boolean,
  externalRunnable: boolean,
  externalTraceConfigured: boolean,
  externalTraceVerified: boolean,
  hasIntegrationBoundary: boolean,
) {
  if (runtimeSupported) return '요청 후 실제 Trace를 확인할 수 있습니다.'
  if (!methodSpecified) return 'HTTP method가 없어 정적 분석만 제공합니다.'
  if (externalRunnable && externalTraceVerified) return '실제 OpenTelemetry span을 수집합니다.'
  if (externalRunnable && externalTraceConfigured) return '이 요청으로 Agent의 최초 span을 확인합니다.'
  if (externalRunnable) return 'Agent 실행 설정이 필요합니다.'
  if (hasIntegrationBoundary) return '외부 연동 경계를 정적 분석으로 표시합니다.'
  return '현재 정적 분석만 제공합니다.'
}

function getBoundaryDetail(
  runtimeSupported: boolean,
  methodSpecified: boolean,
  externalRunnable: boolean,
  externalTraceConfigured: boolean,
  externalTraceVerified: boolean,
  hasIntegrationBoundary: boolean,
) {
  if (runtimeSupported) return '요청을 실행하면 Trace 화면으로 이동합니다.'
  if (!methodSpecified) return 'StackFlow는 HTTP method를 임의로 추측하지 않습니다.'
  if (externalRunnable && externalTraceVerified) return 'traceparent와 같은 trace ID의 span을 기다립니다.'
  if (externalRunnable && externalTraceConfigured) return 'Agent로 앱을 재시작했다면 최초 확인 요청이 됩니다.'
  if (externalRunnable) return '프로젝트 구조에서 실행 명령을 생성하세요.'
  if (hasIntegrationBoundary) return 'Gateway와 Client의 naming 및 package 근거를 사용합니다.'
  return '분석 결과를 검토한 뒤 실행 가능한 API를 선택하세요.'
}
