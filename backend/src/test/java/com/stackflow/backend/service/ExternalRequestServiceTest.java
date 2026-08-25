package com.stackflow.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.stackflow.backend.dto.ExternalRequestEntry;
import com.stackflow.backend.dto.ExternalRequestPayload;
import com.stackflow.backend.dto.ExternalRequestResponse;
import java.net.http.HttpClient;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

class ExternalRequestServiceTest {

	private final ExternalRequestService externalRequestService = new ExternalRequestService(HttpClient.newHttpClient(), true);
	private final ExternalRequestService restrictedExternalRequestService = new ExternalRequestService(HttpClient.newHttpClient(), false);

	@Test
	void buildsTargetUriFromBaseUrlAndPath() {
		assertEquals(
			"http://localhost:8081/api/products/1001",
			externalRequestService.buildTargetUri("http://localhost:8081/", "/api/products/1001").toString()
		);
	}

	@Test
	void buildsTargetUriWithEnabledQueryParams() {
		assertEquals(
			"http://localhost:8081/api/products?page=1&keyword=redis%20cache",
			externalRequestService.buildTargetUri(
				"http://localhost:8081",
				"/api/products",
				List.of(
					new ExternalRequestEntry("page", "1", true),
					new ExternalRequestEntry("keyword", "redis cache", true),
					new ExternalRequestEntry("ignored", "value", false)
				)
			).toString()
		);
	}

	@Test
	void rejectsNonHttpTargetUrl() {
		ExternalRequestResponse response = externalRequestService.execute(
			new ExternalRequestPayload("file:///tmp/app", "GET", "/api/products", List.of(), List.of(), null)
		);

		assertEquals("ERROR", response.resultStatus());
		assertEquals(0, response.httpStatus());
		assertEquals("Only http:// and https:// target URLs are supported.", response.errorMessage());
	}

	@Test
	void rejectsUnsupportedMethod() {
		ExternalRequestResponse response = externalRequestService.execute(
			new ExternalRequestPayload("http://localhost:8081", "TRACE", "/api/products", List.of(), List.of(), null)
		);

		assertEquals("ERROR", response.resultStatus());
		assertEquals(0, response.httpStatus());
		assertEquals("Unsupported method: TRACE", response.errorMessage());
	}

	@Test
	void rejectsPrivateTargetUrlsByDefault() {
		IllegalArgumentException exception = assertThrows(
			IllegalArgumentException.class,
			() -> restrictedExternalRequestService.buildTargetUri("http://127.0.0.1:8081", "/api/products")
		);

		assertEquals("Private target URLs are blocked by default.", exception.getMessage());
	}

	@Test
	void rejectsLocalhostTargetUrlsByDefault() {
		ExternalRequestResponse response = restrictedExternalRequestService.execute(
			new ExternalRequestPayload("http://localhost:8081", "GET", "/api/products", List.of(), List.of(), null)
		);

		assertEquals("ERROR", response.resultStatus());
		assertEquals(0, response.httpStatus());
		assertEquals("Private target URLs are blocked by default.", response.errorMessage());
	}

	@Test
	void rejectsCloudMetadataTargetUrlsByDefault() {
		IllegalArgumentException exception = assertThrows(
			IllegalArgumentException.class,
			() -> restrictedExternalRequestService.buildTargetUri("http://169.254.169.254", "/latest/meta-data")
		);

		assertEquals("Private target URLs are blocked by default.", exception.getMessage());
	}

	@Test
	void allowsPublicTargetUrlsByDefault() {
		assertEquals(
			"http://93.184.216.34/api/products",
			restrictedExternalRequestService.buildTargetUri("http://93.184.216.34", "/api/products").toString()
		);
	}

