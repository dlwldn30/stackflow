import { describe, expect, it } from 'vitest'
import type { ProjectController, TraceEvent } from '../../types/trace'
import type { EstimatedFlowStep } from './types'
import { getControllerBasePathSummary, matchesEstimatedStep } from './workbenchModel'

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

  it('matches an estimated step using legacy code function metadata', () => {
    const step: EstimatedFlowStep = {
      id: 'product-service',
      layer: 'Service',
      label: 'ProductService',
      detail: 'Business rule',
      source: 'static analysis',
    }
    const event: TraceEvent = {
      eventId: 'event-1',
      traceId: 'trace-1',
      component: 'INTERNAL',
      eventType: 'lookupProduct',
      status: 'SUCCESS',
      startedAt: new Date(0).toISOString(),
      endedAt: new Date(1).toISOString(),
      durationMs: 1,
      errorType: null,
      errorMessage: null,
      metadata: {
        'code.namespace': 'com.example.product.ProductService',
        'code.function': 'lookupProduct',
      },
      spanId: 'span-1',
      parentSpanId: null,
      serviceName: 'product-api',
      spanKind: 'INTERNAL',
      stackTrace: null,
      stackTraceTruncated: false,
    }

    expect(matchesEstimatedStep(step, event)).toBe(true)
  })
})
