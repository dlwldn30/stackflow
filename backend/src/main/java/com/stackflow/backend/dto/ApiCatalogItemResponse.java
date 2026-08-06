package com.stackflow.backend.dto;

import java.util.List;

public record ApiCatalogItemResponse(
	String id,
	String method,
	String path,
	String controller,
	String handler,
	String requestType,
	boolean requiresPathVariable,
	List<String> pathVariables,
	String sourceFile,
	int sourceLine
) {
}
