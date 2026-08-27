import { useEffect, useState } from 'react'
import { getInstrumentationProfileStatus } from '../api/stackflow'
import type { InstrumentationProfileStatus, WorkspaceServiceProfile } from '../types/trace'

export function useWorkspaceInstrumentationStatus(profiles: WorkspaceServiceProfile[]) {
  const [statuses, setStatuses] = useState<Record<string, InstrumentationProfileStatus>>({})
  useEffect(() => {
    if (profiles.length === 0) {
      setStatuses({})
      return
    }

    let cancelled = false
    let timer: number | null = null
    const poll = async () => {
      const results = await Promise.allSettled(profiles.map(async (item) => ({
        serviceId: item.serviceId,
        status: await getInstrumentationProfileStatus(item.profile.profileId),
      })))
      if (cancelled) return
      const next = Object.fromEntries(results.flatMap((result) => result.status === 'fulfilled'
        ? [[result.value.serviceId, result.value.status] as const]
        : []))
      setStatuses(next)
      const allReceived = profiles.every((item) => next[item.serviceId]?.connectionStatus === 'SPAN_RECEIVED')
      if (!allReceived) timer = window.setTimeout(() => void poll(), 2000)
    }

    void poll()
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [profiles])

  return statuses
}
