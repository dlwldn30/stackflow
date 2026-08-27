package com.stackflow.backend.service;

import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.Trace;
import com.stackflow.backend.domain.TraceCollectionStatus;
import com.stackflow.backend.domain.TraceEvent;
import com.stackflow.backend.domain.TraceResponsePreview;
import com.stackflow.backend.domain.TraceSource;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
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
import java.util.stream.Stream;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class ExternalTraceService {

	private static final Duration COLLECTION_TIMEOUT = Duration.ofSeconds(15);
	private static final Duration COMPLETION_DEBOUNCE = Duration.ofSeconds(2);

	private final TraceService traceService;
	private final Map<String, TraceAccumulator> accumulators = new ConcurrentHashMap<>();
	private final Clock clock;
	private final ScheduledExecutorService scheduler;
	private final Duration collectionTimeout;
	private final Duration completionDebounce;

	private static ScheduledExecutorService createScheduler() {
		return Executors.newSingleThreadScheduledExecutor(runnable -> {
			Thread thread = new Thread(runnable, "stackflow-trace-collector");
			thread.setDaemon(true);
			return thread;
		});
	}

	@Autowired
	public ExternalTraceService(TraceService traceService) {
		this(traceService, Clock.systemUTC(), createScheduler(), COLLECTION_TIMEOUT, COMPLETION_DEBOUNCE);
	}

	ExternalTraceService(TraceService traceService, Duration completionDebounce) {
		this(traceService, Clock.systemUTC(), createScheduler(), COLLECTION_TIMEOUT, completionDebounce);
	}

	ExternalTraceService(
		TraceService traceService,
		Clock clock,
		ScheduledExecutorService scheduler,
		Duration collectionTimeout,
		Duration completionDebounce
	) {
		this.traceService = traceService;
		this.clock = clock;
		this.scheduler = scheduler;
		this.collectionTimeout = collectionTimeout;
		this.completionDebounce = completionDebounce;
	}

	public TraceCaptureContext startCapture(String method, String endpoint) {
		String traceId = UUID.randomUUID().toString().replace("-", "");
		String parentSpanId = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
		TraceAccumulator accumulator = new TraceAccumulator(
			traceId,
			parentSpanId,
			method,
			endpoint,
			clock.instant()
		);
		traceService.registerExternalTrace(traceId);
		accumulators.put(traceId, accumulator);
		traceService.publishExternalTraceStarted(traceId, method, endpoint);
		traceService.publishCollectionStatus(traceId, TraceCollectionStatus.PENDING, "OpenTelemetry span을 기다리고 있습니다.");
		scheduler.schedule(() -> timeout(traceId), collectionTimeout.toMillis(), TimeUnit.MILLISECONDS);
		return new TraceCaptureContext(traceId, parentSpanId, "00-" + traceId + "-" + parentSpanId + "-01");
	}

	public void recordHttpResponse(String traceId, int httpStatus, long durationMs) {
		recordHttpResponse(traceId, httpStatus, durationMs, null, null);
	}

	public void recordHttpResponse(
		String traceId,
		int httpStatus,
		long durationMs,
		String contentType,
		String responseBody
	) {
		TraceAccumulator accumulator = accumulators.get(traceId);
		if (accumulator == null) {
			return;
		}
		synchronized (accumulator) {
			if (accumulators.get(traceId) != accumulator) {
				return;
			}
			accumulator.httpStatus = httpStatus;
			accumulator.requestDurationMs = durationMs;
			accumulator.responsePreview = TraceResponsePreviewFactory
				.fromBody(contentType, responseBody)
				.orElse(null);
			accumulator.httpResultRecorded = true;
			if (hasEntryServerSpan(accumulator)) {
				scheduler.schedule(() -> finalizeIfQuiet(traceId), completionDebounce.toMillis(), TimeUnit.MILLISECONDS);
			}
		}
	}

	public void acceptSpans(String traceId, String serviceName, List<TraceEvent> events) {
		if (events.isEmpty()) {
			return;
		}
		TraceAccumulator accumulator = accumulators.get(traceId);
		if (accumulator == null) {
			return;
		}
		List<TraceEvent> accepted = new ArrayList<>();
		synchronized (accumulator) {
			if (accumulators.get(traceId) != accumulator) {
				return;
			}
			for (TraceEvent event : events) {
				String key = event.spanId() == null || event.spanId().isBlank() ? event.eventId() : event.spanId();
				if (accumulator.events.putIfAbsent(key, event) == null) {
					accepted.add(event);
				}
			}
			if (!accepted.isEmpty()) {
				accumulator.lastUpdatedAt = clock.instant();
				accumulator.status = TraceCollectionStatus.COLLECTING;
				traceService.publishCollectionStatus(traceId, TraceCollectionStatus.COLLECTING, accepted.size() + "개 span을 수집했습니다.");
				accepted.forEach(traceService::publishExternalTraceEvent);
				if (hasEntryServerSpan(accumulator)) {
					scheduler.schedule(() -> finalizeIfQuiet(traceId), completionDebounce.toMillis(), TimeUnit.MILLISECONDS);
				}
			}
		}
	}

	public boolean isCaptureActive(String traceId) {
		return accumulators.containsKey(traceId);
	}

	private void finalizeIfQuiet(String traceId) {
		TraceAccumulator accumulator = accumulators.get(traceId);
		if (accumulator == null) {
			return;
		}
		synchronized (accumulator) {
			if (Duration.between(accumulator.lastUpdatedAt, clock.instant()).compareTo(completionDebounce) < 0
				|| !hasEntryServerSpan(accumulator)
				|| !accumulator.httpResultRecorded) {
				return;
			}
			if (!accumulators.remove(traceId, accumulator)) {
				return;
			}
			Trace trace = buildTrace(accumulator, TraceCollectionStatus.COMPLETED);
			accumulator.status = TraceCollectionStatus.COMPLETED;
			traceService.publishCollectionStatus(traceId, TraceCollectionStatus.COMPLETED, "실제 실행 span 수집을 완료했습니다.");
			traceService.storeExternalTrace(trace);
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
		return hasError || httpStatus <= 0 || httpStatus >= 400 ? EventStatus.ERROR : EventStatus.SUCCESS;
	}

	void timeout(String traceId) {
		TraceAccumulator accumulator = accumulators.get(traceId);
		if (accumulator == null) {
			return;
		}
		Trace trace;
		synchronized (accumulator) {
			if (!accumulators.remove(traceId, accumulator)) {
				return;
			}
			accumulator.status = TraceCollectionStatus.TIMED_OUT;
			trace = buildTrace(accumulator, TraceCollectionStatus.TIMED_OUT);
		}
		traceService.storeExternalTraceCollectionTimeout(trace);
		traceService.publishCollectionStatus(
			traceId,
			TraceCollectionStatus.TIMED_OUT,
			collectionTimeout.toSeconds() + "초 동안 span을 받지 못했습니다. Java Agent와 수집 주소를 확인하세요."
		);
	}

	private Trace buildTrace(TraceAccumulator accumulator, TraceCollectionStatus collectionStatus) {
		List<TraceEvent> events = accumulator.events.values().stream()
			.sorted(Comparator.comparing(TraceEvent::startedAt).thenComparing(TraceEvent::endedAt))
			.toList();
		Instant startedAt = events.stream().map(TraceEvent::startedAt).min(Instant::compareTo).orElse(accumulator.startedAt);
		Instant endedAt = events.stream().map(TraceEvent::endedAt).max(Instant::compareTo)
			.orElseGet(() -> accumulator.requestDurationMs > 0
				? startedAt.plusMillis(accumulator.requestDurationMs)
				: clock.instant());
		long durationMs = Math.max(
			Math.max(0, Duration.between(startedAt, endedAt).toMillis()),
			accumulator.requestDurationMs
		);
		String entryServiceName = findEntryServiceName(accumulator, events);
		List<String> serviceNames = events.stream()
			.map(TraceEvent::serviceName)
			.filter(name -> name != null && !name.isBlank())
			.distinct()
			.sorted()
			.toList();
		if (serviceNames.contains(entryServiceName)) {
			serviceNames = Stream.concat(
				Stream.of(entryServiceName),
				serviceNames.stream().filter(name -> !name.equals(entryServiceName))
			).toList();
		}
		return new Trace(
			accumulator.traceId,
			accumulator.method,
			accumulator.endpoint,
			"external-opentelemetry",
			startedAt,
			endedAt,
			durationMs,
			accumulator.httpStatus,
			resultStatus(accumulator.httpStatus, events),
			events,
			TraceSource.OPENTELEMETRY,
			entryServiceName,
			serviceNames,
			collectionStatus,
			accumulator.responsePreview
		);
	}

	private boolean hasEntryServerSpan(TraceAccumulator accumulator) {
		synchronized (accumulator) {
			return accumulator.events.values().stream().anyMatch(event ->
				"SERVER".equals(event.spanKind())
					&& accumulator.parentSpanId.equals(event.parentSpanId())
			);
		}
	}

	private String findEntryServiceName(TraceAccumulator accumulator, List<TraceEvent> events) {
		return events.stream()
			.filter(event -> "SERVER".equals(event.spanKind()))
			.filter(event -> accumulator.parentSpanId.equals(event.parentSpanId()))
			.map(TraceEvent::serviceName)
			.filter(name -> name != null && !name.isBlank())
			.findFirst()
			.orElseGet(() -> events.stream()
				.map(TraceEvent::serviceName)
				.filter(name -> name != null && !name.isBlank())
				.findFirst()
				.orElse("external-spring-app"));
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
		private volatile Instant lastUpdatedAt;
		private volatile int httpStatus;
		private volatile long requestDurationMs;
		private volatile boolean httpResultRecorded;
		private volatile TraceResponsePreview responsePreview;

		private TraceAccumulator(String traceId, String parentSpanId, String method, String endpoint, Instant startedAt) {
			this.traceId = traceId;
			this.parentSpanId = parentSpanId;
			this.method = method;
			this.endpoint = endpoint;
			this.startedAt = startedAt;
			this.lastUpdatedAt = startedAt;
		}
	}
}
