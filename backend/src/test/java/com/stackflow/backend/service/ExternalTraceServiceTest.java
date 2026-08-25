package com.stackflow.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import com.stackflow.backend.domain.ComponentType;
import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.Trace;
import com.stackflow.backend.domain.TraceCollectionStatus;
import com.stackflow.backend.domain.TraceEvent;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import org.junit.jupiter.api.Test;

class ExternalTraceServiceTest {

	@Test
	void storesPartialSpansAndHttpResultWhenCollectionTimesOut() {
		Instant now = Instant.parse("2026-08-25T00:00:00Z");
		TraceStreamService streamService = new TraceStreamService();
		TraceService traceService = new TraceService(streamService);
		ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
		ExternalTraceService service = new ExternalTraceService(
			traceService,
			Clock.fixed(now, ZoneOffset.UTC),
			scheduler,
			Duration.ofDays(1),
			Duration.ofMillis(600)
		);
		try {
			ExternalTraceService.TraceCaptureContext capture = service.startCapture("GET", "/orders/1");
			streamService.createEmitter(capture.traceId());
			service.recordHttpResponse(capture.traceId(), 200, 35);
			service.acceptSpans(capture.traceId(), "order-app", List.of(new TraceEvent(
				"service-span",
				capture.traceId(),
				ComponentType.SERVICE,
				"OrderService.findOrder",
				EventStatus.SUCCESS,
				now.plusMillis(5),
				now.plusMillis(20),
				15,
				null,
				null,
				Map.of("code.function.name", "findOrder"),
				"service-span",
				"missing-server-span",
				"order-app",
				"INTERNAL"
			)));

			service.timeout(capture.traceId());
			service.acceptSpans(capture.traceId(), "order-app", List.of(new TraceEvent(
				"late-span",
				capture.traceId(),
				ComponentType.CONTROLLER,
				"OrderController.findOrder",
				EventStatus.SUCCESS,
				now.plusMillis(30),
				now.plusMillis(35),
				5,
				null,
				null,
				Map.of(),
				"late-span",
				null,
				"order-app",
				"SERVER"
			)));

			Trace trace = traceService.getTrace(capture.traceId());
			assertEquals(TraceCollectionStatus.TIMED_OUT, trace.traceCollectionStatus());
			assertEquals(EventStatus.SUCCESS, trace.resultStatus());
			assertEquals(200, trace.httpStatus());
			assertEquals(35, trace.durationMs());
			assertEquals(List.of("service-span"), trace.events().stream().map(TraceEvent::spanId).toList());
			assertEquals(TraceCollectionStatus.TIMED_OUT, traceService.getRecentTraces().getFirst().traceCollectionStatus());
			assertEquals(0, streamService.activeConnectionCount());
			assertEquals(5, streamService.historySize(capture.traceId()));
			assertFalse(service.isCaptureActive(capture.traceId()));
		} finally {
			service.shutdown();
			streamService.shutdown();
		}
	}

	@Test
	void storesARequestFailureWhenNoSpansArriveBeforeTimeout() {
		Instant now = Instant.parse("2026-08-25T00:00:00Z");
		TraceStreamService streamService = new TraceStreamService();
		TraceService traceService = new TraceService(streamService);
		ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
		ExternalTraceService service = new ExternalTraceService(
			traceService,
			Clock.fixed(now, ZoneOffset.UTC),
			scheduler,
			Duration.ofDays(1),
			Duration.ofMillis(600)
		);
		try {
			ExternalTraceService.TraceCaptureContext capture = service.startCapture("GET", "/unreachable");
			service.recordHttpResponse(capture.traceId(), 0, 80);

			service.timeout(capture.traceId());

			Trace trace = traceService.getTrace(capture.traceId());
			assertEquals(TraceCollectionStatus.TIMED_OUT, trace.traceCollectionStatus());
			assertEquals(EventStatus.ERROR, trace.resultStatus());
			assertEquals(0, trace.httpStatus());
			assertEquals(80, trace.durationMs());
			assertEquals(List.of(), trace.events());
			assertEquals(1, traceService.getRecentTraces().size());
		} finally {
			service.shutdown();
			streamService.shutdown();
		}
	}
}
