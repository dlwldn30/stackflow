package com.stackflow.backend.dto;

import java.util.List;

public record ExternalRequestPayload(
	String targetBaseUrl,
	String method,
	String path,
	List<ExternalRequestEntry> queryParams,
	List<ExternalRequestEntry> headers,
	String requestBody
) {
}
