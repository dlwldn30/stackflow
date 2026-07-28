package com.stackflow.backend.service;

import com.stackflow.backend.domain.ComponentType;
import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.Trace;
import com.stackflow.backend.domain.TraceEvent;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

public class TraceSession {

	private final String traceId;
	private final String method;
	private final String endpoint;
	private final String scenario;
	private final Instant startedAt;
	private final List<TraceEvent> events;
	private final Consumer<TraceEvent> eventSink;

	TraceSession(String traceId, String method, String endpoint, String scenario, Consumer<TraceEvent> eventSink) {
		this.traceId = traceId;
		this.method = method;
		this.endpoint = endpoint;
		this.scenario = scenario;
		this.startedAt = Instant.now();
		this.events = new ArrayList<>();
		this.eventSink = eventSink;
	}

	public TraceStep startStep(ComponentType component, String eventType, Map<String, String> metadata) {
		return new TraceStep(component, eventType, Instant.now(), metadata == null ? Map.of() : new LinkedHashMap<>(metadata));
	}

	public void finishStep(
		TraceStep step,
		EventStatus status,
		String errorType,
		String errorMessage,
		Map<String, String> metadataUpdates
	) {
		Instant endedAt = Instant.now();
		Map<String, String> mergedMetadata = new LinkedHashMap<>(step.metadata());
		if (metadataUpdates != null) {
			mergedMetadata.putAll(metadataUpdates);
		}
		TraceEvent traceEvent = new TraceEvent(
			UUID.randomUUID().toString(),
			traceId,
			step.component(),
			step.eventType(),
			status,
			step.startedAt(),
			endedAt,
			Duration.between(step.startedAt(), endedAt).toMillis(),
			errorType,
			errorMessage,
			Map.copyOf(mergedMetadata)
		);
		events.add(traceEvent);
		eventSink.accept(traceEvent);
	}

	public void recordInstant(ComponentType component, String eventType, EventStatus status, Map<String, String> metadata) {
		Instant now = Instant.now();
		TraceEvent traceEvent = new TraceEvent(
			UUID.randomUUID().toString(),
			traceId,
			component,
			eventType,
			status,
			now,
			now,
			0L,
			null,
			null,
			metadata == null ? Map.of() : Map.copyOf(metadata)
		);
		events.add(traceEvent);
		eventSink.accept(traceEvent);
	}

	public Trace complete(int httpStatus, EventStatus resultStatus) {
		Instant endedAt = Instant.now();
		return new Trace(
			traceId,
			method,
			endpoint,
			scenario,
			startedAt,
			endedAt,
			Duration.between(startedAt, endedAt).toMillis(),
			httpStatus,
			resultStatus,
			List.copyOf(events)
		);
	}

	public String traceId() {
		return traceId;
	}

	public String method() {
		return method;
	}

	public String endpoint() {
		return endpoint;
	}

	public String scenario() {
		return scenario;
	}

	public record TraceStep(
		ComponentType component,
		String eventType,
		Instant startedAt,
		Map<String, String> metadata
	) {
	}
}
