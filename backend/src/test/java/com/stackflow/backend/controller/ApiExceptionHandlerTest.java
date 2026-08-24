package com.stackflow.backend.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.stackflow.backend.service.TraceSessionConflictException;
import com.stackflow.backend.service.TraceStreamCapacityException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ApiExceptionHandlerTest {

	private final ApiExceptionHandler handler = new ApiExceptionHandler();

	@Test
	void mapsTraceSessionConflictToConflict() {
		assertEquals(
			HttpStatus.CONFLICT,
			handler.handleTraceSessionConflict(new TraceSessionConflictException("trace-1")).getStatusCode()
		);
	}

	@Test
	void mapsStreamCapacityToTooManyRequests() {
		assertEquals(
			HttpStatus.TOO_MANY_REQUESTS,
			handler.handleTraceStreamCapacity(new TraceStreamCapacityException("full")).getStatusCode()
		);
	}
}
