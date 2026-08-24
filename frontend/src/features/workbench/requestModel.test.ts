import { describe, expect, it, vi } from 'vitest'
import {
  buildExternalTargetPreview,
  countEnabledEntries,
  createRequestEntry,
  formatResponseBody,
  parseResponseBody,
  removeRequestEntry,
  toEnabledEntries,
  updateRequestEntries,
} from './requestModel'

describe('request model', () => {
  it('normalizes enabled entries and builds the external target preview', () => {
    const entries = [
      { id: '1', key: ' page ', value: '2', enabled: true },
      { id: '2', key: 'ignored', value: 'x', enabled: false },
    ]

    expect(toEnabledEntries(entries)).toEqual([{ key: 'page', value: '2', enabled: true }])
    expect(countEnabledEntries(entries)).toBe(1)
    expect(buildExternalTargetPreview('http://localhost:8091/', '/products', entries))
      .toBe('http://localhost:8091/products?page=2')
  })

  it('updates and clears the final request entry instead of removing the editor row', () => {
    const entries = [{ id: '1', key: 'page', value: '1', enabled: true }]
    expect(updateRequestEntries(entries, '1', { value: '3' })[0].value).toBe('3')
    expect(removeRequestEntry(entries, '1')).toEqual([{ id: '1', key: '', value: '', enabled: false }])
  })

  it('formats JSON and preserves non-JSON response bodies', () => {
    expect(formatResponseBody('{"ok":true}')).toBe('{\n  "ok": true\n}')
    expect(parseResponseBody('plain text')).toBe('plain text')
  })

  it('creates stable entry fields with a generated id', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001')
    expect(createRequestEntry('page', '1', false)).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      key: 'page',
      value: '1',
      enabled: false,
    })
  })
})
