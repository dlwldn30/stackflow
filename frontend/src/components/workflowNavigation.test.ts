import { describe, expect, it } from 'vitest'
import { getWorkflowNavigationState } from './workflowNavigation'

const READY_CONTEXT = {
  projectStatus: 'SUCCESS' as const,
  hasDetectedApis: true,
  requestReady: true,
  traceAvailable: false,
}

describe('getWorkflowNavigationState', () => {
  it.each([
    ['SUCCESS', '분석 완료', 'success'],
    ['EMPTY', 'API 없음', 'warning'],
    ['FAILED', '분석 실패', 'error'],
  ] as const)('maps project status %s to %s', (projectStatus, label, tone) => {
    expect(getWorkflowNavigationState('project', { ...READY_CONTEXT, projectStatus })).toEqual({ label, tone })
  })

  it('maps API and Trace readiness without guessing execution support', () => {
    expect(getWorkflowNavigationState('api', { ...READY_CONTEXT, requestReady: false })).toEqual({
      label: '정적 분석만', tone: 'warning',
    })
    expect(getWorkflowNavigationState('api', { ...READY_CONTEXT, hasDetectedApis: false })).toEqual({
      label: '분석 후 사용', tone: 'neutral',
    })
    expect(getWorkflowNavigationState('runtime', { ...READY_CONTEXT, traceAvailable: true })).toEqual({
      label: 'Trace 확보', tone: 'success',
    })
  })
})
