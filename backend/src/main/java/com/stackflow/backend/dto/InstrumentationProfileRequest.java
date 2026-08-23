package com.stackflow.backend.dto;

public record InstrumentationProfileRequest(
	String projectPath,
	String collectorBaseUrl,
	String agentPath
) {
}
