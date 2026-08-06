package com.stackflow.backend.dto;

import java.util.List;

public record ProjectStructureResponse(
	String projectName,
	String framework,
	String frameworkEvidence,
	ProjectAnalysisStatus analysisStatus,
	String sourceRoot,
	String analysisMessage,
	List<String> infrastructure,
	List<ProjectEvidenceItemResponse> infrastructureDetails,
	List<ProjectLayerResponse> layers,
	List<ProjectDomainResponse> domains
) {
}
