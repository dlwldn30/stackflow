package com.stackflow.backend.dto;

public record ExternalRequestEntry(
	String key,
	String value,
	boolean enabled
) {
}
