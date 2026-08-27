package com.stackflow.backend.dto;

public record WorkspaceInstrumentationProfileRequest(
	String workspacePath,
	String collectorBaseUrl,
	String agentPath
) {
}
