package com.stackflow.backend.dto;

import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.Product;

public record ProductLookupResponse(
	String traceId,
	String scenario,
	EventStatus resultStatus,
	String cacheStatus,
	Product product
) {
}
