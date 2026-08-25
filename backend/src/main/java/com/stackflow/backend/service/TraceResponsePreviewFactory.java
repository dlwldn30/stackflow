package com.stackflow.backend.service;

import com.stackflow.backend.domain.TraceResponsePreview;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

public final class TraceResponsePreviewFactory {

	static final int MAX_BODY_BYTES = 64 * 1024;
	private static final String REDACTED = "[REDACTED]";
	private static final Set<String> SENSITIVE_KEY_PARTS = Set.of(
		"authorization", "token", "password", "secret", "cookie", "session"
	);
	private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

	private TraceResponsePreviewFactory() {
	}

	public static Optional<TraceResponsePreview> fromJson(Object value) {
		if (value == null) {
			return Optional.empty();
		}
		try {
			JsonNode json = OBJECT_MAPPER.valueToTree(value);
			redact(json);
			return build("application/json", OBJECT_MAPPER.writeValueAsString(json));
		} catch (RuntimeException exception) {
			return Optional.empty();
		}
	}

	public static Optional<TraceResponsePreview> fromBody(String contentType, String body) {
		if (body == null || body.isBlank()) {
			return Optional.empty();
		}
		String mediaType = normalizeMediaType(contentType);
		if (isJson(mediaType)) {
			try {
				JsonNode json = OBJECT_MAPPER.readTree(body);
				redact(json);
				return build(mediaType, OBJECT_MAPPER.writeValueAsString(json));
			} catch (RuntimeException exception) {
				return Optional.empty();
			}
		}
		if (mediaType.startsWith("text/")) {
			return build(mediaType, body);
		}
		return Optional.empty();
	}

	private static Optional<TraceResponsePreview> build(String contentType, String body) {
		if (body == null || body.isBlank()) {
			return Optional.empty();
		}
		byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
		if (bytes.length <= MAX_BODY_BYTES) {
			return Optional.of(new TraceResponsePreview(contentType, body, false));
		}

		StringBuilder truncatedBody = new StringBuilder();
		int byteCount = 0;
		for (int offset = 0; offset < body.length();) {
			int codePoint = body.codePointAt(offset);
			String character = new String(Character.toChars(codePoint));
			int characterBytes = character.getBytes(StandardCharsets.UTF_8).length;
			if (byteCount + characterBytes > MAX_BODY_BYTES) {
				break;
			}
			truncatedBody.append(character);
			byteCount += characterBytes;
			offset += Character.charCount(codePoint);
		}
		return Optional.of(new TraceResponsePreview(contentType, truncatedBody.toString(), true));
	}

	private static void redact(JsonNode node) {
		if (node instanceof ObjectNode objectNode) {
			List<String> propertyNames = new ArrayList<>(objectNode.propertyNames());
			for (String propertyName : propertyNames) {
				if (isSensitiveKey(propertyName)) {
					objectNode.put(propertyName, REDACTED);
				} else {
					JsonNode child = objectNode.get(propertyName);
					if (child != null) {
						redact(child);
					}
				}
			}
		} else if (node instanceof ArrayNode arrayNode) {
			arrayNode.forEach(TraceResponsePreviewFactory::redact);
		}
	}

	private static boolean isSensitiveKey(String key) {
		String normalized = key.toLowerCase(Locale.ROOT).replaceAll("[_\\-.]", "");
		return SENSITIVE_KEY_PARTS.stream().anyMatch(normalized::contains);
	}

	private static String normalizeMediaType(String contentType) {
		if (contentType == null) {
			return "";
		}
		return contentType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
	}

	private static boolean isJson(String mediaType) {
		return mediaType.equals("application/json")
			|| mediaType.startsWith("application/") && mediaType.endsWith("+json");
	}
}
