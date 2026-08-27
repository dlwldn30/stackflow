package com.stackflow.backend.dto;

public record WorkspaceServiceAnalysisResponse(
	String serviceId,
	String relativePath,
	ProjectStructureResponse structure
) {
}
