package com.stackflow.backend.service;

import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.Trace;
import com.stackflow.backend.dto.TraceSessionResponse;
import com.stackflow.backend.dto.TraceSummaryResponse;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
public class TraceService {

	private final TraceStreamService traceStreamService;
	private final Map<String, Trace> traces = new ConcurrentHashMap<>();
	private final ConcurrentLinkedDeque<String> order = new ConcurrentLinkedDeque<>();

	public TraceService(TraceStreamService traceStreamService) {
		this.traceStreamService = traceStreamService;
	}

	public TraceSessionResponse createTraceSession() {
		return new TraceSessionResponse(UUID.randomUUID().toString());
	}

	public TraceSession startTrace(String traceId, String method, String endpoint, String scenario) {
		return new TraceSession(traceId, method, endpoint, scenario, traceStreamService::publishTraceEvent);
	}

	public Trace completeTrace(TraceSession session, int httpStatus, EventStatus resultStatus) {
		Trace trace = session.complete(httpStatus, resultStatus);
		storeTrace(trace);
		return trace;
	}

	public void storeExternalTrace(Trace trace) {
		storeTrace(trace);
	}

	private void storeTrace(Trace trace) {
		traces.put(trace.traceId(), trace);
		order.remove(trace.traceId());
		order.addFirst(trace.traceId());
		while (order.size() > 25) {
			String expired = order.pollLast();
			if (expired != null) {
				traces.remove(expired);
			}
		}
		if (trace.resultStatus() == EventStatus.ERROR || trace.resultStatus() == EventStatus.TIMEOUT) {
			traceStreamService.publishTraceFailed(trace);
		} else {
			traceStreamService.publishTraceCompleted(trace);
		}
	}

	public void publishExternalTraceStarted(String traceId, String method, String endpoint) {
		traceStreamService.publishTraceStarted(traceId, method, endpoint, "external-opentelemetry");
	}

	public void publishExternalTraceEvent(com.stackflow.backend.domain.TraceEvent event) {
		traceStreamService.publishTraceEvent(event);
	}

	public void publishCollectionStatus(
		String traceId,
		com.stackflow.backend.domain.TraceCollectionStatus status,
		String message
	) {
		traceStreamService.publishTraceCollectionStatus(traceId, status, message);
	}

	public void publishTraceStarted(TraceSession session) {
		traceStreamService.publishTraceStarted(session.traceId(), session.method(), session.endpoint(), session.scenario());
	}

	public SseEmitter openTraceStream(String traceId) {
		return traceStreamService.createEmitter(traceId);
	}

	public List<TraceSummaryResponse> getRecentTraces() {
		List<TraceSummaryResponse> summaries = new ArrayList<>();
		for (String traceId : order) {
			Trace trace = traces.get(traceId);
			if (trace != null) {
				summaries.add(new TraceSummaryResponse(
					trace.traceId(),
					trace.endpoint(),
					trace.scenario(),
					trace.resultStatus(),
					trace.httpStatus(),
					trace.durationMs(),
					trace.startedAt()
				));
			}
		}
		summaries.sort(Comparator.comparing(TraceSummaryResponse::startedAt).reversed());
		return summaries;
	}

	public Trace getTrace(String traceId) {
		Trace trace = traces.get(traceId);
		if (trace == null) {
			throw new TraceNotFoundException(traceId);
		}
		return trace;
	}
}
