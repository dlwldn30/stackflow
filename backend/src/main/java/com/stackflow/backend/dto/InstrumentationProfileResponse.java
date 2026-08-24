package com.stackflow.backend.dto;

import com.stackflow.backend.domain.InstrumentationConnectionStatus;
import java.time.Instant;
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
	Map<String, String> commands,
	String profileId,
	InstrumentationConnectionStatus connectionStatus,
	Instant createdAt,
	Instant lastSeenAt
) {
}
