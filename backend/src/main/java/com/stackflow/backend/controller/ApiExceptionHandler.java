package com.stackflow.backend.controller;

import com.stackflow.backend.service.TraceNotFoundException;
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
}
