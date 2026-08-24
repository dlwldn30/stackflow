package com.stackflow.backend.controller;

import com.stackflow.backend.service.TraceNotFoundException;
import com.stackflow.backend.service.TraceSessionConflictException;
import com.stackflow.backend.service.TraceStreamCapacityException;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

	@ExceptionHandler(TraceNotFoundException.class)
	public ResponseEntity<Map<String, String>> handleTraceNotFound(TraceNotFoundException exception) {
		return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
			"error", "TraceNotFound",
			"message", exception.getMessage()
		));
	}

	@ExceptionHandler(TraceSessionConflictException.class)
	public ResponseEntity<Map<String, String>> handleTraceSessionConflict(TraceSessionConflictException exception) {
		return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
			"error", "TraceSessionConflict",
			"message", exception.getMessage()
		));
	}

	@ExceptionHandler(TraceStreamCapacityException.class)
	public ResponseEntity<Map<String, String>> handleTraceStreamCapacity(TraceStreamCapacityException exception) {
		return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of(
			"error", "TraceStreamCapacityExceeded",
			"message", exception.getMessage()
		));
	}
}
