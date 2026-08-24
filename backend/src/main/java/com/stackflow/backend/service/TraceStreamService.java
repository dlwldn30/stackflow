package com.stackflow.backend.service;

import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.Trace;
import com.stackflow.backend.domain.TraceCollectionStatus;
import com.stackflow.backend.domain.TraceEvent;
import com.stackflow.backend.dto.TraceCollectionStatusEventResponse;
import com.stackflow.backend.dto.TraceStartedEventResponse;
import com.stackflow.backend.dto.TraceStreamTimeoutEventResponse;
import com.stackflow.backend.dto.TraceTerminalEventResponse;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
public class TraceStreamService {

	private static final long SSE_SAFETY_TIMEOUT_MS = 35_000L;
	private static final Duration CONNECTION_LIMIT = Duration.ofSeconds(30);
	private static final Duration HEARTBEAT_INTERVAL = Duration.ofSeconds(10);
	private static final Duration PENDING_TTL = Duration.ofSeconds(30);
	private static final Duration ACTIVE_TTL = Duration.ofMinutes(2);
	private static final int MAX_CONNECTIONS_PER_TRACE = 3;
	private static final int MAX_CONNECTIONS_TOTAL = 100;
	private static final int MAX_CLOSED_HISTORY = 25;

	private final Map<String, TraceRegistration> registrations = new ConcurrentHashMap<>();
	private final Map<String, List<SseConnection>> connections = new ConcurrentHashMap<>();
	private final Map<String, List<TraceStreamMessage>> streamHistory = new ConcurrentHashMap<>();
	private final Set<String> closedTraceIds = ConcurrentHashMap.newKeySet();
	private final ConcurrentLinkedDeque<String> historyOrder = new ConcurrentLinkedDeque<>();
	private final Clock clock;
	private final Function<Long, SseEmitter> emitterFactory;
	private final int maxConnectionsPerTrace;
	private final int maxConnectionsTotal;
	private final ScheduledExecutorService scheduler;

	public TraceStreamService() {
		this(Clock.systemUTC(), SseEmitter::new, MAX_CONNECTIONS_PER_TRACE, MAX_CONNECTIONS_TOTAL, true);
	}

