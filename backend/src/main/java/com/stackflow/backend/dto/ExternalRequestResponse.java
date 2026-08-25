package com.stackflow.backend.dto;

import com.stackflow.backend.domain.TraceCollectionStatus;

public record ExternalRequestResponse(
	String method,
	String targetUrl,
	int httpStatus,
	long durationMs,
	String resultStatus,
	String contentType,
	String responseBody,
	boolean responseBodyTruncated,
	String errorMessage,
	String traceId,
	TraceCollectionStatus traceCollectionStatus
) {
	public ExternalRequestResponse(
		String method,
		String targetUrl,
		int httpStatus,
		long durationMs,
		String resultStatus,
		String contentType,
		String responseBody,
		String errorMessage
	) {
		this(
			method,
			targetUrl,
			httpStatus,
			durationMs,
			resultStatus,
			contentType,
			responseBody,
			false,
			errorMessage,
			null,
			TraceCollectionStatus.DISABLED
		);
	}
}
