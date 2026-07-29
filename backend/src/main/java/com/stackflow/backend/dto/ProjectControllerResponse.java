package com.stackflow.backend.dto;

public record ProjectControllerResponse(
	String name,
	String packageName,
	String basePath,
	int endpointCount
) {
}
