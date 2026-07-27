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
	Map<String, String> metadata
) {
}
