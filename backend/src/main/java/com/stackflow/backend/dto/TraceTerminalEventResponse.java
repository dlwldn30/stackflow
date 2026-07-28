package com.stackflow.backend.dto;

import com.stackflow.backend.domain.EventStatus;
import java.time.Instant;

public record TraceTerminalEventResponse(
	String traceId,
	EventStatus resultStatus,
	int httpStatus,
	long durationMs,
	String errorType,
	String errorMessage,
	Instant timestamp
) {
}
