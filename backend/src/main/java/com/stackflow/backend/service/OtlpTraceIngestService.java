package com.stackflow.backend.service;

import com.google.protobuf.ByteString;
import io.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;
import io.opentelemetry.proto.common.v1.AnyValue;
import io.opentelemetry.proto.common.v1.KeyValue;
import io.opentelemetry.proto.resource.v1.Resource;
import io.opentelemetry.proto.trace.v1.ResourceSpans;
import io.opentelemetry.proto.trace.v1.ScopeSpans;
import io.opentelemetry.proto.trace.v1.Span;
import com.stackflow.backend.domain.ComponentType;
import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.TraceEvent;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class OtlpTraceIngestService {

	private static final int MAX_ATTRIBUTES = 64;
	private static final int MAX_ATTRIBUTE_VALUE_LENGTH = 2048;
	private static final Set<String> BLOCKED_ATTRIBUTE_PARTS = Set.of(
		"header", "cookie", "query", "body", "statement", "authorization", "token", "password", "secret"
	);
	private static final List<String> ALLOWED_ATTRIBUTE_PREFIXES = List.of(
		"code.", "http.", "url.", "server.", "network.", "db.", "rpc.", "exception.", "otel."
	);

	private final ExternalTraceService externalTraceService;

	public OtlpTraceIngestService(ExternalTraceService externalTraceService) {
		this.externalTraceService = externalTraceService;
	}

	public int ingest(ExportTraceServiceRequest request) {
		int acceptedSpanCount = 0;
		for (ResourceSpans resourceSpans : request.getResourceSpansList()) {
			String serviceName = readServiceName(resourceSpans.getResource());
			Map<String, List<TraceEvent>> eventsByTrace = new LinkedHashMap<>();
			for (ScopeSpans scopeSpans : resourceSpans.getScopeSpansList()) {
				for (Span span : scopeSpans.getSpansList()) {
					if (span.getTraceId().isEmpty() || span.getSpanId().isEmpty()) {
						continue;
					}
					TraceEvent event = toTraceEvent(serviceName, span);
					eventsByTrace.computeIfAbsent(event.traceId(), ignored -> new ArrayList<>()).add(event);
					acceptedSpanCount++;
				}
			}
			eventsByTrace.forEach((traceId, events) -> externalTraceService.acceptSpans(traceId, serviceName, events));
		}
		return acceptedSpanCount;
	}

	private TraceEvent toTraceEvent(String serviceName, Span span) {
		Map<String, String> metadata = sanitizeAttributes(span.getAttributesList());
		String exceptionType = null;
		String exceptionMessage = null;
		for (Span.Event event : span.getEventsList()) {
			Map<String, String> eventAttributes = toAttributeMap(event.getAttributesList());
			if (exceptionType == null) {
				exceptionType = eventAttributes.get("exception.type");
			}
			if (exceptionMessage == null) {
				exceptionMessage = truncate(eventAttributes.get("exception.message"));
			}
		}
		EventStatus status = toEventStatus(span, exceptionType, exceptionMessage);
		Instant startedAt = toInstant(span.getStartTimeUnixNano());
		Instant endedAt = toInstant(Math.max(span.getStartTimeUnixNano(), span.getEndTimeUnixNano()));
		return new TraceEvent(
			hex(span.getSpanId()),
			hex(span.getTraceId()),
			classifyComponent(span, metadata),
			span.getName(),
			status,
			startedAt,
			endedAt,
			Math.max(0, Duration.between(startedAt, endedAt).toMillis()),
			exceptionType,
			exceptionMessage,
			metadata,
			hex(span.getSpanId()),
			span.getParentSpanId().isEmpty() ? null : hex(span.getParentSpanId()),
			serviceName,
			span.getKind().name().replace("SPAN_KIND_", "")
		);
	}

	private ComponentType classifyComponent(Span span, Map<String, String> attributes) {
		String dbSystem = first(attributes, "db.system.name", "db.system").toLowerCase(Locale.ROOT);
		String spanName = span.getName().toLowerCase(Locale.ROOT);
		String codeNamespace = first(attributes, "code.namespace", "code.function.name").toLowerCase(Locale.ROOT);
		String combined = spanName + " " + codeNamespace;
		if (dbSystem.contains("redis") || combined.contains("redis") || combined.contains("cacheservice")) {
			return ComponentType.REDIS;
		}
		if (dbSystem.contains("postgresql") || dbSystem.equals("postgres") || dbSystem.equals("pgsql")) return ComponentType.POSTGRESQL;
		if (dbSystem.contains("mysql") || dbSystem.contains("mariadb")) return ComponentType.MYSQL;
		if (!dbSystem.isBlank()) return ComponentType.DATABASE;
		if (combined.contains("controller") || span.getKind() == Span.SpanKind.SPAN_KIND_SERVER) return ComponentType.CONTROLLER;
		if (combined.contains("repository") || combined.contains("store")) return ComponentType.REPOSITORY;
		if (combined.contains("gateway")) return ComponentType.GATEWAY;
		if (combined.contains("service") || combined.contains("usecase")) return ComponentType.SERVICE;
		if (span.getKind() == Span.SpanKind.SPAN_KIND_CLIENT) return ComponentType.HTTP_CLIENT;
		return ComponentType.INTERNAL;
	}

	private EventStatus toEventStatus(Span span, String errorType, String errorMessage) {
		String error = ((errorType == null ? "" : errorType) + " " + (errorMessage == null ? "" : errorMessage)).toLowerCase(Locale.ROOT);
		if (error.contains("timeout") || error.contains("timed out")) {
			return EventStatus.TIMEOUT;
		}
		if (span.getStatus().getCode() == io.opentelemetry.proto.trace.v1.Status.StatusCode.STATUS_CODE_ERROR || errorType != null) {
			return EventStatus.ERROR;
		}
		return EventStatus.SUCCESS;
	}

	private Map<String, String> sanitizeAttributes(List<KeyValue> attributes) {
		Map<String, String> sanitized = new LinkedHashMap<>();
		for (KeyValue attribute : attributes) {
			if (sanitized.size() >= MAX_ATTRIBUTES || !isAllowedAttribute(attribute.getKey())) {
				continue;
			}
			sanitized.put(attribute.getKey(), truncate(toStringValue(attribute.getValue())));
		}
		return Map.copyOf(sanitized);
	}

	private Map<String, String> toAttributeMap(List<KeyValue> attributes) {
		Map<String, String> values = new LinkedHashMap<>();
		for (KeyValue attribute : attributes) {
			if (attribute.getKey().startsWith("exception.")) {
				values.put(attribute.getKey(), toStringValue(attribute.getValue()));
			}
		}
		return values;
	}

	private boolean isAllowedAttribute(String key) {
		String lower = key.toLowerCase(Locale.ROOT);
		if (BLOCKED_ATTRIBUTE_PARTS.stream().anyMatch(lower::contains)) {
			return false;
		}
		return ALLOWED_ATTRIBUTE_PREFIXES.stream().anyMatch(lower::startsWith);
	}

	private String readServiceName(Resource resource) {
		return resource.getAttributesList().stream()
			.filter(item -> item.getKey().equals("service.name"))
			.map(item -> toStringValue(item.getValue()))
			.filter(value -> !value.isBlank())
			.findFirst()
			.orElse("external-spring-app");
	}

	private String toStringValue(AnyValue value) {
		return switch (value.getValueCase()) {
			case STRING_VALUE -> value.getStringValue();
			case BOOL_VALUE -> Boolean.toString(value.getBoolValue());
			case INT_VALUE -> Long.toString(value.getIntValue());
			case DOUBLE_VALUE -> Double.toString(value.getDoubleValue());
			case BYTES_VALUE -> hex(value.getBytesValue());
			case ARRAY_VALUE -> value.getArrayValue().getValuesList().stream()
				.map(this::toStringValue)
				.reduce((left, right) -> left + "," + right)
				.orElse("");
			case KVLIST_VALUE -> "[structured]";
			case STRING_VALUE_STRINDEX -> Integer.toString(value.getStringValueStrindex());
			case VALUE_NOT_SET -> "";
		};
	}

	private String truncate(String value) {
		if (value == null) return null;
		return value.length() <= MAX_ATTRIBUTE_VALUE_LENGTH ? value : value.substring(0, MAX_ATTRIBUTE_VALUE_LENGTH);
	}

	private String first(Map<String, String> values, String... keys) {
		for (String key : keys) {
			String value = values.get(key);
			if (value != null) return value;
		}
		return "";
	}

	private Instant toInstant(long unixNanos) {
		return Instant.ofEpochSecond(unixNanos / 1_000_000_000L, unixNanos % 1_000_000_000L);
	}

	private String hex(ByteString value) {
		return HexFormat.of().formatHex(value.toByteArray());
	}
}
