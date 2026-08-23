package com.stackflow.backend.domain;

import java.time.Instant;
import java.util.Map;

public record TraceEvent(
	String eventId,
	String traceId,
	ComponentType component,
	String eventType,
	EventStatus status,
	Instant startedAt,
	Instant endedAt,
	long durationMs,
	String errorType,
	String errorMessage,
	Map<String, String> metadata,
	String spanId,
	String parentSpanId,
	String serviceName,
	String spanKind
) {
	public TraceEvent(
		String eventId,
		String traceId,
		ComponentType component,
		String eventType,
		EventStatus status,
		Instant startedAt,
		Instant endedAt,
		long durationMs,
		String errorType,
		String errorMessage,
		Map<String, String> metadata
	) {
		this(
			eventId,
			traceId,
			component,
			eventType,
			status,
			startedAt,
			endedAt,
			durationMs,
			errorType,
			errorMessage,
			metadata,
			null,
			null,
			"stackflow-sample",
			"INTERNAL"
		);
	}
}
