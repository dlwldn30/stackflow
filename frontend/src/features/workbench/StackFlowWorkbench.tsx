import '../../App.css'
import { AppShell } from './components/AppShell'
import { useWorkbenchController } from './hooks/useWorkbenchController'
import { ProjectView } from './views/ProjectView'
import { RequestView } from './views/RequestView'
import { TraceView } from './views/TraceView'

export function StackFlowWorkbench() {
  const { shell, projectView, requestView, traceView } = useWorkbenchController()

  return (
    <AppShell
      activeView={shell.activeView}
      projectName={shell.projectName}
      projectStatus={shell.projectStatus}
      analysisTarget={shell.analysisTarget}
      hasDetectedApis={shell.hasDetectedApis}
      requestReady={shell.requestReady}
      traceId={shell.traceId}
      traceCollectionPresentation={shell.traceCollectionPresentation}
      onViewChange={shell.setActiveView}
    >
      {shell.activeView === 'project' ? <ProjectView model={projectView} /> : null}
      {shell.activeView === 'api' ? <RequestView model={requestView} /> : null}
      {shell.activeView === 'runtime' ? <TraceView model={traceView} /> : null}
    </AppShell>
  )
}
