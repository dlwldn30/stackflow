package com.stackflow.backend.dto;

import java.util.List;

public record ProjectDomainResponse(
	String id,
	String name,
	String description,
	List<String> responsibilities,
	List<String> infrastructure,
	List<ProjectControllerResponse> controllers,
	List<ProjectLayerResponse> layers,
	List<ApiCatalogItemResponse> endpoints
) {
}
