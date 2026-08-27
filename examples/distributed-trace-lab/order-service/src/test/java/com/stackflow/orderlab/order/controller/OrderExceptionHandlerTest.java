package com.stackflow.orderlab.order.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.stackflow.orderlab.order.client.ProductClientException;
import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class OrderExceptionHandlerTest {

	private final OrderExceptionHandler handler = new OrderExceptionHandler();

	@Test
	void mapsProductTimeoutToGatewayTimeout() {
		var response = handler.handleProductFailure(new ProductClientException(504, "timeout"));

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.GATEWAY_TIMEOUT);
		assertThat(response.getBody().code()).isEqualTo("DOWNSTREAM_PRODUCT_TIMEOUT");
	}

	@Test
	void mapsProductNotFoundAndOtherFailures() {
		assertThat(handler.handleProductFailure(new ProductClientException(404, "missing")).getStatusCode())
			.isEqualTo(HttpStatus.NOT_FOUND);
		assertThat(handler.handleProductFailure(new ProductClientException(500, "failed")).getStatusCode())
			.isEqualTo(HttpStatus.BAD_GATEWAY);
		assertThat(handler.handleProductFailure(new ProductClientException("offline", new IOException())).getStatusCode())
			.isEqualTo(HttpStatus.BAD_GATEWAY);
	}
}
