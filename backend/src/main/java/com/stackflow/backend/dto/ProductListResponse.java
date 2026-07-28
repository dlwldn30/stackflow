package com.stackflow.backend.dto;

import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.Product;
import java.util.List;

public record ProductListResponse(
	String traceId,
	String scenario,
	EventStatus resultStatus,
	List<Product> products
) {
}