	TraceStreamService(
		Clock clock,
		Function<Long, SseEmitter> emitterFactory,
		int maxConnectionsPerTrace,
		int maxConnectionsTotal,
		boolean startScheduler
	) {
		this.clock = clock;
		this.emitterFactory = emitterFactory;
		this.maxConnectionsPerTrace = maxConnectionsPerTrace;
		this.maxConnectionsTotal = maxConnectionsTotal;
		this.scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
			Thread thread = new Thread(runnable, "stackflow-trace-stream");
			thread.setDaemon(true);
			return thread;
		});
		if (startScheduler) {
			scheduler.scheduleAtFixedRate(this::maintainConnections, 1, 1, TimeUnit.SECONDS);
		}
	}

	public void registerPendingTrace(String traceId) {
		register(traceId, RegistrationStatus.PENDING);
	}

	public void registerActiveTrace(String traceId) {
		register(traceId, RegistrationStatus.ACTIVE);
	}

	public void activateTrace(String traceId) {
		TraceRegistration registration = getLiveRegistration(traceId);
		if (registration == null) {
			if (closedTraceIds.contains(traceId)) {
				throw new TraceSessionConflictException(traceId);
			}
			throw new TraceNotFoundException(traceId);
		}
		synchronized (registration) {
			if (registration.status != RegistrationStatus.PENDING) {
				throw new TraceSessionConflictException(traceId);
			}
			registration.status = RegistrationStatus.ACTIVE;
			registration.updatedAt = clock.instant();
		}
	}

	public SseEmitter createEmitter(String traceId) {
		validateStreamable(traceId);
		SseConnection connection;
		synchronized (this) {
			List<SseConnection> traceConnections = connections.computeIfAbsent(
				traceId,
				ignored -> new CopyOnWriteArrayList<>()
			);
			if (traceConnections.size() >= maxConnectionsPerTrace) {
				throw new TraceStreamCapacityException("Trace stream connection limit exceeded for: " + traceId);
			}
			if (activeConnectionCount() >= maxConnectionsTotal) {
				if (traceConnections.isEmpty()) {
					connections.remove(traceId, traceConnections);
				}
				throw new TraceStreamCapacityException("Global Trace stream connection limit exceeded.");
			}
			SseEmitter emitter = emitterFactory.apply(SSE_SAFETY_TIMEOUT_MS);
			connection = new SseConnection(emitter, clock.instant());
			traceConnections.add(connection);
		}

		SseEmitter emitter = connection.emitter;
		emitter.onCompletion(() -> removeConnection(traceId, connection));
		emitter.onTimeout(() -> closeConnection(traceId, connection));
		emitter.onError(error -> removeConnection(traceId, connection));

		trySend(traceId, connection, new TraceStreamMessage(
			"stream_ready",
			Map.of("traceId", traceId, "timestamp", clock.instant().toString())
		));
		replayHistory(traceId, connection);
		if (closedTraceIds.contains(traceId)) {
			closeConnection(traceId, connection);
		}
		return emitter;
	}

	public void publishTraceStarted(String traceId, String method, String endpoint, String scenario) {
		publish(traceId, "trace_started", new TraceStartedEventResponse(traceId, method, endpoint, scenario, clock.instant()));
	}

	public void publishTraceEvent(TraceEvent traceEvent) {
		publish(traceEvent.traceId(), "trace_event", traceEvent);
	}

	public void publishTraceCollectionStatus(String traceId, TraceCollectionStatus status, String message) {
		publish(
			traceId,
			"trace_collection_status",
			new TraceCollectionStatusEventResponse(traceId, status, message, clock.instant())
		);
		if (status == TraceCollectionStatus.TIMED_OUT) {
			completeTraceStream(traceId);
		}
	}

	public void publishTraceCompleted(Trace trace) {
		publish(
			trace.traceId(),
			"trace_completed",
			new TraceTerminalEventResponse(
				trace.traceId(), trace.resultStatus(), trace.httpStatus(), trace.durationMs(),
				null, null, trace.endedAt()
			)
		);
		completeTraceStream(trace.traceId());
	}

	public void publishTraceFailed(Trace trace) {
		TraceEvent failedEvent = trace.events().stream()
			.filter(event -> event.status() == EventStatus.ERROR || event.status() == EventStatus.TIMEOUT)
			.reduce((first, second) -> second)
			.orElse(null);
		publish(
			trace.traceId(),
			"trace_failed",
			new TraceTerminalEventResponse(
				trace.traceId(), trace.resultStatus(), trace.httpStatus(), trace.durationMs(),
				failedEvent == null ? null : failedEvent.errorType(),
				failedEvent == null ? null : failedEvent.errorMessage(),
				trace.endedAt()
			)
		);
		completeTraceStream(trace.traceId());
	}

	void maintainConnections() {
		Instant now = clock.instant();
		for (Map.Entry<String, List<SseConnection>> entry : List.copyOf(connections.entrySet())) {
			for (SseConnection connection : List.copyOf(entry.getValue())) {
				Duration age = Duration.between(connection.openedAt, now);
				if (age.compareTo(CONNECTION_LIMIT) >= 0) {
					trySend(entry.getKey(), connection, new TraceStreamMessage(
						"stream_timeout",
						new TraceStreamTimeoutEventResponse(
							entry.getKey(), now,
							"실시간 연결 시간이 만료되었습니다. 최근 Trace에서 결과를 다시 확인하세요."
						)
					));
					closeConnection(entry.getKey(), connection);
				} else if (Duration.between(connection.lastHeartbeatAt, now).compareTo(HEARTBEAT_INTERVAL) >= 0) {
					if (trySend(entry.getKey(), connection, new TraceStreamMessage(
						"heartbeat",
						Map.of("traceId", entry.getKey(), "timestamp", now.toString())
					))) {
						connection.lastHeartbeatAt = now;
					}
				}
			}
		}
		pruneExpiredRegistrations(now);
	}

	int activeConnectionCount() {
		return connections.values().stream().mapToInt(List::size).sum();
	}

	int historySize(String traceId) {
		return streamHistory.getOrDefault(traceId, List.of()).size();
	}

	private void register(String traceId, RegistrationStatus status) {
		Instant now = clock.instant();
		TraceRegistration next = new TraceRegistration(status, now);
		if (closedTraceIds.contains(traceId) || registrations.putIfAbsent(traceId, next) != null) {
			throw new TraceSessionConflictException(traceId);
		}
		if (closedTraceIds.contains(traceId) && registrations.remove(traceId, next)) {
			throw new TraceSessionConflictException(traceId);
		}
	}

	private void validateStreamable(String traceId) {
		if (closedTraceIds.contains(traceId)) {
			return;
		}
		if (getLiveRegistration(traceId) == null) {
			throw new TraceNotFoundException(traceId);
		}
	}

	private TraceRegistration getLiveRegistration(String traceId) {
		TraceRegistration registration = registrations.get(traceId);
		if (registration == null) {
			return null;
		}
		if (isExpired(registration, clock.instant())) {
			registrations.remove(traceId, registration);
			closeTraceConnections(traceId);
			streamHistory.remove(traceId);
			return null;
		}
		return registration;
	}

	private boolean isExpired(TraceRegistration registration, Instant now) {
		Duration ttl = registration.status == RegistrationStatus.PENDING ? PENDING_TTL : ACTIVE_TTL;
		return Duration.between(registration.updatedAt, now).compareTo(ttl) >= 0;
	}

	private void pruneExpiredRegistrations(Instant now) {
		for (Map.Entry<String, TraceRegistration> entry : List.copyOf(registrations.entrySet())) {
			if (isExpired(entry.getValue(), now) && registrations.remove(entry.getKey(), entry.getValue())) {
				closeTraceConnections(entry.getKey());
				streamHistory.remove(entry.getKey());
			}
		}
	}

	private void replayHistory(String traceId, SseConnection connection) {
		for (TraceStreamMessage message : streamHistory.getOrDefault(traceId, List.of())) {
			if (!trySend(traceId, connection, message)) {
				return;
			}
		}
	}

	private void publish(String traceId, String eventName, Object payload) {
		TraceStreamMessage message = new TraceStreamMessage(eventName, payload);
		streamHistory.computeIfAbsent(traceId, ignored -> new CopyOnWriteArrayList<>()).add(message);
		for (SseConnection connection : List.copyOf(connections.getOrDefault(traceId, List.of()))) {
			trySend(traceId, connection, message);
		}
	}

	private boolean trySend(String traceId, SseConnection connection, TraceStreamMessage message) {
		try {
			connection.emitter.send(SseEmitter.event().name(message.eventName()).data(message.payload()));
			return true;
		} catch (IOException | IllegalStateException exception) {
			removeConnection(traceId, connection);
			connection.emitter.completeWithError(exception);
			return false;
		}
	}

	private void completeTraceStream(String traceId) {
		registrations.remove(traceId);
		closedTraceIds.add(traceId);
		historyOrder.remove(traceId);
		historyOrder.addFirst(traceId);
		while (historyOrder.size() > MAX_CLOSED_HISTORY) {
			String expired = historyOrder.pollLast();
			if (expired != null) {
				closedTraceIds.remove(expired);
				streamHistory.remove(expired);
			}
		}
		closeTraceConnections(traceId);
	}

	private void closeTraceConnections(String traceId) {
		List<SseConnection> activeConnections = connections.remove(traceId);
		if (activeConnections != null) {
			activeConnections.forEach(connection -> connection.emitter.complete());
		}
	}

	private void closeConnection(String traceId, SseConnection connection) {
		removeConnection(traceId, connection);
		connection.emitter.complete();
	}

	private synchronized void removeConnection(String traceId, SseConnection connection) {
		List<SseConnection> traceConnections = connections.get(traceId);
		if (traceConnections == null) {
			return;
		}
		traceConnections.remove(connection);
		if (traceConnections.isEmpty()) {
			connections.remove(traceId, traceConnections);
		}
	}

	@PreDestroy
	void shutdown() {
		scheduler.shutdownNow();
		for (String traceId : List.copyOf(connections.keySet())) {
			closeTraceConnections(traceId);
		}
		registrations.clear();
	}

	private enum RegistrationStatus {
		PENDING,
		ACTIVE
	}

	private static final class TraceRegistration {
		private volatile RegistrationStatus status;
		private volatile Instant updatedAt;

		private TraceRegistration(RegistrationStatus status, Instant updatedAt) {
			this.status = status;
			this.updatedAt = updatedAt;
		}
	}

	private static final class SseConnection {
		private final SseEmitter emitter;
		private final Instant openedAt;
		private volatile Instant lastHeartbeatAt;

		private SseConnection(SseEmitter emitter, Instant openedAt) {
			this.emitter = emitter;
			this.openedAt = openedAt;
			this.lastHeartbeatAt = openedAt;
		}
	}

	private record TraceStreamMessage(String eventName, Object payload) {
	}
}
