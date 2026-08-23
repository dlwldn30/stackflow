package com.stackflow.backend.domain;

import java.time.Instant;
import java.util.List;

public record Trace(
	String traceId,
	String method,
	String endpoint,
	String scenario,
	Instant startedAt,
	Instant endedAt,
	long durationMs,
	int httpStatus,
	EventStatus resultStatus,
	List<TraceEvent> events,
	TraceSource source,
	String serviceName
) {
	public Trace(
		String traceId,
		String method,
		String endpoint,
		String scenario,
		Instant startedAt,
		Instant endedAt,
		long durationMs,
		int httpStatus,
		EventStatus resultStatus,
		List<TraceEvent> events
	) {
		this(
			traceId,
			method,
			endpoint,
			scenario,
			startedAt,
			endedAt,
			durationMs,
			httpStatus,
			resultStatus,
			events,
			TraceSource.SAMPLE,
			"stackflow-sample"
		);
	}
}
