package com.stackflow.backend.dto;

import java.util.List;

public record WorkspaceInstrumentationProfileResponse(
	String workspaceName,
	List<WorkspaceServiceProfileResponse> profiles
) {
}
