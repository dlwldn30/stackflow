package com.stackflow.backend.dto;

public record ExternalRequestPayload(
	String targetBaseUrl,
	String method,
	String path,
	String requestBody
) {
}
