package com.stackflow.backend.dto;

import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.TraceCollectionStatus;
import java.time.Instant;

public record TraceSummaryResponse(
	String traceId,
	String endpoint,
	String scenario,
	EventStatus resultStatus,
	int httpStatus,
	long durationMs,
	Instant startedAt,
	TraceCollectionStatus traceCollectionStatus
) {
}
