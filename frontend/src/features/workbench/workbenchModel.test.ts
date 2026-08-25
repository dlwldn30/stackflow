import { describe, expect, it } from 'vitest'
import type { ProjectController } from '../../types/trace'
import { getControllerBasePathSummary } from './workbenchModel'

describe('workbench view model', () => {
  it('summarizes multiple controller base paths', () => {
    const controllers = [{
      name: 'OrderController', packageName: 'com.example.order', basePath: '/api/orders',
      basePaths: ['/api/orders', '/internal/orders'], endpointCount: 4, sourceFile: 'OrderController.java',
    }] satisfies ProjectController[]

    expect(getControllerBasePathSummary(controllers)).toEqual({
      label: '/api/orders 외 1개',
      fullLabel: '/api/orders · /internal/orders',
    })
  })

  it('falls back to the legacy basePath field', () => {
    const controller = {
      name: 'LegacyController', packageName: 'com.example', basePath: '/legacy',
      endpointCount: 1, sourceFile: 'LegacyController.java',
    } as ProjectController

    expect(getControllerBasePathSummary([controller])).toEqual({ label: '/legacy', fullLabel: '/legacy' })
  })
})
