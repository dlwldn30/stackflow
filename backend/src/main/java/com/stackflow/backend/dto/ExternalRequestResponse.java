package com.stackflow.backend.dto;

public record ExternalRequestResponse(
	String method,
	String targetUrl,
	int httpStatus,
	long durationMs,
	String resultStatus,
	String contentType,
	String responseBody,
	String errorMessage
) {
}
