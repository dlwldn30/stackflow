import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeProject, getProjectStructure } from './stackflow'

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
})
