package com.stackflow.backend.controller;

import com.stackflow.backend.domain.ComponentType;
import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.Product;
import com.stackflow.backend.domain.ScenarioMode;
import com.stackflow.backend.domain.Trace;
import com.stackflow.backend.dto.ErrorResponse;
import com.stackflow.backend.dto.ProductListResponse;
import com.stackflow.backend.dto.ProductLookupResponse;
import com.stackflow.backend.dto.ProductStockResponse;
import com.stackflow.backend.service.DatabaseTimeoutException;
import com.stackflow.backend.service.ProductLookupResult;
import com.stackflow.backend.service.ProductNotFoundException;
import com.stackflow.backend.service.ProductService;
import com.stackflow.backend.service.ServiceProcessingException;
import com.stackflow.backend.service.TraceService;
import com.stackflow.backend.service.TraceSession;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ProductController {

	private final ProductService productService;
	private final TraceService traceService;

	public ProductController(ProductService productService, TraceService traceService) {
		this.productService = productService;
		this.traceService = traceService;
	}

	@GetMapping("/products")
	public ResponseEntity<?> listProducts(
		@RequestParam(required = false) String scenario,
		@RequestParam(required = false) String traceId
	) {
		ScenarioMode scenarioMode = ScenarioMode.from(scenario);
		TraceSession traceSession = startApiTrace(
			traceId,
			"GET",
			"/api/products",
			scenarioMode,
			Map.of("scenario", scenarioMode.apiValue())
		);
		TraceSession.TraceStep controllerStep = traceSession.startStep(
			ComponentType.CONTROLLER,
			"ProductController.listProducts",
			Map.of("api", "product-list")
		);

		try {
			List<Product> products = productService.listProducts(scenarioMode, traceSession);
			traceSession.finishStep(controllerStep, EventStatus.SUCCESS, null, null, Map.of("count", Integer.toString(products.size())));
			traceSession.recordInstant(
				ComponentType.RESPONSE,
				"http.response",
				EventStatus.SUCCESS,
				Map.of("httpStatus", "200")
			);
			Trace trace = traceService.completeTrace(traceSession, 200, EventStatus.SUCCESS);
			return ResponseEntity.ok(new ProductListResponse(
				trace.traceId(),
				scenarioMode.apiValue(),
				EventStatus.SUCCESS,
				products
			));
		} catch (ProductNotFoundException exception) {
			return buildError(traceSession, controllerStep, scenarioMode, HttpStatus.NOT_FOUND, EventStatus.ERROR, exception);
		} catch (DatabaseTimeoutException exception) {
			return buildError(traceSession, controllerStep, scenarioMode, HttpStatus.GATEWAY_TIMEOUT, EventStatus.TIMEOUT, exception);
		} catch (ServiceProcessingException exception) {
			return buildError(traceSession, controllerStep, scenarioMode, HttpStatus.INTERNAL_SERVER_ERROR, EventStatus.ERROR, exception);
		}
	}

	@GetMapping("/products/{productId}")
	public ResponseEntity<?> getProduct(
		@PathVariable Long productId,
		@RequestParam(required = false) String scenario,
		@RequestParam(required = false) String traceId
	) {
		ScenarioMode scenarioMode = ScenarioMode.from(scenario);
		String resolvedTraceId = traceId == null || traceId.isBlank()
			? traceService.createTraceSession().traceId()
			: traceId;
		TraceSession traceSession = traceService.startTrace(
			resolvedTraceId,
			"GET",
			"/api/products/" + productId,
			scenarioMode.apiValue()
		);
		traceService.publishTraceStarted(traceSession);

		traceSession.recordInstant(
			ComponentType.CLIENT,
			"http.request.received",
			EventStatus.SUCCESS,
			Map.of("productId", productId.toString(), "scenario", scenarioMode.apiValue())
		);

		TraceSession.TraceStep controllerStep = traceSession.startStep(
			ComponentType.CONTROLLER,
			"ProductController.getProduct",
			Map.of("productId", productId.toString())
		);

		try {
			ProductLookupResult result = productService.lookupProduct(productId, scenarioMode, traceSession);
			traceSession.finishStep(controllerStep, result.resultStatus(), null, null, Map.of("cacheStatus", result.cacheStatus()));
			traceSession.recordInstant(
				ComponentType.RESPONSE,
				"http.response",
				result.resultStatus(),
				Map.of("httpStatus", "200")
			);
			Trace trace = traceService.completeTrace(traceSession, 200, result.resultStatus());
			return ResponseEntity.ok(new ProductLookupResponse(
				trace.traceId(),
				scenarioMode.apiValue(),
				result.resultStatus(),
				result.cacheStatus(),
				result.product()
			));
		} catch (ProductNotFoundException exception) {
			return buildError(traceSession, controllerStep, scenarioMode, HttpStatus.NOT_FOUND, EventStatus.ERROR, exception);
		} catch (DatabaseTimeoutException exception) {
			return buildError(traceSession, controllerStep, scenarioMode, HttpStatus.GATEWAY_TIMEOUT, EventStatus.TIMEOUT, exception);
		} catch (ServiceProcessingException exception) {
			return buildError(traceSession, controllerStep, scenarioMode, HttpStatus.INTERNAL_SERVER_ERROR, EventStatus.ERROR, exception);
		}
	}

	@GetMapping("/products/{productId}/stock")
	public ResponseEntity<?> getProductStock(
		@PathVariable Long productId,
		@RequestParam(required = false) String scenario,
		@RequestParam(required = false) String traceId
	) {
		ScenarioMode scenarioMode = ScenarioMode.from(scenario);
		TraceSession traceSession = startApiTrace(
			traceId,
			"GET",
			"/api/products/" + productId + "/stock",
			scenarioMode,
			Map.of("productId", productId.toString(), "scenario", scenarioMode.apiValue())
		);
		TraceSession.TraceStep controllerStep = traceSession.startStep(
			ComponentType.CONTROLLER,
			"ProductController.getProductStock",
			Map.of("productId", productId.toString())
		);

		try {
			int stock = productService.getProductStock(productId, scenarioMode, traceSession);
			traceSession.finishStep(controllerStep, EventStatus.SUCCESS, null, null, Map.of("stock", Integer.toString(stock)));
			traceSession.recordInstant(
				ComponentType.RESPONSE,
				"http.response",
				EventStatus.SUCCESS,
				Map.of("httpStatus", "200")
			);
			Trace trace = traceService.completeTrace(traceSession, 200, EventStatus.SUCCESS);
			return ResponseEntity.ok(new ProductStockResponse(
				trace.traceId(),
				scenarioMode.apiValue(),
				EventStatus.SUCCESS,
				productId,
				stock
			));
		} catch (ProductNotFoundException exception) {
			return buildError(traceSession, controllerStep, scenarioMode, HttpStatus.NOT_FOUND, EventStatus.ERROR, exception);
		} catch (DatabaseTimeoutException exception) {
			return buildError(traceSession, controllerStep, scenarioMode, HttpStatus.GATEWAY_TIMEOUT, EventStatus.TIMEOUT, exception);
		} catch (ServiceProcessingException exception) {
			return buildError(traceSession, controllerStep, scenarioMode, HttpStatus.INTERNAL_SERVER_ERROR, EventStatus.ERROR, exception);
		}
	}

	@PostMapping("/products/{productId}/cache-refresh")
	public ResponseEntity<?> refreshProductCache(
		@PathVariable Long productId,
		@RequestParam(required = false) String scenario,
		@RequestParam(required = false) String traceId
	) {
		ScenarioMode scenarioMode = ScenarioMode.from(scenario);
		TraceSession traceSession = startApiTrace(
			traceId,
			"POST",
			"/api/products/" + productId + "/cache-refresh",
			scenarioMode,
			Map.of("productId", productId.toString(), "scenario", scenarioMode.apiValue())
		);
		TraceSession.TraceStep controllerStep = traceSession.startStep(
			ComponentType.CONTROLLER,
			"ProductController.refreshProductCache",
			Map.of("productId", productId.toString())
		);

		try {
			ProductLookupResult result = productService.refreshProductCache(productId, scenarioMode, traceSession);
			traceSession.finishStep(controllerStep, result.resultStatus(), null, null, Map.of("cacheStatus", result.cacheStatus()));
			traceSession.recordInstant(
				ComponentType.RESPONSE,
				"http.response",
				result.resultStatus(),
				Map.of("httpStatus", "200")
			);
			Trace trace = traceService.completeTrace(traceSession, 200, result.resultStatus());
			return ResponseEntity.ok(new ProductLookupResponse(
				trace.traceId(),
				scenarioMode.apiValue(),
				result.resultStatus(),
				result.cacheStatus(),
				result.product()
			));
		} catch (ProductNotFoundException exception) {
			return buildError(traceSession, controllerStep, scenarioMode, HttpStatus.NOT_FOUND, EventStatus.ERROR, exception);
		} catch (DatabaseTimeoutException exception) {
			return buildError(traceSession, controllerStep, scenarioMode, HttpStatus.GATEWAY_TIMEOUT, EventStatus.TIMEOUT, exception);
		} catch (ServiceProcessingException exception) {
			return buildError(traceSession, controllerStep, scenarioMode, HttpStatus.INTERNAL_SERVER_ERROR, EventStatus.ERROR, exception);
		}
	}

	private TraceSession startApiTrace(
		String traceId,
		String method,
		String endpoint,
		ScenarioMode scenarioMode,
		Map<String, String> clientMetadata
	) {
		String resolvedTraceId = traceId == null || traceId.isBlank()
			? traceService.createTraceSession().traceId()
			: traceId;
		TraceSession traceSession = traceService.startTrace(
			resolvedTraceId,
			method,
			endpoint,
			scenarioMode.apiValue()
		);
		traceService.publishTraceStarted(traceSession);
		traceSession.recordInstant(
			ComponentType.CLIENT,
			"http.request.received",
			EventStatus.SUCCESS,
			clientMetadata
		);
		return traceSession;
	}

	private ResponseEntity<ErrorResponse> buildError(
		TraceSession traceSession,
		TraceSession.TraceStep controllerStep,
		ScenarioMode scenarioMode,
		HttpStatus httpStatus,
		EventStatus resultStatus,
		RuntimeException exception
	) {
		traceSession.finishStep(
			controllerStep,
			resultStatus,
			exception.getClass().getSimpleName(),
			exception.getMessage(),
			Map.of()
		);
		traceSession.recordInstant(
			ComponentType.RESPONSE,
			"http.response",
			resultStatus,
			Map.of("httpStatus", Integer.toString(httpStatus.value()))
		);
		Trace trace = traceService.completeTrace(traceSession, httpStatus.value(), resultStatus);
		return ResponseEntity.status(httpStatus).body(new ErrorResponse(
			trace.traceId(),
			scenarioMode.apiValue(),
			resultStatus,
			exception.getClass().getSimpleName(),
			exception.getMessage()
		));
	}
}
