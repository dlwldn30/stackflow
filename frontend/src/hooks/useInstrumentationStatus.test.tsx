import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InstrumentationProfile } from '../types/trace'
import { useInstrumentationStatus } from './useInstrumentationStatus'

afterEach(() => vi.unstubAllGlobals())

const profile: InstrumentationProfile = {
  projectName: 'orders',
  serviceName: 'orders',
  buildTool: 'GRADLE',
  collectorEndpoint: 'http://localhost:18080',
  agentPath: '/tmp/opentelemetry-javaagent.jar',
  instrumentedClasses: [],
  instrumentedMethodCount: 0,
  methodsInclude: '',
  environment: {},
  commands: {},
  profileId: 'profile-1',
  connectionStatus: 'PROFILE_GENERATED',
  createdAt: '2026-08-24T00:00:00Z',
  lastSeenAt: null,
}

describe('useInstrumentationStatus', () => {
  it('changes to received when the collector confirms the first span', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        profileId: 'profile-1',
        connectionStatus: 'SPAN_RECEIVED',
        serviceName: 'orders-live',
        createdAt: '2026-08-24T00:00:00Z',
        lastSeenAt: '2026-08-24T00:00:05Z',
      }),
    }))

    const { result } = renderHook(() => useInstrumentationStatus(profile))

    await waitFor(() => expect(result.current.state).toBe('received'))
    expect(result.current.status).toMatchObject({
      connectionStatus: 'SPAN_RECEIVED',
      serviceName: 'orders-live',
      lastSeenAt: '2026-08-24T00:00:05Z',
    })
  })

  it('exposes a retry action after a status lookup failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...profile, connectionStatus: 'PROFILE_GENERATED' }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useInstrumentationStatus(profile))
    await waitFor(() => expect(result.current.state).toBe('error'))

    result.current.retry()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(result.current.state).toBe('polling')
  })
})
