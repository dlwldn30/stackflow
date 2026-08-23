import { Check, Code2, LockKeyhole, Play, Route } from 'lucide-react'
import type { ViewMode } from '../ui/copy'

type EvidenceProgressProps = {
  activeView: ViewMode
  analysisReady: boolean
  requestReady: boolean
  traceReady: boolean
}

const STAGES = [
  { id: 'project', label: '코드 분석', icon: Code2 },
  { id: 'api', label: '요청 가능', icon: Play },
  { id: 'runtime', label: 'Trace 확보', icon: Route },
] as const

export function EvidenceProgress({ activeView, analysisReady, requestReady, traceReady }: EvidenceProgressProps) {
  const readiness = { project: analysisReady, api: requestReady, runtime: traceReady }

  return (
    <ol className="evidence-progress" aria-label="분석 증거 단계">
      {STAGES.map(({ id, label, icon: Icon }) => {
        const ready = readiness[id]
        const active = activeView === id

        return (
          <li key={id} className={`${ready ? 'is-ready' : 'is-locked'}${active ? ' is-active' : ''}`}>
            <span className="evidence-progress__icon">
              {ready && !active ? <Check size={14} aria-hidden="true" /> : active ? <Icon size={15} aria-hidden="true" /> : <LockKeyhole size={13} aria-hidden="true" />}
            </span>
            <span>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}
