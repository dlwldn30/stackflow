package com.stackflow.backend.dto;

import java.util.List;

public record WorkspaceAnalysisResponse(
	String workspaceName,
	List<WorkspaceServiceAnalysisResponse> services,
	List<String> warnings
) {
}
