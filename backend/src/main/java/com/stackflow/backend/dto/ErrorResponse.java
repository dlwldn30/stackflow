package com.stackflow.backend.dto;

import com.stackflow.backend.domain.EventStatus;

public record ErrorResponse(
	String traceId,
	String scenario,
	EventStatus resultStatus,
	String errorType,
	String errorMessage
) {
}
