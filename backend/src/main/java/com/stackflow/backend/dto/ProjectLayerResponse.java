package com.stackflow.backend.dto;

import java.util.List;

public record ProjectLayerResponse(
	String name,
	String type,
	List<String> classes,
	String evidence
) {
}
