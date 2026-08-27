package com.stackflow.orderlab.order.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class ProductClientTest {

	private HttpServer server;
	private ProductClient productClient;

	@BeforeEach
	void setUp() throws IOException {
		server = HttpServer.create(new InetSocketAddress(0), 0);
		server.start();
		productClient = new ProductClient(
			HttpClient.newHttpClient(),
			new ObjectMapper(),
			URI.create("http://localhost:" + server.getAddress().getPort()),
			Duration.ofSeconds(2)
		);
	}

	@AfterEach
	void tearDown() {
		server.stop(0);
	}

	@Test
	void convertsProductJsonResponse() {
		respond("/lab/products/1001", 200, """
			{"id":1001,"name":"Trace Keyboard","price":129000,"source":"DATABASE"}
			""");

		var response = productClient.getProduct(1001L);

		assertThat(response.id()).isEqualTo(1001L);
		assertThat(response.name()).isEqualTo("Trace Keyboard");
		assertThat(response.source()).isEqualTo("DATABASE");
	}

	@Test
	void preservesDownstreamStatusForTimeoutAndNotFound() {
		respond("/lab/products/1001/database-timeout", 504, "{\"code\":\"DATABASE_TIMEOUT\"}");
		respond("/lab/products/9999", 404, "{\"code\":\"PRODUCT_NOT_FOUND\"}");

		assertThatThrownBy(() -> productClient.triggerDatabaseTimeout(1001L))
			.isInstanceOfSatisfying(ProductClientException.class, exception ->
				assertThat(exception.statusCode()).isEqualTo(504));
		assertThatThrownBy(() -> productClient.getProduct(9999L))
			.isInstanceOfSatisfying(ProductClientException.class, exception ->
				assertThat(exception.statusCode()).isEqualTo(404));
	}

	@Test
	void rejectsMalformedProductJson() {
		respond("/lab/products/1001", 200, "not-json");

		assertThatThrownBy(() -> productClient.getProduct(1001L))
			.isInstanceOf(ProductClientException.class)
			.hasMessageContaining("invalid JSON");
	}

	@Test
	void reportsConnectionFailureWithoutDownstreamStatus() {
		server.stop(0);

		assertThatThrownBy(() -> productClient.getProduct(1001L))
			.isInstanceOfSatisfying(ProductClientException.class, exception -> {
				assertThat(exception.statusCode()).isZero();
				assertThat(exception.getMessage()).contains("could not be reached");
			});
	}

	private void respond(String path, int status, String body) {
		server.createContext(path, exchange -> {
			byte[] payload = body.getBytes(StandardCharsets.UTF_8);
			exchange.getResponseHeaders().add("Content-Type", "application/json");
			exchange.sendResponseHeaders(status, payload.length);
			exchange.getResponseBody().write(payload);
			exchange.close();
		});
	}
}
