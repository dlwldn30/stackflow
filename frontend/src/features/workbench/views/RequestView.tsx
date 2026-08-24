import type { ReactNode } from 'react'

export function RequestView({ active, children }: { active: boolean; children: ReactNode }) {
  return active ? <>{children}</> : null
}
