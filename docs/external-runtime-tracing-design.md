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
- allowlisted HTTP, network, code, RPC, database, exception, and OTel metadata

Spans are deduplicated by span ID and ordered by start timestamp. A SERVER span marks the trace as eligible for completion after a short quiet period so late spans in the same export cycle can be merged.

## Data Safety

- Maximum OTLP request size: 5 MB.
- Maximum stored attribute value: 2 KB.
- Maximum stored attributes per span: 64.
- Request headers, query values, request bodies, and database statements are not stored.
- Trace details may retain a response preview for JSON, `application/*+json`, and `text/*` responses only. Empty, binary, unsupported, and malformed JSON bodies are discarded.
- JSON keys containing authorization, token, password, secret, cookie, or session are recursively replaced with `[REDACTED]`, ignoring case and `_`, `-`, `.` separators.
- Sanitized response previews are limited to 64 KiB of valid UTF-8 and remain in the same in-memory recent Trace store. Text previews are size-limited but cannot receive structural key redaction.
- Unknown attributes outside the allowlist are discarded.

This is a local development feature, not an authenticated production collector.

## UI States

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

- One local Spring Boot JVM.
- JVM restart is required; dynamic attach is not supported.
- No cross-service distributed trace UI.
- No authentication, durable storage, sampling administration, or production retention.
- Libraries outside Java Agent support may produce partial traces.
