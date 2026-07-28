package com.stackflow.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.stackflow.backend.dto.ApiCatalogItemResponse;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class SpringApiCatalogServiceTest {

	private final SpringApiCatalogService springApiCatalogService = new SpringApiCatalogService();

	@Test
	void detectsProductControllerApis() {
		List<ApiCatalogItemResponse> catalog = springApiCatalogService.getApiCatalog();
		Set<String> routes = catalog.stream()
			.map(item -> item.method() + " " + item.path())
			.collect(Collectors.toSet());

		assertEquals(4, catalog.size());
		assertTrue(routes.contains("GET /api/products"));
		assertTrue(routes.contains("GET /api/products/{productId}"));
		assertTrue(routes.contains("GET /api/products/{productId}/stock"));
		assertTrue(routes.contains("POST /api/products/{productId}/cache-refresh"));
	}

	@Test
	void exposesControllerAndHandlerMetadata() {
		ApiCatalogItemResponse stockApi = springApiCatalogService.getApiCatalog().stream()
			.filter(item -> item.path().equals("/api/products/{productId}/stock"))
			.findFirst()
			.orElseThrow();

		assertEquals("GET", stockApi.method());
		assertEquals("ProductController", stockApi.controller());
		assertEquals("getProductStock", stockApi.handler());
		assertTrue(stockApi.requiresPathVariable());
		assertEquals(List.of("productId"), stockApi.pathVariables());
	}

	@Test
	void excludesStackFlowInternalTraceApis() {
		List<ApiCatalogItemResponse> catalog = springApiCatalogService.getApiCatalog();

		assertFalse(catalog.stream().anyMatch(item -> item.controller().equals("TraceController")));
		assertFalse(catalog.stream().anyMatch(item -> item.path().startsWith("/api/traces")));
	}
}
