package com.stackflow.tracelab.product.controller;

import com.stackflow.tracelab.product.dto.TraceLabErrorResponse;
import com.stackflow.tracelab.product.service.ProductNotFoundException;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class TraceLabExceptionHandler {

	@ExceptionHandler(ProductNotFoundException.class)
	public ResponseEntity<TraceLabErrorResponse> handleProductNotFound(ProductNotFoundException exception) {
		return ResponseEntity.status(HttpStatus.NOT_FOUND)
			.body(new TraceLabErrorResponse("PRODUCT_NOT_FOUND", exception.getMessage()));
	}

	@ExceptionHandler(QueryTimeoutException.class)
	public ResponseEntity<TraceLabErrorResponse> handleDatabaseTimeout(QueryTimeoutException exception) {
		return ResponseEntity.status(HttpStatus.GATEWAY_TIMEOUT)
			.body(new TraceLabErrorResponse("DATABASE_TIMEOUT", "PostgreSQL query exceeded the one-second lab timeout."));
	}

	@ExceptionHandler(DataAccessException.class)
	public ResponseEntity<TraceLabErrorResponse> handleDatabaseError(DataAccessException exception) {
		return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
			.body(new TraceLabErrorResponse("DATABASE_ERROR", "The deliberate PostgreSQL failure was recorded."));
	}
}
