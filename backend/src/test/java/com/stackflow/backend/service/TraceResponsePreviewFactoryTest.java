package com.stackflow.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.stackflow.backend.domain.TraceResponsePreview;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class TraceResponsePreviewFactoryTest {

	@Test
	void recursivelyRedactsSensitiveJsonKeys() {
		TraceResponsePreview preview = TraceResponsePreviewFactory.fromBody(
			"application/json; charset=utf-8",
			"""
				{
				  "Authorization": "Bearer private",
				  "nested": {"access_token": "token-value", "safe": "visible"},
				  "items": [{"session-id": "session-value"}, {"passwordHash": "hash-value"}]
				}
				"""
		).orElseThrow();

		assertEquals("application/json", preview.contentType());
		assertTrue(preview.body().contains("[REDACTED]"));
		assertTrue(preview.body().contains("visible"));
		assertFalse(preview.body().contains("Bearer private"));
		assertFalse(preview.body().contains("token-value"));
		assertFalse(preview.body().contains("session-value"));
		assertFalse(preview.body().contains("hash-value"));
	}

	@Test
	void sanitizesJsonObjectsBeforeSerialization() {
		TraceResponsePreview preview = TraceResponsePreviewFactory.fromJson(Map.of(
			"productId", 1001,
			"credentials", List.of(Map.of("apiSecret", "hidden"))
		)).orElseThrow();

		assertTrue(preview.body().contains("1001"));
		assertTrue(preview.body().contains("[REDACTED]"));
		assertFalse(preview.body().contains("hidden"));
	}

	@Test
	void truncatesUtf8WithoutSplittingCharacters() {
		TraceResponsePreview preview = TraceResponsePreviewFactory.fromBody(
			"text/plain",
			"한".repeat(30_000)
		).orElseThrow();

		assertTrue(preview.truncated());
		assertTrue(preview.body().getBytes(StandardCharsets.UTF_8).length <= TraceResponsePreviewFactory.MAX_BODY_BYTES);
		assertTrue(preview.body().chars().allMatch(character -> character == '한'));
	}

	@Test
	void acceptsStructuredJsonAndTextButRejectsUnsafeBodies() {
		assertTrue(TraceResponsePreviewFactory.fromBody("application/problem+json", "{\"error\":\"bad\"}").isPresent());
		assertTrue(TraceResponsePreviewFactory.fromBody("text/plain; charset=utf-8", "plain response").isPresent());
		assertTrue(TraceResponsePreviewFactory.fromBody("image/png", "binary").isEmpty());
		assertTrue(TraceResponsePreviewFactory.fromBody("application/json", "{invalid").isEmpty());
		assertTrue(TraceResponsePreviewFactory.fromBody("application/json", " ").isEmpty());
	}
}
