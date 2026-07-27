package com.stackflow.backend.service;

import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.Trace;
import com.stackflow.backend.domain.TraceEvent;
import com.stackflow.backend.dto.TraceStartedEventResponse;
import com.stackflow.backend.dto.TraceTerminalEventResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
public class TraceStreamService {

	private static final long SSE_TIMEOUT_MS = 0L;

	private final Map<String, List<SseEmitter>> emitters = new ConcurrentHashMap<>();
	private final Map<String, List<TraceStreamMessage>> streamHistory = new ConcurrentHashMap<>();

	public SseEmitter createEmitter(String traceId) {
		SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
		emitters.computeIfAbsent(traceId, ignored -> new ArrayList<>()).add(emitter);

		emitter.onCompletion(() -> removeEmitter(traceId, emitter));
		emitter.onTimeout(() -> {
			removeEmitter(traceId, emitter);
			emitter.complete();
		});
		emitter.onError(error -> removeEmitter(traceId, emitter));

		replayHistory(traceId, emitter);
		return emitter;
	}

	public void publishTraceStarted(String traceId, String method, String endpoint, String scenario) {
		publish(
			traceId,
			"trace_started",
			new TraceStartedEventResponse(traceId, method, endpoint, scenario, Instant.now())
		);
	}

	public void publishTraceEvent(TraceEvent traceEvent) {
		publish(traceEvent.traceId(), "trace_event", traceEvent);
	}

	public void publishTraceCompleted(Trace trace) {
		publish(
			trace.traceId(),
			"trace_completed",
			new TraceTerminalEventResponse(
				trace.traceId(),
				trace.resultStatus(),
				trace.httpStatus(),
				trace.durationMs(),
				null,
				null,
				trace.endedAt()
			)
		);
		completeTraceStream(trace.traceId());
	}

	public void publishTraceFailed(Trace trace) {
		TraceEvent failedEvent = trace.events()
			.stream()
			.filter(event -> event.status() == EventStatus.ERROR || event.status() == EventStatus.TIMEOUT)
			.reduce((first, second) -> second)
			.orElse(null);

		publish(
			trace.traceId(),
			"trace_failed",
			new TraceTerminalEventResponse(
				trace.traceId(),
				trace.resultStatus(),
				trace.httpStatus(),
				trace.durationMs(),
				failedEvent == null ? null : failedEvent.errorType(),
				failedEvent == null ? null : failedEvent.errorMessage(),
				trace.endedAt()
			)
		);
		completeTraceStream(trace.traceId());
	}

	private void replayHistory(String traceId, SseEmitter emitter) {
		List<TraceStreamMessage> history = streamHistory.get(traceId);
		if (history == null) {
			return;
		}

		for (TraceStreamMessage message : history) {
			trySend(traceId, emitter, message);
		}
	}

	private void publish(String traceId, String eventName, Object payload) {
		TraceStreamMessage message = new TraceStreamMessage(eventName, payload);
		streamHistory.computeIfAbsent(traceId, ignored -> new ArrayList<>()).add(message);
		List<SseEmitter> activeEmitters = emitters.get(traceId);
		if (activeEmitters == null) {
			return;
		}

		List<SseEmitter> failedEmitters = new ArrayList<>();
		for (SseEmitter emitter : List.copyOf(activeEmitters)) {
			if (!trySend(traceId, emitter, message)) {
				failedEmitters.add(emitter);
			}
		}

		failedEmitters.forEach(emitter -> removeEmitter(traceId, emitter));
	}

	private boolean trySend(String traceId, SseEmitter emitter, TraceStreamMessage message) {
		try {
			emitter.send(SseEmitter.event().name(message.eventName()).data(message.payload()));
			return true;
		} catch (IOException exception) {
			removeEmitter(traceId, emitter);
			emitter.completeWithError(exception);
			return false;
		}
	}

	private void completeTraceStream(String traceId) {
		List<SseEmitter> activeEmitters = emitters.remove(traceId);
		if (activeEmitters != null) {
			activeEmitters.forEach(SseEmitter::complete);
		}
	}

	private void removeEmitter(String traceId, SseEmitter emitter) {
		List<SseEmitter> activeEmitters = emitters.get(traceId);
		if (activeEmitters == null) {
			return;
		}

		activeEmitters.remove(emitter);
		if (activeEmitters.isEmpty()) {
			emitters.remove(traceId);
		}
	}

	private record TraceStreamMessage(
		String eventName,
		Object payload
	) {
	}
}