	@Test
	void injectsStackFlowTraceparentWhenTraceCaptureIsEnabled() throws Exception {
		AtomicReference<String> receivedTraceparent = new AtomicReference<>();
		HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/orders", exchange -> {
			receivedTraceparent.set(exchange.getRequestHeaders().getFirst("traceparent"));
			byte[] body = "ok".getBytes(StandardCharsets.UTF_8);
			exchange.sendResponseHeaders(200, body.length);
			exchange.getResponseBody().write(body);
			exchange.close();
		});
		server.start();
		ExternalTraceService traceCaptureService = new ExternalTraceService(new TraceService(new TraceStreamService()));
		ExternalRequestService service = new ExternalRequestService(HttpClient.newHttpClient(), true, traceCaptureService);
		try {
			ExternalRequestResponse response = service.execute(new ExternalRequestPayload(
				"http://127.0.0.1:" + server.getAddress().getPort(),
				"GET",
				"/orders",
				List.of(),
				List.of(new ExternalRequestEntry("traceparent", "00-invalid-invalid-01", true)),
				null,
				true
			));

			assertEquals("PENDING", response.traceCollectionStatus().name());
			assertNotNull(response.traceId());
			assertEquals(32, response.traceId().length());
			assertTrue(receivedTraceparent.get().matches("00-[0-9a-f]{32}-[0-9a-f]{16}-01"));
			assertTrue(receivedTraceparent.get().contains(response.traceId()));
		} finally {
			traceCaptureService.shutdown();
			server.stop(0);
		}
	}

	@Test
	void returnsResponseBodyWithinOneMiBWithoutTruncation() throws Exception {
		ExternalRequestResponse response = executeServerResponse("{\"status\":\"ok\"}".getBytes(StandardCharsets.UTF_8), "application/json");

		assertEquals("{\"status\":\"ok\"}", response.responseBody());
		assertFalse(response.responseBodyTruncated());
	}

	@Test
	void truncatesResponseBodyAtOneMiB() throws Exception {
		byte[] body = ("{\"value\":\"" + "a".repeat(ExternalRequestService.MAX_RESPONSE_BODY_BYTES) + "\"}")
			.getBytes(StandardCharsets.UTF_8);

		ExternalRequestResponse response = executeServerResponse(body, "application/json");

		assertTrue(response.responseBodyTruncated());
		assertEquals(ExternalRequestService.MAX_RESPONSE_BODY_BYTES, response.responseBody().getBytes(StandardCharsets.UTF_8).length);
	}

	@Test
	void removesIncompleteUtf8CharacterFromTruncatedBody() throws Exception {
		String body = "a".repeat(ExternalRequestService.MAX_RESPONSE_BODY_BYTES - 1) + "한" + "tail";

		ExternalRequestResponse response = executeServerResponse(body.getBytes(StandardCharsets.UTF_8), "text/plain; charset=utf-8");

		assertTrue(response.responseBodyTruncated());
		assertEquals(ExternalRequestService.MAX_RESPONSE_BODY_BYTES - 1, response.responseBody().getBytes(StandardCharsets.UTF_8).length);
		assertFalse(response.responseBody().contains("�"));
	}

	@Test
	void excludesTruncatedJsonFromTracePreviewInput() {
		assertNull(externalRequestService.responseBodyForTrace("application/json", "{\"partial\":", true));
		assertNull(externalRequestService.responseBodyForTrace("application/problem+json", "{\"partial\":", true));
		assertEquals("partial text", externalRequestService.responseBodyForTrace("text/plain", "partial text", true));
	}

	private ExternalRequestResponse executeServerResponse(byte[] body, String contentType) throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/response", exchange -> {
			exchange.getResponseHeaders().set("Content-Type", contentType);
			exchange.sendResponseHeaders(200, body.length);
			try {
				exchange.getResponseBody().write(body);
			} finally {
				exchange.close();
			}
		});
		server.start();
		try {
			return externalRequestService.execute(new ExternalRequestPayload(
				"http://127.0.0.1:" + server.getAddress().getPort(),
				"GET",
				"/response",
				List.of(),
				List.of(),
				null
			));
		} finally {
			server.stop(0);
		}
	}
}
