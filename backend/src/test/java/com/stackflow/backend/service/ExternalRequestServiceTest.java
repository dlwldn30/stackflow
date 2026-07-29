package com.stackflow.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.stackflow.backend.dto.ExternalRequestPayload;
import com.stackflow.backend.dto.ExternalRequestResponse;
import java.net.http.HttpClient;
import org.junit.jupiter.api.Test;

class ExternalRequestServiceTest {

	private final ExternalRequestService externalRequestService = new ExternalRequestService(HttpClient.newHttpClient());

	@Test
	void buildsTargetUriFromBaseUrlAndPath() {
		assertEquals(
			"http://localhost:8081/api/products/1001",
			externalRequestService.buildTargetUri("http://localhost:8081/", "/api/products/1001").toString()
		);
	}

	@Test
	void rejectsNonHttpTargetUrl() {
		ExternalRequestResponse response = externalRequestService.execute(
			new ExternalRequestPayload("file:///tmp/app", "GET", "/api/products", null)
		);

		assertEquals("ERROR", response.resultStatus());
		assertEquals(0, response.httpStatus());
		assertEquals("Only http:// and https:// target URLs are supported.", response.errorMessage());
	}

	@Test
	void rejectsUnsupportedMethod() {
		ExternalRequestResponse response = externalRequestService.execute(
			new ExternalRequestPayload("http://localhost:8081", "TRACE", "/api/products", null)
		);

		assertEquals("ERROR", response.resultStatus());
		assertEquals(0, response.httpStatus());
		assertEquals("Unsupported method: TRACE", response.errorMessage());
	}
}
