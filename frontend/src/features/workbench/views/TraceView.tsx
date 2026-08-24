import type { ReactNode } from 'react'

export function TraceView({ active, children }: { active: boolean; children: ReactNode }) {
  return active ? <>{children}</> : null
}
