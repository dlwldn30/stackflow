# External Spring Boot Runtime Tracing Design

## Goal

StackFlow uses static analysis to prepare real runtime tracing. It does not infer runtime calls from class names after execution. The target Spring Boot JVM emits OpenTelemetry spans, and StackFlow renders their actual parent-child relationships.

```text
Analyze project
-> Generate Java Agent launch profile
-> Restart target Spring Boot JVM
-> Send API request from StackFlow
-> Inject W3C traceparent
-> Receive OTLP spans
-> Build span tree and stream it to the UI
```

## Agent Profile

`POST /api/instrumentation/profile` accepts:

```json
{
  "projectPath": "/absolute/path/to/project",
  "collectorBaseUrl": "http://localhost:18080",
  "agentPath": "~/.stackflow/agents/opentelemetry-javaagent.jar"
}
```

The response contains the detected build tool, service name, instrumented FQCNs, `OTEL_INSTRUMENTATION_METHODS_INCLUDE`, environment variables, and Gradle/Maven/JAR launch commands. Every validated Java source root reported by project analysis is scanned, including roots in submodules. Source roots outside the project, missing roots, and symlinks that escape the project are ignored. Duplicate FQCNs and public method names are merged deterministically.

Only public methods of analyzed Controller, Service, UseCase, Repository, Store, Cache, Gateway, and Client classes are added. Java Agent default Spring MVC, JDBC, Redis, and HTTP client instrumentation remains active even when no extra method is found. Older analysis results without a source-root list fall back to the primary `sourceRoot` field.

The Agent JAR is not downloaded automatically. Use the official OpenTelemetry Java Instrumentation release and keep the default local path or enter another path.

### Workspace Profiles

`POST /api/project/workspace/analyze` accepts a common workspace path. StackFlow analyzes up to ten independent Gradle or Maven projects found directly below that path. If there are no independent child projects, the workspace path itself is treated as the existing single project. Child symlinks that resolve outside the workspace are ignored.

`POST /api/instrumentation/workspace-profile` creates one existing Agent profile per detected service and returns each profile with its relative path and working directory. Normalized service names must be unique because `service.name` is the runtime boundary used in a distributed trace.

## Correlation Contract

For an external request with `captureTrace=true`, StackFlow creates:

- 16-byte trace ID encoded as 32 lowercase hexadecimal characters.
- 8-byte parent span ID encoded as 16 lowercase hexadecimal characters.
- W3C header `00-{traceId}-{parentSpanId}-01`.

User-provided `traceparent` and `tracestate` headers are ignored. This prevents a request from escaping the StackFlow correlation context.

The target Java Agent continues the injected trace and exports OTLP HTTP/protobuf to `{collectorBaseUrl}/v1/traces`. StackFlow replays received spans through the existing SSE endpoint for the same trace ID.

## OTLP Ingest

`POST /v1/traces` accepts `application/x-protobuf` and `application/protobuf`. Each span is converted into:

- trace ID, span ID, parent span ID
- service name, span name, span kind
- start/end timestamp and duration
- success/error/timeout state and exception summary
- allowlisted HTTP, network, code, RPC, database, and OTel metadata
- exception stacktrace stored separately from metadata when an OTLP span exception event provides one

Spans are deduplicated by span ID and ordered by start timestamp. For a captured external request, the entry SERVER span is the SERVER span whose parent is the span ID injected by StackFlow. Collection completes only after the HTTP response and entry SERVER span have both arrived and no new span has arrived for two seconds. The hard collection timeout remains 15 seconds, and timed-out traces retain spans from every service that arrived before expiry.

`Trace.serviceName` identifies the entry service instead of whichever service exported last. `Trace.serviceNames` lists every participating service with the entry service first.

### Code Attribute Compatibility

StackFlow preserves the original OTLP metadata keys and normalizes them only for UI display. Current stable function, file, and line keys take precedence when both forms are present.

