package com.stackflow.backend.domain;

public record TraceResponsePreview(
	String contentType,
	String body,
	boolean truncated
) {
}
