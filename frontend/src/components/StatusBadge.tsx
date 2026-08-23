import type { ReactNode } from 'react'

type StatusTone = 'success' | 'warning' | 'error' | 'neutral' | 'info'

type StatusBadgeProps = {
  children: ReactNode
  tone?: StatusTone
  className?: string
}

export function StatusBadge({ children, tone = 'neutral', className = '' }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge--${tone}${className ? ` ${className}` : ''}`}>
      <span className="status-badge__dot" aria-hidden="true" />
      {children}
    </span>
  )
}
