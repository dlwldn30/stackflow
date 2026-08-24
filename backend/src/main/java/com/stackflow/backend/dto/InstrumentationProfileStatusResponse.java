package com.stackflow.backend.dto;

import com.stackflow.backend.domain.InstrumentationConnectionStatus;
import java.time.Instant;

public record InstrumentationProfileStatusResponse(
	String profileId,
	InstrumentationConnectionStatus connectionStatus,
	String serviceName,
	Instant createdAt,
	Instant lastSeenAt
) {
}
