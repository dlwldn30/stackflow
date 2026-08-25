package com.stackflow.backend.dto;

import java.util.List;

public record ProjectControllerResponse(
	String name,
	String packageName,
	String basePath,
	List<String> basePaths,
	int endpointCount,
	String sourceFile
) {
}
