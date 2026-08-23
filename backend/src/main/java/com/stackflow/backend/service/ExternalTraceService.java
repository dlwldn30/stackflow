package com.stackflow.backend.service;

import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.Trace;
import com.stackflow.backend.domain.TraceCollectionStatus;
import com.stackflow.backend.domain.TraceEvent;
import com.stackflow.backend.domain.TraceSource;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Service;

@Service
public class ExternalTraceService {

	private static final long COLLECTION_TIMEOUT_SECONDS = 15;
	private static final long COMPLETION_DEBOUNCE_MS = 600;

	private final TraceService traceService;
	private final Map<String, TraceAccumulator> accumulators = new ConcurrentHashMap<>();
	private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
		Thread thread = new Thread(runnable, "stackflow-trace-collector");
		thread.setDaemon(true);
		return thread;
	});

	public ExternalTraceService(TraceService traceService) {
		this.traceService = traceService;
	}

	public TraceCaptureContext startCapture(String method, String endpoint) {
		String traceId = UUID.randomUUID().toString().replace("-", "");
		String parentSpanId = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
		TraceAccumulator accumulator = new TraceAccumulator(
			traceId,
			parentSpanId,
			method,
			endpoint,
			Instant.now()
		);
		accumulators.put(traceId, accumulator);
		traceService.publishExternalTraceStarted(traceId, method, endpoint);
		traceService.publishCollectionStatus(traceId, TraceCollectionStatus.PENDING, "OpenTelemetry span을 기다리고 있습니다.");
		scheduler.schedule(() -> timeout(traceId), COLLECTION_TIMEOUT_SECONDS, TimeUnit.SECONDS);
		return new TraceCaptureContext(traceId, parentSpanId, "00-" + traceId + "-" + parentSpanId + "-01");
	}

	public void recordHttpResponse(String traceId, int httpStatus, long durationMs) {
		TraceAccumulator accumulator = accumulators.get(traceId);
		if (accumulator == null) {
			return;
		}
		synchronized (accumulator) {
			accumulator.httpStatus = httpStatus;
			accumulator.requestDurationMs = durationMs;
		}
	}

	public void acceptSpans(String traceId, String serviceName, List<TraceEvent> events) {
		if (events.isEmpty()) {
			return;
		}
		TraceAccumulator accumulator = accumulators.computeIfAbsent(
			traceId,
			ignored -> new TraceAccumulator(traceId, null, inferMethod(events), inferEndpoint(events), events.get(0).startedAt())
		);
		List<TraceEvent> accepted = new ArrayList<>();
		synchronized (accumulator) {
			accumulator.serviceName = serviceName;
			for (TraceEvent event : events) {
				String key = event.spanId() == null || event.spanId().isBlank() ? event.eventId() : event.spanId();
				if (accumulator.events.putIfAbsent(key, event) == null) {
					accepted.add(event);
				}
			}
			accumulator.lastUpdatedAt = Instant.now();
			accumulator.status = TraceCollectionStatus.COLLECTING;
		}
		traceService.publishCollectionStatus(traceId, TraceCollectionStatus.COLLECTING, accepted.size() + "개 span을 수집했습니다.");
		accepted.forEach(traceService::publishExternalTraceEvent);
		if (hasServerSpan(accumulator)) {
			scheduler.schedule(() -> finalizeIfQuiet(traceId), COMPLETION_DEBOUNCE_MS, TimeUnit.MILLISECONDS);
		}
	}

	public TraceCollectionStatus getStatus(String traceId) {
		TraceAccumulator accumulator = accumulators.get(traceId);
		return accumulator == null ? TraceCollectionStatus.COMPLETED : accumulator.status;
	}

	private void finalizeIfQuiet(String traceId) {
		TraceAccumulator accumulator = accumulators.get(traceId);
		if (accumulator == null) {
			return;
		}
		synchronized (accumulator) {
			if (Duration.between(accumulator.lastUpdatedAt, Instant.now()).toMillis() < COMPLETION_DEBOUNCE_MS
				|| !hasServerSpan(accumulator)) {
				return;
			}
			List<TraceEvent> events = accumulator.events.values().stream()
				.sorted(Comparator.comparing(TraceEvent::startedAt).thenComparing(TraceEvent::endedAt))
				.toList();
			Instant startedAt = events.stream().map(TraceEvent::startedAt).min(Instant::compareTo).orElse(accumulator.startedAt);
			Instant endedAt = events.stream().map(TraceEvent::endedAt).max(Instant::compareTo).orElse(Instant.now());
			EventStatus resultStatus = resultStatus(accumulator.httpStatus, events);
			long durationMs = Math.max(
				Duration.between(startedAt, endedAt).toMillis(),
				accumulator.requestDurationMs
			);
			Trace trace = new Trace(
				traceId,
				accumulator.method,
				accumulator.endpoint,
				"external-opentelemetry",
				startedAt,
				endedAt,
				durationMs,
				accumulator.httpStatus,
				resultStatus,
				events,
				TraceSource.OPENTELEMETRY,
				accumulator.serviceName
			);
			accumulator.status = TraceCollectionStatus.COMPLETED;
			traceService.publishCollectionStatus(traceId, TraceCollectionStatus.COMPLETED, "실제 실행 span 수집을 완료했습니다.");
			traceService.storeExternalTrace(trace);
			accumulators.remove(traceId);
		}
	}

	private EventStatus resultStatus(int httpStatus, List<TraceEvent> events) {
		boolean hasTimeout = events.stream().anyMatch(event -> event.status() == EventStatus.TIMEOUT);
		boolean hasError = events.stream().anyMatch(event -> event.status() == EventStatus.ERROR);
		boolean successfulHttpResponse = httpStatus >= 200 && httpStatus < 400;
		if (successfulHttpResponse && (hasTimeout || hasError)) {
			return EventStatus.WARNING;
		}
		if (hasTimeout) {
			return EventStatus.TIMEOUT;
		}
		return hasError || httpStatus >= 400 ? EventStatus.ERROR : EventStatus.SUCCESS;
	}

	private void timeout(String traceId) {
		TraceAccumulator accumulator = accumulators.remove(traceId);
		if (accumulator == null) {
			return;
		}
		accumulator.status = TraceCollectionStatus.TIMED_OUT;
		traceService.publishCollectionStatus(
			traceId,
			TraceCollectionStatus.TIMED_OUT,
			"15초 동안 span을 받지 못했습니다. Java Agent와 수집 주소를 확인하세요."
		);
	}

	private boolean hasServerSpan(TraceAccumulator accumulator) {
		synchronized (accumulator) {
			return accumulator.events.values().stream().anyMatch(event -> "SERVER".equals(event.spanKind()));
		}
	}

	private static String inferMethod(List<TraceEvent> events) {
		return events.stream()
			.map(event -> event.metadata().get("http.request.method"))
			.filter(value -> value != null && !value.isBlank())
			.findFirst()
			.orElse("UNKNOWN");
	}

	private static String inferEndpoint(List<TraceEvent> events) {
		return events.stream()
			.map(event -> event.metadata().get("http.route"))
			.filter(value -> value != null && !value.isBlank())
			.findFirst()
			.orElse(events.get(0).eventType());
	}

	@PreDestroy
	void shutdown() {
		scheduler.shutdownNow();
	}

	public record TraceCaptureContext(String traceId, String parentSpanId, String traceparent) {
	}

	private static final class TraceAccumulator {
		private final String traceId;
		private final String parentSpanId;
		private final String method;
		private final String endpoint;
		private final Instant startedAt;
		private final Map<String, TraceEvent> events = new LinkedHashMap<>();
		private volatile TraceCollectionStatus status = TraceCollectionStatus.PENDING;
		private volatile Instant lastUpdatedAt = Instant.now();
		private volatile String serviceName = "external-spring-app";
		private volatile int httpStatus;
		private volatile long requestDurationMs;

		private TraceAccumulator(String traceId, String parentSpanId, String method, String endpoint, Instant startedAt) {
			this.traceId = traceId;
			this.parentSpanId = parentSpanId;
			this.method = method;
			this.endpoint = endpoint;
			this.startedAt = startedAt;
		}
	}
}
