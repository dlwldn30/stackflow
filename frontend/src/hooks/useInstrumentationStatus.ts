import { useCallback, useEffect, useState } from 'react'
import { getInstrumentationProfileStatus } from '../api/stackflow'
import type { InstrumentationProfile, InstrumentationProfileStatus } from '../types/trace'

type ProfileStatusState = 'idle' | 'polling' | 'received' | 'error'

const POLL_INTERVAL_MS = 2_000

export function useInstrumentationStatus(profile: InstrumentationProfile | null) {
  const [status, setStatus] = useState<InstrumentationProfileStatus | null>(null)
  const [state, setState] = useState<ProfileStatusState>('idle')
  const [retryVersion, setRetryVersion] = useState(0)

  const retry = useCallback(() => {
    setState(profile ? 'polling' : 'idle')
    setRetryVersion((current) => current + 1)
  }, [profile])

  useEffect(() => {
    if (!profile) {
      setStatus(null)
      setState('idle')
      return
    }

    let cancelled = false
    let timer: number | undefined
    setStatus({
      profileId: profile.profileId,
      connectionStatus: profile.connectionStatus,
      serviceName: profile.serviceName,
      createdAt: profile.createdAt,
      lastSeenAt: profile.lastSeenAt,
    })

    if (profile.connectionStatus === 'SPAN_RECEIVED') {
      setState('received')
      return
    }

    setState('polling')
    const poll = async () => {
      try {
        const nextStatus = await getInstrumentationProfileStatus(profile.profileId)
        if (cancelled) return
        setStatus(nextStatus)
        if (nextStatus.connectionStatus === 'SPAN_RECEIVED') {
          setState('received')
          return
        }
        timer = window.setTimeout(poll, POLL_INTERVAL_MS)
      } catch {
        if (cancelled) return
        setState('error')
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [profile, retryVersion])

  return { status, state, retry }
}
