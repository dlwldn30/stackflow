package com.stackflow.backend.service;

import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.Trace;
import com.stackflow.backend.dto.TraceSummaryResponse;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import org.springframework.stereotype.Service;

@Service
public class TraceService {

	private final Map<String, Trace> traces = new ConcurrentHashMap<>();
	private final ConcurrentLinkedDeque<String> order = new ConcurrentLinkedDeque<>();

	public TraceSession startTrace(String method, String endpoint, String scenario) {
		return new TraceSession(method, endpoint, scenario);
	}

	public Trace completeTrace(TraceSession session, int httpStatus, EventStatus resultStatus) {
		Trace trace = session.complete(httpStatus, resultStatus);
		traces.put(trace.traceId(), trace);
		order.remove(trace.traceId());
		order.addFirst(trace.traceId());
		while (order.size() > 25) {
			String expired = order.pollLast();
			if (expired != null) {
				traces.remove(expired);
			}
		}
		return trace;
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
