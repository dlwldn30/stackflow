import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeProject, analyzeWorkspace, executeExternalRequest, getInstrumentationProfileStatus, getProjectStructure } from './stackflow'

afterEach(() => vi.unstubAllGlobals())

describe('stackflow API client', () => {
  it('sends the selected project path as JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ projectName: 'orders' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await analyzeProject('/workspace/orders')

    expect(fetchMock).toHaveBeenCalledWith('/api/project/structure/analyze', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ projectPath: '/workspace/orders' }),
    }))
  })

  it('normalizes non-success responses into a user-facing error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    await expect(getProjectStructure()).rejects.toThrow('프로젝트 구조를 불러오지 못했습니다.')
  })

  it('sends a workspace root to the multi-service analysis endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ workspaceName: 'lab', services: [] }) })
    vi.stubGlobal('fetch', fetchMock)

    await analyzeWorkspace('/workspace/distributed-trace-lab')

    expect(fetchMock).toHaveBeenCalledWith('/api/project/workspace/analyze', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ workspacePath: '/workspace/distributed-trace-lab' }),
    }))
  })

  it('keeps the UI usable when an older backend omits analysis coverage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        projectName: 'legacy',
        sourceRoot: 'src/main/java',
        domains: [{ controllers: [{ name: 'OrderController' }], endpoints: [{ id: 'orders' }] }],
      }),
    }))

    const project = await getProjectStructure()

    expect(project.analysisCoverage).toMatchObject({
      sourceRoots: ['src/main/java'],
      detectedControllers: 1,
      detectedEndpoints: 1,
    })
    expect(project.analysisCoverage.warnings[0]).toContain('backend')
  })

  it('loads an instrumentation profile status by encoded id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ connectionStatus: 'PROFILE_GENERATED' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await getInstrumentationProfileStatus('profile/id')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/instrumentation/profiles/profile%2Fid/status',
      undefined,
    )
  })

  it('passes an abort signal to an external request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ resultStatus: 'SUCCESS' }) })
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await executeExternalRequest({ method: 'GET' }, controller.signal)

    expect(fetchMock).toHaveBeenCalledWith('/api/external/request', expect.objectContaining({
      signal: controller.signal,
    }))
  })
})
