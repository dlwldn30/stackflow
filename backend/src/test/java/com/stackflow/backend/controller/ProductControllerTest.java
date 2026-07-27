package com.stackflow.backend.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.Trace;
import com.stackflow.backend.dto.ErrorResponse;
import com.stackflow.backend.dto.ProductLookupResponse;
import com.stackflow.backend.service.ProductCacheService;
import com.stackflow.backend.service.ProductRepositoryService;
import com.stackflow.backend.service.ProductService;
import com.stackflow.backend.service.TraceService;
import com.stackflow.backend.store.ProductCatalogStore;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class ProductControllerTest {

	private ProductController productController;
	private TraceController traceController;

	@BeforeEach
	void setUp() {
		TraceService traceService = new TraceService();
		ProductCatalogStore productCatalogStore = new ProductCatalogStore();
		ProductRepositoryService repositoryService = new ProductRepositoryService(productCatalogStore);
		ProductCacheService cacheService = new ProductCacheService();
		ProductService productService = new ProductService(cacheService, repositoryService);

		productController = new ProductController(productService, traceService);
		traceController = new TraceController(traceService);
	}

	@Test
	void returnsProductAndTraceIdForNormalRequest() {
		ResponseEntity<?> response = productController.getProduct(1001L, null);

		assertEquals(HttpStatus.OK, response.getStatusCode());
		ProductLookupResponse body = assertInstanceOf(ProductLookupResponse.class, response.getBody());
		assertEquals(EventStatus.SUCCESS, body.resultStatus());
		assertEquals("Redis Deep Dive", body.product().name());
	}

	@Test
	void marksRedisFallbackAsWarning() {
		ResponseEntity<?> response = productController.getProduct(1001L, "redis-down");

		assertEquals(HttpStatus.OK, response.getStatusCode());
		ProductLookupResponse body = assertInstanceOf(ProductLookupResponse.class, response.getBody());
		assertEquals(EventStatus.WARNING, body.resultStatus());
		assertEquals("fallback", body.cacheStatus());
	}

	@Test
	void storesTraceForLaterInspection() {
		ResponseEntity<?> response = productController.getProduct(1002L, null);
		ProductLookupResponse body = assertInstanceOf(ProductLookupResponse.class, response.getBody());

		Trace trace = traceController.getTrace(body.traceId());

		assertEquals(body.traceId(), trace.traceId());
		assertEquals("/api/products/1002", trace.endpoint());
		assertEquals(EventStatus.SUCCESS, trace.resultStatus());
	}

	@Test
	void returnsTimeoutForDatabaseScenario() {
		ResponseEntity<?> response = productController.getProduct(1001L, "db-timeout");

		assertEquals(HttpStatus.GATEWAY_TIMEOUT, response.getStatusCode());
		ErrorResponse body = assertInstanceOf(ErrorResponse.class, response.getBody());
		assertEquals(EventStatus.TIMEOUT, body.resultStatus());
	}

	@Test
	void exposesRecentTraceList() {
		productController.getProduct(1001L, null);
		productController.getProduct(1002L, "redis-down");

		List<?> traces = traceController.getRecentTraces();

		assertEquals(2, traces.size());
	}
}
