# StackFlow

StackFlow is a Spring Boot project understanding and request-flow visualization MVP.

It helps you map a Spring Boot project, select one API, run supported requests, and inspect where a request succeeded or failed.

## Current Scope

StackFlow is not a production APM replacement yet. The current MVP focuses on local project understanding and a runnable vertical slice.

- `Project`: read a Spring Boot project and summarize domains, controllers, layers, infrastructure, and API count.
- `Request`: select an API, configure a target request, send it, and inspect the HTTP response.
- `Trace`: inspect bundled sample events or actual OpenTelemetry spans from an Agent-enabled external Spring Boot JVM.

Current request modes:

- `Runtime Trace`: available for the bundled runtime-ready sample APIs.
- `External Runtime Trace`: available after generating an instrumentation profile and restarting the target app with the OpenTelemetry Java Agent.
- `Run target`: available for external targets only when the analyzed endpoint has an explicit HTTP method.
- `Analyze only`: used for integration-focused sample flows or analyzed endpoints detected without an explicit HTTP method.

## Implemented Features

- Spring Boot backend with Gradle.
- React + Vite + TypeScript frontend.
- Static Spring project analysis from a local project path.
- API catalog grouped by detected domain.
- Estimated API flow for selected endpoints.
- SSE-based sample runtime trace streaming.
- Request flow graph with status, duration, and node detail.
- External API execution through the StackFlow backend proxy.
- External request editor for query parameters, headers, and JSON body.
- JSON body validation before sending external `POST`, `PUT`, or `PATCH` requests.
- External response panel with request evidence and response evidence.
- OpenTelemetry Java Agent launch profile generation for Gradle, Maven, and executable JAR projects.
- W3C `traceparent` correlation, OTLP HTTP/protobuf ingestion, and dynamic parent-child span graphs.

## External Runtime Trace Boundary

For external Spring Boot projects, StackFlow currently shows:

- Detected structure.
- Estimated API flow.
- HTTP request and response evidence.
- Endpoints detected from method-level `@RequestMapping` even when `RequestMethod` is omitted.

After an instrumentation profile is generated, StackFlow can show actual Agent spans for the external JVM. The target app must be restarted with the generated command. Source files and build files are not modified.

The first supported boundary is one local Spring Boot JVM. Dynamic attach, multi-service distributed tracing, authentication, durable storage, and production APM operation are not included.

If a detected endpoint does not declare an explicit HTTP method, StackFlow keeps it visible in the catalog but marks it as `Analyze only`. That endpoint cannot be executed or traced until the controller mapping becomes explicit.

## Project Structure

```text
backend/
  Spring Boot API, trace/session storage, project analyzer, external request proxy

frontend/
  Vite React app, Project/Request/Trace UI, React Flow graph

examples/trace-lab/
  External Spring Boot app with PostgreSQL and Redis failure scenarios

docs/
  Product direction, implementation plan, development convention, and analysis convention
```

## Run Locally

Run backend and frontend in separate terminals.

### Backend

```bash
cd /Users/jiwoo/Desktop/stackflow/backend
./gradlew bootRun
```

Default backend URL:

```text
http://localhost:18080
```

### Frontend

```bash
cd /Users/jiwoo/Desktop/stackflow/frontend
npm install
npm run dev
```

Frontend URL:

```text
http://localhost:5173
```

Vite proxies `/api/*` requests to `VITE_API_TARGET`. If the frontend shows `http proxy error`, check that the backend is running first.

## How To Use

### 1. Project

Use this view to understand a Spring Boot project structure.

- Leave the project path empty to load the bundled StackFlow sample project.
- Enter a Spring Boot project root path to analyze an external local project.
- Use `폴더 선택` to open the native macOS folder picker and fill the absolute project path.
- You can also paste an absolute project root path directly into the path field.
- Example path:

```text
/Users/jiwoo/Desktop/stackflow/backend
```

### 2. Request

Use this view to select and run one API.

- Select an API from the detected catalog.
- If the endpoint is marked `Analyze only`, use it for structure review only.
- For external projects, enter the target base URL.
- Add query parameters, headers, or JSON body when needed.
- Check `Request sent` and `Response received` after execution.

Example external target:

```text
http://localhost:8091
```

### 3. Trace

Use this view to inspect actual runtime events.

- Runtime trace is supported for bundled sample APIs and Agent-enabled external Spring Boot apps.
- Integration-focused sample domains stay analysis-only by design.
- For an external project, generate `실행 Trace 설정`, download the official Java Agent, and run the generated command from the target project root.
- Send an API request with Trace capture enabled; StackFlow injects `traceparent` and waits up to 15 seconds for OTLP spans.
- The graph highlights success, warning, error, timeout, and idle nodes.

External setup flow:

```text
1. Analyze an absolute external project path.
2. In Project, set the Java Agent path and StackFlow collector URL.
3. Generate the launch command.
4. Restart the target app with that command.
5. In Request, enter the target base URL and send an API request.
6. Inspect the actual span tree in Trace.
```

## Redis And PostgreSQL Trace Lab

Use [examples/trace-lab/README.md](examples/trace-lab/README.md) to verify an external Spring Boot trace end to end. The lab provides four flows:

- Redis miss, PostgreSQL lookup, then Redis save.
- Redis hit without a PostgreSQL query.
- Redis connection failure with PostgreSQL fallback.
- Deliberate PostgreSQL query failure with HTTP 500.

Its Docker Compose file runs only PostgreSQL and Redis. The Spring Boot app runs with the Java Agent command generated by StackFlow.

## Sample Runtime Scenarios

Use the bundled sample APIs to verify graph behavior.

- `Normal`: successful product request.
- `Redis Down`: Redis node warning or fallback path.
- `DB Timeout`: database timeout node.
- `Service Error`: service-layer failure node.

## API Overview

Backend APIs:

```text
GET  /api/project/structure
POST /api/project/structure/analyze
POST /api/instrumentation/profile
POST /api/external/request
POST /v1/traces
POST /api/traces/session
GET  /api/traces/{traceId}/stream
GET  /api/traces
GET  /api/traces/{traceId}
GET  /api/products
GET  /api/products/{productId}
GET  /api/products/{productId}/stock
POST /api/products/{productId}/cache-refresh
```

## Verification

Backend:

```bash
cd /Users/jiwoo/Desktop/stackflow/backend
./gradlew test
```

Frontend:

```bash
cd /Users/jiwoo/Desktop/stackflow/frontend
npm run lint
npm run build
```

## Development Convention

This repository follows the project convention in [docs/development-convention.md](docs/development-convention.md).

Current examples:

```text
Issue:  [✨ Feat] 외부 API request editor 지원
Branch: feat/11-external-api-request-editor
PR:     [✨ Feat] 외부 API request editor 지원 (#11)
Commit: feat: ✨ 외부 API request editor 지원
```

## Planning Docs

- [Product direction and implementation plan](docs/product-direction-and-implementation-plan.md)
- [Development convention](docs/development-convention.md)
- [StackFlow analysis convention](docs/stackflow-analysis-convention.md)
- [External Spring Boot runtime tracing design](docs/external-runtime-tracing-design.md)
