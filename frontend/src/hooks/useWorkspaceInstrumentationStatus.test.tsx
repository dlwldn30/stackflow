import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InstrumentationProfile, WorkspaceServiceProfile } from '../types/trace'
import { useWorkspaceInstrumentationStatus } from './useWorkspaceInstrumentationStatus'

afterEach(() => vi.unstubAllGlobals())

function serviceProfile(serviceId: string): WorkspaceServiceProfile {
  const profile: InstrumentationProfile = {
    projectName: serviceId, serviceName: serviceId, buildTool: 'GRADLE', collectorEndpoint: '', agentPath: '',
    instrumentedClasses: [], instrumentedMethodCount: 0, methodsInclude: '', environment: {}, commands: {},
    profileId: `${serviceId}-profile`, connectionStatus: 'PROFILE_GENERATED', createdAt: '2026-08-27T00:00:00Z', lastSeenAt: null,
  }
  return { serviceId, relativePath: serviceId, workingDirectory: `/workspace/${serviceId}`, profile }
}

describe('useWorkspaceInstrumentationStatus', () => {
  it('keeps status results separated by service id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: string) => Promise.resolve({
      ok: true,
      json: async () => ({
        profileId: input.includes('order') ? 'order-service-profile' : 'product-service-profile',
        connectionStatus: 'SPAN_RECEIVED',
        serviceName: input.includes('order') ? 'order-service' : 'product-service',
        createdAt: '2026-08-27T00:00:00Z',
        lastSeenAt: '2026-08-27T00:00:05Z',
      }),
    })))

    const profiles = [serviceProfile('order-service'), serviceProfile('product-service')]
    const { result } = renderHook(() => useWorkspaceInstrumentationStatus(profiles))

    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(2))
    expect(result.current['order-service'].serviceName).toBe('order-service')
    expect(result.current['product-service'].serviceName).toBe('product-service')
  })
})