| Display value | Current key | Legacy fallback |
| --- | --- | --- |
| Function | `code.function.name` | `code.function` |
| Source file | `code.file.path` | `code.filepath` |
| Line | `code.line.number` | `code.lineno` |
| Class | explicit `code.namespace`, otherwise the prefix of fully-qualified `code.function.name` | - |

For Java spans, a fully-qualified `code.function.name` is split at the final `.` for the Inspector's class and method labels. Automatic JDBC or Redis spans without code attributes remain explicitly unidentified rather than inheriting a location from a parent span or stacktrace.

## Data Safety

- Maximum OTLP request size: 5 MB.
- Maximum stored attribute value: 2 KB.
- Maximum stored attributes per span: 64.
- Exception stacktraces are limited to 16 KiB of valid UTF-8 after the current user's home path is shortened to `~`.
- `exception.stacktrace` is not duplicated into the metadata map. The Trace event reports separately whether the stacktrace was truncated.
- Request headers, query values, request bodies, and database statements are not stored.
- Trace details may retain a response preview for JSON, `application/*+json`, and `text/*` responses only. Empty, binary, unsupported, and malformed JSON bodies are discarded.
- JSON keys containing authorization, token, password, secret, cookie, or session are recursively replaced with `[REDACTED]`, ignoring case and `_`, `-`, `.` separators.
- Sanitized response previews are limited to 64 KiB of valid UTF-8 and remain in the same in-memory recent Trace store. Text previews are size-limited but cannot receive structural key redaction.
- Unknown attributes outside the allowlist are discarded.

This is a local development feature, not an authenticated production collector.

## UI States

For workspace traces, the UI keeps service selection above domain and endpoint selection. Waterfall rows include the emitting service and mark a boundary only when a parent and child span have different `service.name` values. The graph groups nodes by service and labels cross-service edges; failure coloring takes precedence over the boundary color.

External trace collection uses these explicit states:

- `Agent 설정 필요`: no instrumentation profile has been generated.
- `Span 대기`: the HTTP request was sent with trace context and StackFlow is waiting for OTLP.
- `수집 중`: one or more spans have arrived.
- `완료`: the span tree is stored and available through Trace API/SSE.
- `수집 시간 초과`: no usable completed trace arrived within 15 seconds. The HTTP result remains valid, and the timed-out trace is stored with any partial spans that arrived.

Stored Trace details and summaries expose execution and collection as separate facts:

- `resultStatus`: the HTTP/span execution result.
- `traceCollectionStatus`: `DISABLED` for sample traces, `COMPLETED` for completed OTLP collection, or `TIMED_OUT` when collection expires.

A collection timeout remains available in recent Trace history and detail lookup. SSE publishes `TIMED_OUT` once as the terminal collection state and then releases the stream.

Sample traces retain the fixed StackFlow component graph. OpenTelemetry traces use the actual `spanId -> parentSpanId` graph.

## Current Limits

- Workspace analysis and Agent profile generation support up to ten local Spring Boot projects; the bundled demo runs Order and Product as two local JVMs.
- The validated distributed path is synchronous HTTP propagation from Order to Product. The collector can merge all participating `service.name` values, but three-or-more-service operation is not a published demo guarantee yet.
- JVM restart is required; dynamic attach is not supported.
- Waterfall rows display the emitting service and explicit parent-child service boundaries. The graph groups span nodes by service and labels cross-service edges from runtime context only.
- Message brokers and asynchronous consumers are not covered by the current HTTP response plus two-second quiet-period completion rule.
- No OTLP Logs ingestion. Exception details are collected only from exception events attached to OTLP spans.
- No authentication, durable storage, sampling administration, or production retention.
- Libraries outside Java Agent support may produce partial traces.

## Automated Acceptance

The Docker Compose job validates both contracts against real Java Agent spans:

- Playwright drives the UI through a normal Order-to-Product request and a Product PostgreSQL timeout propagated as Order HTTP 504. It checks workspace selection, service boundaries, graph grouping, failure cause, Inspector detail, and mobile horizontal overflow.
- `scripts/verify-demo.sh` validates cache miss, cache hit, Redis fallback, direct PostgreSQL timeout, distributed success, and distributed timeout through the backend APIs.
