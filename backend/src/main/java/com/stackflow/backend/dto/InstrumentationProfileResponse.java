package com.stackflow.backend.dto;

import java.util.List;
import java.util.Map;

public record InstrumentationProfileResponse(
	String projectName,
	String serviceName,
	String buildTool,
	String collectorEndpoint,
	String agentPath,
	List<String> instrumentedClasses,
	int instrumentedMethodCount,
	String methodsInclude,
	Map<String, String> environment,
	Map<String, String> commands
) {
}
