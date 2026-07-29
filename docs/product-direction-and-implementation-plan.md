# StackFlow Product Direction and Implementation Plan

Date: 2026-07-29
Status: Draft
Branch context: `feat/9-external-api-target-base-url`

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
- Distributed tracing across microservices.
- Security-sensitive production monitoring.

## Current State

The repository already has the first runtime trace slice:

- Spring Boot backend.
- React + Vite frontend.
- Sample product APIs.
- SSE-based live trace streaming.
- Request flow graph.
- Node detail panel.
- Response body panel.
- Recent trace history.

The repository also has early static project analysis:

- Analyze a Spring Boot project path.
- Detect REST controllers.
- Extract API mappings.
- Group APIs into domains.
- Summarize layers such as Controller, Service, Repository, Cache, Store, DTO, and Domain.

The repository is adding external target execution:

- Configure a target base URL for an analyzed Spring Boot project.
- Call the selected external endpoint through the StackFlow backend proxy.
- Show HTTP status, duration, content type, response body, and transport error message.
- Keep external execution results separate from runtime trace evidence.

Current limitation:

- External project analysis and StackFlow sample runtime tracing are still separate concepts.
- Selecting an analyzed external API does not automatically mean StackFlow can trace that external app internally.
- Without instrumentation inside the external app, StackFlow can only show structure and estimated flow.
- External API execution confirms the endpoint response, but it still cannot prove the internal Controller -> Service -> Repository path.

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
- Show HTTP response result.
- Show transport errors inside the response panel instead of crashing the UI.
- Keep internal trace unavailable unless instrumentation is installed.

Reason:

- Calling an external API is useful, but it is still not enough for internal node-level tracing.
- Backend proxy is safer for the MVP user flow than direct browser `fetch`, because many local Spring Boot apps will not have CORS configured for the Vite dev server.

## Phase 5. Design Spring Boot Instrumentation

Scope:

- Make real external project runtime tracing possible.

Possible approaches:

- StackFlow Spring Boot starter dependency.
- Servlet filter for traceId propagation.
- AOP around Controller, Service, Repository methods.
- Optional Redis/JDBC wrappers.
- Push trace events to StackFlow server over HTTP or SSE-compatible event ingestion.

Reason:

- This is required if StackFlow should show real internal flow for arbitrary Spring Boot projects.
- It should be a separate MVP phase because it changes the integration model.

## Implementation Rules Going Forward

- Before coding, record the intended change and reason.
- After coding, record what actually changed and what was verified.
- Keep product definition separate from implementation checklist.
- Do not mix estimated static analysis with actual runtime trace without labels.
- Prefer small vertical slices over broad incomplete platform features.
- Keep tests tied to user-visible behavior.

## Next Recommended Code Task

Implement the UI split:

- `Project Map`: static structure.
- `API Flow`: estimated API path.
- `Runtime Trace`: actual SSE trace.

This should happen before adding deeper static analysis. The reason is that better analysis data will still be confusing if the UI does not clearly separate structure, estimate, and runtime evidence.
