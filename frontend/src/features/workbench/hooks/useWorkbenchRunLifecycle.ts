import { useCallback } from 'react'
import type { RequestExecutionModel } from './useRequestExecution'
import type { TraceRuntimeModel } from './useTraceRuntime'

export function useWorkbenchRunLifecycle(
  request: RequestExecutionModel,
  runtime: TraceRuntimeModel,
) {
  const invalidateActiveRun = useCallback(() => {
    runtime.activeRunIdRef.current += 1
    request.cancelActiveRequest()
    runtime.closeActiveStream()
  }, [request, runtime])

  const isCurrentRun = useCallback((runId: number) =>
    runtime.activeRunIdRef.current === runId, [runtime.activeRunIdRef])

  return {
    invalidateActiveRun,
    isCurrentRun,
  }
}

export type WorkbenchRunLifecycle = ReturnType<typeof useWorkbenchRunLifecycle>
