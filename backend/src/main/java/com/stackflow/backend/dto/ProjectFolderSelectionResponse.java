package com.stackflow.backend.dto;

public record ProjectFolderSelectionResponse(
	boolean supported,
	boolean selected,
	String projectPath,
	String message
) {
}
