package com.stackflow.backend.dto;

public record ProjectEvidenceItemResponse(
	String name,
	String detectedBy,
	String evidence
) {
}
