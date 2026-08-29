# StackFlow Product Direction and Implementation Plan

Date: 2026-08-28
Status: Active

## Purpose

This document records the current product direction and implementation plan before expanding StackFlow further.

StackFlow should not start as a production APM tool. The first useful direction is a Spring Boot project understanding and onboarding tool:

> Put a Spring Boot project into StackFlow, understand its domains and APIs, inspect the expected request path, and run supported traces to see where the request failed.

This direction keeps the MVP realistic. Production observability tools already require high accuracy, security, scale, distributed tracing, alerting, and long-term storage. StackFlow can create clearer value first by helping users understand unfamiliar Spring Boot projects.

## Product Positioning

StackFlow is positioned between codebase mapping tools and runtime tracing tools.

- Codebase mapping value: show domains, controllers, services, repositories, infrastructure, and API catalog.
- Runtime tracing value: show actual request events and failure nodes when an executable trace is available.
- Learning value: explain what each API appears to do and which layers it is expected to cross.

The primary MVP audience is:

- Students learning Spring Boot architecture.
- Junior developers trying to understand layered backend projects.
- Developers joining an unfamiliar Spring Boot codebase.
- Solo developers who want a visual map of their own project.

The initial target should not be:

- Production incident response.
- Full APM replacement.
- Production-scale trace ingestion across arbitrary services.
- Security-sensitive production monitoring.

## Current State

The repository now provides an end-to-end local tracing workbench:

- Analyze one Spring Boot project or a workspace containing up to ten independent Gradle or Maven services.
- Detect controllers, mappings, domains, layers, infrastructure evidence, and analysis coverage warnings.
- Generate service-specific OpenTelemetry Java Agent profiles without changing target source or build files.
- Execute selected APIs through the backend proxy with a StackFlow-owned W3C `traceparent`.
- Receive OTLP HTTP/protobuf spans and render Waterfall, graph, events, failure propagation, exception detail, and response preview.
- Correlate synchronous HTTP spans across the bundled Order and Product JVMs by actual `spanId`, `parentSpanId`, and `service.name`.
- Verify the representative distributed UI flows with Playwright and the six infrastructure scenarios with Docker Compose.

Current limitation:

- Runtime tracing still requires restarting each target JVM with the generated Agent command.
- The validated distributed demo is two local Spring Boot JVMs connected by synchronous HTTP.
- Message brokers, asynchronous consumers, authentication, durable storage, and production retention are not supported.

## Product Information Architecture

The UI should be organized around three clear modes.

## 1. Project Map

Goal: help the user understand what the project contains.

Shows:

- Project name.
- Framework and build tool.
- Detected infrastructure.
- Domains.
- Controllers per domain.
- Layer summary.
- API count.

Example structure:

```text
Product Domain
-> ProductController
-> ProductService
-> ProductRepositoryService
-> Redis / MySQL
```

Why this comes first:

- When a user uploads or points to a project, they first need orientation.
- Runtime trace is useful only after the user understands what they are selecting.

## 2. API Flow

Goal: show the expected path of a selected API.

Shows:

- HTTP method and path.
- Controller handler.
- Path variables.
- Request type, such as `QUERY_DETAIL`, `QUERY_LIST`, `QUERY_STOCK`, `CACHE_WRITE`, or `WRITE`.
- Estimated layer path.

Example:

```text
GET /api/products/{productId}
-> ProductController.getProduct
-> ProductService
-> Redis
-> ProductRepositoryService
-> MySQL
```

Important rule:

- Static flow must be marked as estimated.
- It should not pretend to be a real runtime trace.

Why:

- Static Java scanning can infer likely structure, but it cannot guarantee the exact runtime path.
- This distinction prevents user confusion.

## 3. Runtime Trace

Goal: show the actual request path when StackFlow can execute or receive trace events.

Shows:

- Actual traceId.
- Actual event sequence.
- Component status.
- Duration.
- Error type and message.
- Response body.
- Failure node.

Important rule:

- Only APIs that are connected to StackFlow sample runtime or future instrumentation should show `Run trace`.
- External project APIs should show `Analyze only` until an execution target or agent is configured.

Why:

- The current app can trace StackFlow sample APIs.
- It cannot automatically trace arbitrary external Spring Boot internals without runtime instrumentation.

## Revised Implementation Plan

## Phase 1. Stabilize Current Static Analysis Work

Scope:

- Keep current project path analysis.
- Keep sample runtime trace.
- Fix confusing UI language.
- Make clear which APIs are runnable and which are analysis-only.

Implementation:

- Add explicit mode labels: `Project Map`, `API Flow`, `Runtime Trace`.
- Add `runtimeSupport` or equivalent frontend state for each API.
- Show `Run trace` only for StackFlow sample APIs.
- Show `Analyze only` for external project APIs.
- Keep response body visible only for actual runtime requests.

Reason:

- This prevents the product from claiming that an external API can be traced before instrumentation exists.

## Phase 2. Add Project Map Graph

Scope:

- Build a graph from static analysis results.
- Render domains, controllers, layers, and infrastructure separately from runtime trace nodes.

Implementation:

