package com.stackflow.backend.dto;

import java.util.List;

public record ProjectStructureResponse(
	String projectName,
	String framework,
	List<String> infrastructure,
	List<ProjectLayerResponse> layers,
	List<ProjectDomainResponse> domains
) {
}
