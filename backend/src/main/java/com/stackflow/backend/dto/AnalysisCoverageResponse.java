package com.stackflow.backend.dto;

import java.util.List;

public record AnalysisCoverageResponse(
	List<String> sourceRoots,
	int scannedJavaFiles,
	int controllerCandidates,
	int detectedControllers,
	int detectedEndpoints,
	List<String> warnings
) {
}
