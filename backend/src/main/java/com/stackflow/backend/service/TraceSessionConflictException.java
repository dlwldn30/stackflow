package com.stackflow.backend.service;

public class TraceSessionConflictException extends RuntimeException {

	public TraceSessionConflictException(String traceId) {
		super("Trace session was already started or completed: " + traceId);
	}
}
