package com.stackflow.backend.dto;

import com.stackflow.backend.domain.EventStatus;

public record ProductStockResponse(
	String traceId,
	String scenario,
	EventStatus resultStatus,
	Long productId,
	int stock
) {
}
