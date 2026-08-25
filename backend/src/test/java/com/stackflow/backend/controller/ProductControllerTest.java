package com.stackflow.backend.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.stackflow.backend.domain.ComponentType;
import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.Trace;
import com.stackflow.backend.dto.ErrorResponse;
import com.stackflow.backend.dto.ProductListResponse;
import com.stackflow.backend.dto.ProductLookupResponse;
import com.stackflow.backend.dto.ProductStockResponse;
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
		TraceService traceService = new TraceService(new com.stackflow.backend.service.TraceStreamService());
		ProductCatalogStore productCatalogStore = new ProductCatalogStore();
		ProductRepositoryService repositoryService = new ProductRepositoryService(productCatalogStore);
		ProductCacheService cacheService = new ProductCacheService();
		ProductService productService = new ProductService(cacheService, repositoryService);

		productController = new ProductController(productService, traceService);
		traceController = new TraceController(traceService);
	}

	@Test
	void returnsProductAndTraceIdForNormalRequest() {
		ResponseEntity<?> response = productController.getProduct(1001L, null, null);

		assertEquals(HttpStatus.OK, response.getStatusCode());
		ProductLookupResponse body = assertInstanceOf(ProductLookupResponse.class, response.getBody());
		assertEquals(EventStatus.SUCCESS, body.resultStatus());
		assertEquals("Redis Deep Dive", body.product().name());
	}

	@Test
	void returnsProductListWithTraceId() {
		ResponseEntity<?> response = productController.listProducts(null, null);

		assertEquals(HttpStatus.OK, response.getStatusCode());
		ProductListResponse body = assertInstanceOf(ProductListResponse.class, response.getBody());
		assertEquals(EventStatus.SUCCESS, body.resultStatus());
		assertEquals(3, body.products().size());
	}

	@Test
	void returnsProductStockWithTraceId() {
		ResponseEntity<?> response = productController.getProductStock(1001L, null, null);

		assertEquals(HttpStatus.OK, response.getStatusCode());
		ProductStockResponse body = assertInstanceOf(ProductStockResponse.class, response.getBody());
		assertEquals(EventStatus.SUCCESS, body.resultStatus());
		assertEquals(42, body.stock());
	}

	@Test
	void refreshesProductCacheWithPostFlow() {
		ResponseEntity<?> response = productController.refreshProductCache(1001L, null, null);

		assertEquals(HttpStatus.OK, response.getStatusCode());
		ProductLookupResponse body = assertInstanceOf(ProductLookupResponse.class, response.getBody());
		assertEquals(EventStatus.SUCCESS, body.resultStatus());
		assertEquals("refreshed", body.cacheStatus());
	}

	@Test
	void marksRedisFallbackAsWarning() {
		ResponseEntity<?> response = productController.getProduct(1001L, "redis-down", null);

		assertEquals(HttpStatus.OK, response.getStatusCode());
		ProductLookupResponse body = assertInstanceOf(ProductLookupResponse.class, response.getBody());
		assertEquals(EventStatus.WARNING, body.resultStatus());
		assertEquals("fallback", body.cacheStatus());
	}

	@Test
	void storesTraceForLaterInspection() {
		ResponseEntity<?> response = productController.getProduct(1002L, null, null);
		ProductLookupResponse body = assertInstanceOf(ProductLookupResponse.class, response.getBody());

		Trace trace = traceController.getTrace(body.traceId());

		assertEquals(body.traceId(), trace.traceId());
		assertEquals("/api/products/1002", trace.endpoint());
		assertEquals(EventStatus.SUCCESS, trace.resultStatus());
		assertEquals("application/json", trace.responsePreview().contentType());
		assertTrue(trace.responsePreview().body().contains("Latency Dashboard Kit"));
	}

	@Test
	void storesTraceEventsByActualStartOrder() {
		ResponseEntity<?> response = productController.getProduct(1002L, null, null);
		ProductLookupResponse body = assertInstanceOf(ProductLookupResponse.class, response.getBody());

		Trace trace = traceController.getTrace(body.traceId());
		List<ComponentType> components = trace.events().stream()
			.map(event -> event.component())
			.toList();

		assertEquals(
			List.of(
				ComponentType.CLIENT,
				ComponentType.CONTROLLER,
				ComponentType.SERVICE,
				ComponentType.REDIS,
				ComponentType.REPOSITORY,
				ComponentType.MYSQL,
				ComponentType.REDIS,
				ComponentType.RESPONSE
			),
			components
		);
	}

	@Test
	void returnsTimeoutForDatabaseScenario() {
		ResponseEntity<?> response = productController.getProduct(1001L, "db-timeout", null);

		assertEquals(HttpStatus.GATEWAY_TIMEOUT, response.getStatusCode());
		ErrorResponse body = assertInstanceOf(ErrorResponse.class, response.getBody());
		assertEquals(EventStatus.TIMEOUT, body.resultStatus());
		Trace trace = traceController.getTrace(body.traceId());
		assertTrue(trace.responsePreview().body().contains("DatabaseTimeoutException"));
	}

	@Test
	void databaseTimeoutBypassesProductCacheHit() {
		ResponseEntity<?> cachedResponse = productController.getProduct(1001L, null, null);
		assertEquals(HttpStatus.OK, cachedResponse.getStatusCode());

		ResponseEntity<?> timeoutResponse = productController.getProduct(1001L, "db-timeout", null);

		assertEquals(HttpStatus.GATEWAY_TIMEOUT, timeoutResponse.getStatusCode());
		ErrorResponse body = assertInstanceOf(ErrorResponse.class, timeoutResponse.getBody());
		assertEquals(EventStatus.TIMEOUT, body.resultStatus());
	}

	@Test
	void exposesRecentTraceList() {
		productController.getProduct(1001L, null, null);
		productController.getProduct(1002L, "redis-down", null);

		List<?> traces = traceController.getRecentTraces();

		assertEquals(2, traces.size());
	}
}
