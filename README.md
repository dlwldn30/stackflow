# StackFlow

StackFlow is a Spring Boot project understanding and request-flow visualization MVP.

It helps you map a Spring Boot project, select one API, run supported requests, and inspect where a request succeeded or failed.

## Current Scope

StackFlow is not a production APM replacement yet. The current MVP focuses on local project understanding and a runnable vertical slice.

- `Project`: read a Spring Boot project and summarize domains, controllers, layers, infrastructure, and API count.
- `Request`: select an API, configure a target request, send it, and inspect the HTTP response.
- `Trace`: run the bundled StackFlow sample APIs with SSE and inspect actual runtime events in a graph.

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

## Important Limitation

External project analysis and external API execution do not mean StackFlow can trace that external app internally.

For external Spring Boot projects, StackFlow currently shows:

- Detected structure.
- Estimated API flow.
- HTTP request and response evidence.

It does not yet show actual external `Controller -> Service -> Repository` runtime events. That requires a future Spring Boot starter, agent, or instrumentation layer inside the target app.

## Project Structure

```text
backend/
  Spring Boot API, trace/session storage, project analyzer, external request proxy

frontend/
  Vite React app, Project/Request/Trace UI, React Flow graph

docs/
  Product direction, implementation plan, and development convention
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
http://localhost:8080
```

If port `8080` is already in use, run the backend on `8091`:

```bash
cd /Users/jiwoo/Desktop/stackflow/backend
./gradlew bootRun --args='--server.port=8091'
```

### Frontend

If the backend is running on `8080`:

```bash
cd /Users/jiwoo/Desktop/stackflow/frontend
npm install
npm run dev
```

If the backend is running on `8091`:

```bash
cd /Users/jiwoo/Desktop/stackflow/frontend
VITE_API_TARGET=http://localhost:8091 npm run dev
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
- Use `Browse folder` to preview a local folder selection in the browser.
- Browser mode cannot reliably read the selected folder's absolute path, so paste the root path into the path field to run backend analysis.
- Example path:

```text
/Users/jiwoo/Desktop/stackflow/backend
```

Future desktop packaging with Tauri or Electron can replace this limitation with a native folder picker that returns the absolute project path directly.

### 2. Request

Use this view to select and run one API.

- Select an API from the detected catalog.
- For external projects, enter the target base URL.
- Add query parameters, headers, or JSON body when needed.
- Check `Request sent` and `Response received` after execution.

Example external target:

```text
http://localhost:8091
```

### 3. Trace

Use this view to inspect actual runtime events.

- Runtime trace is currently supported for the bundled StackFlow sample APIs.
- External projects are disabled in Trace view until instrumentation exists.
- The graph highlights success, warning, error, timeout, and idle nodes.

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
POST /api/external/request
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
