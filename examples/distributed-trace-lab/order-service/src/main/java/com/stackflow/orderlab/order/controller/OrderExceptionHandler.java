package com.stackflow.orderlab.order.controller;

import com.stackflow.orderlab.order.client.ProductClientException;
import com.stackflow.orderlab.order.dto.OrderErrorResponse;
import com.stackflow.orderlab.order.service.OrderNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class OrderExceptionHandler {

	@ExceptionHandler(OrderNotFoundException.class)
	public ResponseEntity<OrderErrorResponse> handleOrderNotFound(OrderNotFoundException exception) {
		return ResponseEntity.status(HttpStatus.NOT_FOUND)
			.body(new OrderErrorResponse("ORDER_NOT_FOUND", exception.getMessage(), null));
	}

	@ExceptionHandler(ProductClientException.class)
	public ResponseEntity<OrderErrorResponse> handleProductFailure(ProductClientException exception) {
		int downstreamStatus = exception.statusCode();
		if (downstreamStatus == 404) {
			return ResponseEntity.status(HttpStatus.NOT_FOUND)
				.body(new OrderErrorResponse("PRODUCT_NOT_FOUND", exception.getMessage(), downstreamStatus));
		}
		if (downstreamStatus == 504) {
			return ResponseEntity.status(HttpStatus.GATEWAY_TIMEOUT)
				.body(new OrderErrorResponse("DOWNSTREAM_PRODUCT_TIMEOUT", exception.getMessage(), downstreamStatus));
		}
		return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
			.body(new OrderErrorResponse(
				"PRODUCT_SERVICE_UNAVAILABLE",
				exception.getMessage(),
				downstreamStatus == 0 ? null : downstreamStatus
			));
	}
}