- Add backend DTO fields if needed for structure graph edges.
- Add frontend graph mode switch.
- Render static graph with estimated labels.

Reason:

- This is the first feature that makes StackFlow useful when a user points it at any Spring Boot project.

## Phase 2-1. Improve Local Project Selection UX

Scope:

- Add a browser folder picker to reduce project path typing friction.
- Show selected folder name and file count as confirmation.
- Keep explicit path input for actual backend analysis in the web MVP.

Reason:

- Browser security prevents a normal Vite web app from reliably reading the selected folder's absolute path.
- A future Tauri or Electron wrapper can replace this with a native folder picker that passes the absolute project path directly to the backend.

## Phase 3. Add API Estimated Flow

Scope:

- For a selected API, show likely flow.

Implementation:

- Infer flow from detected domain layers.
- Use request type to include likely nodes.
- Example rules:
  - `QUERY_LIST`: Controller -> Service -> Repository -> MySQL.
  - `QUERY_DETAIL`: Controller -> Service -> Redis -> Repository -> MySQL.
  - `CACHE_WRITE`: Controller -> Service -> Repository -> MySQL -> Redis.
  - `WRITE`: Controller -> Service -> Repository -> MySQL.

Reason:

- This gives users an immediate mental model even before runtime tracing is connected.

## Phase 4. Add External Execution Target

Scope:

- Let users configure a target base URL.
- Allow StackFlow to call external project APIs.
- Keep this as HTTP execution evidence, not internal runtime trace evidence.

Implementation:

- Add target base URL input.
- Build request URL from selected API path and user input values.
- Route the call through `POST /api/external/request` so browser CORS does not block local target projects.
- Add a request editor for query parameters, headers, and JSON body.
- Validate JSON body before execution so the failed request is not sent with malformed input.
- Show HTTP response result.
- Show transport errors inside the response panel instead of crashing the UI.
- Keep internal trace unavailable unless instrumentation is installed.

Reason:

- Calling an external API is useful, but it is still not enough for internal node-level tracing.
- Backend proxy is safer for the MVP user flow than direct browser `fetch`, because many local Spring Boot apps will not have CORS configured for the Vite dev server.

## Phase 5. OpenTelemetry External Runtime Trace

Scope:

- Turn static analysis into an instrumentation profile for a local external Spring Boot application.
- Trace one JVM or a local workspace of synchronously connected Spring Boot JVMs with the OpenTelemetry Java Agent and OTLP HTTP/protobuf.
- Keep the target project's source and Gradle/Maven files unchanged.

Implementation:

- Generate `OTEL_INSTRUMENTATION_METHODS_INCLUDE` from analyzed Controller, Service, UseCase, Repository, Store, Cache, Gateway, and Client public methods.
- Generate Gradle, Maven, and executable JAR launch commands that attach `opentelemetry-javaagent.jar`.
- Receive standard OTLP traces through `POST /v1/traces`.
- Inject a StackFlow-owned W3C `traceparent` when `POST /api/external/request` runs with trace capture enabled.
- Join received spans by trace ID and build the actual graph from `spanId -> parentSpanId`.
- Analyze workspace services separately, generate one Agent profile per service, and preserve entry and participating service names.
- Complete distributed collection after the entry SERVER span, HTTP response, and a two-second quiet period, with a 15-second hard timeout.
- Keep sample traces on the existing fixed graph and use a dynamic graph only for `source=OPENTELEMETRY`.
- Distinguish HTTP execution failure from `TRACE_COLLECTION_TIMEOUT` when no spans arrive for 15 seconds.

Reason:

- An HTTP response proves only that an endpoint ran. Agent spans provide actual Controller, method, JDBC, Redis, and HTTP client boundaries without modifying the target source.
- OpenTelemetry Trace Context and OTLP provide a standard integration boundary without AI inference or a StackFlow-specific starter.

Limits:

- Supported operation is local development; the bundled and automated distributed acceptance path uses two Spring Boot JVMs connected by synchronous HTTP.
- The target JVM must be restarted with the Agent; dynamic attach is not supported.
- Message queues, asynchronous consumers, authentication, persistence, sampling controls, and production APM operation remain later phases.
- See `docs/external-runtime-tracing-design.md` for the executable contract and metadata policy.

## Implementation Rules Going Forward

- Before coding, record the intended change and reason.
- After coding, record what actually changed and what was verified.
- Keep product definition separate from implementation checklist.
- Do not mix estimated static analysis with actual runtime trace without labels.
- Prefer small vertical slices over broad incomplete platform features.
- Keep tests tied to user-visible behavior.

## Current Status And Next Task

The UI now separates the workflow into three evidence stages:

- `Project`: static Spring structure and analysis coverage.
- `Request`: API input, execution target, and HTTP response.
- `Trace`: actual OTLP Waterfall, service boundaries, failure propagation, response preview, and exception detail.

Legacy and current OpenTelemetry code semantic keys are normalized in the frontend display layer. A non-demo Spring Boot 3.4.1 project and the two-service Order·Product workspace are both recorded acceptance paths.

The next delivery task is portfolio packaging: align public screenshots and demo media with the distributed Trace flow, document the verified limits, and publish a release from a clean, green `main`.
