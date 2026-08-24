import type { ReactNode } from 'react'
import type { LayerGroup } from '../types'

export function ProjectView({ active, children }: { active: boolean; children: ReactNode }) {
  return active ? <>{children}</> : null
}

export function LayerEvidenceList({ groups, emptyMessage }: { groups: LayerGroup[]; emptyMessage: string }) {
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
