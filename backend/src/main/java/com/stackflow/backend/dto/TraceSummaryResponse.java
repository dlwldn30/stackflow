package com.stackflow.backend.dto;

import com.stackflow.backend.domain.EventStatus;
import java.time.Instant;

public record TraceSummaryResponse(
	String traceId,
	String endpoint,
	String scenario,
	EventStatus resultStatus,
	int httpStatus,
	long durationMs,
	Instant startedAt
) {
}
