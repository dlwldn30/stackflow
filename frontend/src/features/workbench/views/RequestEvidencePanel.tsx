import { Activity, Braces } from 'lucide-react'
import type { ApiDefinition } from '../types'

type RequestEvidencePanelProps = {
  selectedApi: ApiDefinition
  methodLabel: string
  runtimeModeLabel: string
  runtimeSupported: boolean
  externalRunnable: boolean
  externalTraceConfigured: boolean
  externalTraceVerified: boolean
}

export function RequestEvidencePanel({
  selectedApi,
  methodLabel,
  runtimeModeLabel,
  runtimeSupported,
  externalRunnable,
  externalTraceConfigured,
  externalTraceVerified,
}: RequestEvidencePanelProps) {
  return (
    <div className="request-evidence-panel">
      <header>
        <span className="section-label">실행 정보</span>
        <h2>{selectedApi.label}</h2>
        <p>{methodLabel} {selectedApi.pathTemplate}</p>
      </header>

      <section className="request-readiness">
        <Activity size={17} aria-hidden="true" />
        <div>
          <span>현재 상태</span>
          <strong>{runtimeModeLabel}</strong>
          <p>{getReadinessDetail(runtimeSupported, externalRunnable, externalTraceConfigured, externalTraceVerified, selectedApi.methodSpecified)}</p>
        </div>
      </section>

      <details className="request-evidence-disclosure">
        <summary><Braces size={15} aria-hidden="true" /><span>분석 근거</span><strong>보기</strong></summary>
        <dl>
          <div><dt>Controller</dt><dd>{selectedApi.controller}</dd></div>
          <div><dt>Handler</dt><dd>{selectedApi.handler}</dd></div>
          <div><dt>요청 유형</dt><dd>{selectedApi.requestType}</dd></div>
          <div><dt>HTTP method</dt><dd>{selectedApi.methodSpecified ? selectedApi.method : '미지정'}</dd></div>
        </dl>
      </details>
    </div>
  )
}

function getReadinessDetail(
  runtimeSupported: boolean,
  externalRunnable: boolean,
  externalTraceConfigured: boolean,
  externalTraceVerified: boolean,
  methodSpecified: boolean,
) {
  if (!methodSpecified) return '소스에서 HTTP method를 명시해야 실행할 수 있습니다.'
  if (runtimeSupported) return '요청 후 내장 Runtime Trace를 바로 확인합니다.'
  if (externalTraceVerified) return 'Agent span 수신 이력이 확인되었습니다.'
  if (externalRunnable && externalTraceConfigured) return '요청을 보내 최초 span 수신을 확인하세요.'
  if (externalRunnable) return 'Agent 실행 명령을 만든 뒤 대상 앱을 재시작하세요.'
  return '정적 분석 정보만 확인할 수 있습니다.'
}
