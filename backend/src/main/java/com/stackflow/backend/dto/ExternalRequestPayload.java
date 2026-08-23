package com.stackflow.backend.dto;

import java.util.List;

public record ExternalRequestPayload(
	String targetBaseUrl,
	String method,
	String path,
	List<ExternalRequestEntry> queryParams,
	List<ExternalRequestEntry> headers,
	String requestBody,
	boolean captureTrace
) {
	public ExternalRequestPayload(
		String targetBaseUrl,
		String method,
		String path,
		List<ExternalRequestEntry> queryParams,
		List<ExternalRequestEntry> headers,
		String requestBody
	) {
		this(targetBaseUrl, method, path, queryParams, headers, requestBody, false);
	}
}
