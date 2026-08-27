package com.stackflow.backend.dto;

public record WorkspaceServiceProfileResponse(
	String serviceId,
	String relativePath,
	String workingDirectory,
	InstrumentationProfileResponse profile
) {
}
