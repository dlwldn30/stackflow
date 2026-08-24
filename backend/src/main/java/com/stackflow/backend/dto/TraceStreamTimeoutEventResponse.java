package com.stackflow.backend.dto;

import java.time.Instant;

public record TraceStreamTimeoutEventResponse(
	String traceId,
	Instant timestamp,
	String message
) {
}
