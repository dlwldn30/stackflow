package com.stackflow.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
	void keepsEntryServiceAndMergesOutOfOrderServiceBatches() throws InterruptedException {
		TraceStreamService streamService = new TraceStreamService();
		TraceService traceService = new TraceService(streamService);
		ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
		ExternalTraceService service = new ExternalTraceService(
			traceService,
			Clock.systemUTC(),
			scheduler,
			Duration.ofDays(1),
			Duration.ofMillis(80)
		);
		try {
			ExternalTraceService.TraceCaptureContext capture = service.startCapture("GET", "/orders/1");
			Instant now = Instant.now();
			service.acceptSpans(capture.traceId(), "order-service", List.of(traceEvent(
				capture,
				"order-server",
				capture.parentSpanId(),
				"order-service",
				"SERVER",
				now.plusMillis(20)
			)));
			service.recordHttpResponse(capture.traceId(), 200, 50);
			Thread.sleep(30);
			service.acceptSpans(capture.traceId(), "product-service", List.of(traceEvent(
				capture,
				"product-server",
				"order-client",
				"product-service",
				"SERVER",
				now
			)));

			Thread.sleep(140);

			Trace trace = traceService.getTrace(capture.traceId());
			assertEquals("order-service", trace.serviceName());
			assertEquals(List.of("order-service", "product-service"), trace.serviceNames());
			assertEquals(List.of("product-server", "order-server"), trace.events().stream().map(TraceEvent::spanId).toList());
		} finally {
			service.shutdown();
			streamService.shutdown();
		}
	}

	@Test
	void waitsForHttpResponseWhenServerSpanArrivesFirst() throws InterruptedException {
		TraceStreamService streamService = new TraceStreamService();
		TraceService traceService = new TraceService(streamService);
		ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
		ExternalTraceService service = new ExternalTraceService(
			traceService,
			Clock.systemUTC(),
			scheduler,
			Duration.ofDays(1),
			Duration.ofMillis(30)
		);
		try {
			ExternalTraceService.TraceCaptureContext capture = service.startCapture("GET", "/orders/1");
			Instant now = Instant.now();
			service.acceptSpans(capture.traceId(), "order-app", List.of(new TraceEvent(
				"server-span",
				capture.traceId(),
				ComponentType.CONTROLLER,
				"GET /orders/1",
				EventStatus.SUCCESS,
				now,
				now.plusMillis(10),
				10,
				null,
				null,
				Map.of(),
				"server-span",
				capture.parentSpanId(),
				"order-app",
				"SERVER"
			)));

			Thread.sleep(80);
			assertTrue(service.isCaptureActive(capture.traceId()));
			assertThrows(TraceNotFoundException.class, () -> traceService.getTrace(capture.traceId()));

			service.recordHttpResponse(
				capture.traceId(),
				200,
				15,
				"text/plain",
				"completed after spans"
			);
			Thread.sleep(80);

			Trace trace = traceService.getTrace(capture.traceId());
			assertEquals("completed after spans", trace.responsePreview().body());
			assertFalse(service.isCaptureActive(capture.traceId()));
		} finally {
			service.shutdown();
			streamService.shutdown();
		}
	}

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
			service.recordHttpResponse(
				capture.traceId(),
				200,
				35,
				"application/json",
				"{\"orderId\":1,\"accessToken\":\"private\"}"
			);
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
			assertTrue(trace.responsePreview().body().contains("[REDACTED]"));
			assertFalse(trace.responsePreview().body().contains("private"));
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

	private TraceEvent traceEvent(
		ExternalTraceService.TraceCaptureContext capture,
		String spanId,
		String parentSpanId,
		String serviceName,
		String spanKind,
		Instant startedAt
	) {
		return new TraceEvent(
			spanId,
			capture.traceId(),
			ComponentType.CONTROLLER,
			spanId,
			EventStatus.SUCCESS,
			startedAt,
			startedAt.plusMillis(10),
			10,
			null,
			null,
			Map.of(),
			spanId,
			parentSpanId,
			serviceName,
			spanKind
		);
	}
}
