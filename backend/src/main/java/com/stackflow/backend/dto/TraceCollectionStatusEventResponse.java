package com.stackflow.backend.dto;

import com.stackflow.backend.domain.TraceCollectionStatus;
import java.time.Instant;

public record TraceCollectionStatusEventResponse(
	String traceId,
	TraceCollectionStatus status,
	String message,
	Instant timestamp
) {
}
