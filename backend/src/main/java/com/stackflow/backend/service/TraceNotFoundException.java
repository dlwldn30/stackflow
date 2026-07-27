package com.stackflow.backend.service;

public class TraceNotFoundException extends RuntimeException {

	public TraceNotFoundException(String traceId) {
		super("Trace not found: " + traceId);
	}
}
