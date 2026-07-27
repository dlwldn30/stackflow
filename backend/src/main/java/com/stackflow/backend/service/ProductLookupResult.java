package com.stackflow.backend.service;

import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.Product;

public record ProductLookupResult(
	Product product,
	EventStatus resultStatus,
	String cacheStatus
) {
}
