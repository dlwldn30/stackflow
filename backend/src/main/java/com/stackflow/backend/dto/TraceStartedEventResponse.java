package com.stackflow.backend.dto;

import java.time.Instant;

public record TraceStartedEventResponse(
	String traceId,
	String method,
	String endpoint,
	String scenario,
	Instant timestamp
) {
}
