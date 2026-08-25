package com.stackflow.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.protobuf.ByteString;
import com.stackflow.backend.domain.ComponentType;
import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.Trace;
import com.stackflow.backend.domain.TraceSource;
import com.stackflow.backend.domain.InstrumentationConnectionStatus;
import io.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;
import io.opentelemetry.proto.common.v1.AnyValue;
import io.opentelemetry.proto.common.v1.KeyValue;
import io.opentelemetry.proto.resource.v1.Resource;
import io.opentelemetry.proto.trace.v1.ResourceSpans;
import io.opentelemetry.proto.trace.v1.ScopeSpans;
import io.opentelemetry.proto.trace.v1.Span;
import io.opentelemetry.proto.trace.v1.Status;
import java.time.Instant;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;

class OtlpTraceIngestServiceTest {

	@Test
	void convertsOtlpSpansIntoParentChildRuntimeTrace() throws Exception {
		TraceService traceService = new TraceService(new TraceStreamService());
		ExternalTraceService externalTraceService = new ExternalTraceService(traceService);
		OtlpTraceIngestService ingestService = new OtlpTraceIngestService(externalTraceService, new InstrumentationProfileRegistry());
		ExternalTraceService.TraceCaptureContext capture = externalTraceService.startCapture("GET", "/orders");
		String traceId = capture.traceId();
		String serverSpanId = "0123456789abcdef";
		String serviceSpanId = "fedcba9876543210";
		long startNanos = Instant.now().toEpochMilli() * 1_000_000L;
		try {
			externalTraceService.recordHttpResponse(
				traceId,
				200,
				20,
				"text/plain; charset=utf-8",
				"order response"
			);
			Span serverSpan = Span.newBuilder()
				.setTraceId(bytes(traceId))
				.setSpanId(bytes(serverSpanId))
				.setName("GET /orders")
				.setKind(Span.SpanKind.SPAN_KIND_SERVER)
				.setStartTimeUnixNano(startNanos)
				.setEndTimeUnixNano(startNanos + 20_000_000L)
				.addAttributes(attribute("http.request.method", "GET"))
				.addAttributes(attribute("http.route", "/orders"))
				.build();
			Span serviceSpan = Span.newBuilder()
				.setTraceId(bytes(traceId))
				.setSpanId(bytes(serviceSpanId))
				.setParentSpanId(bytes(serverSpanId))
				.setName("OrderService.findOrder")
				.setKind(Span.SpanKind.SPAN_KIND_INTERNAL)
				.setStartTimeUnixNano(startNanos + 2_000_000L)
				.setEndTimeUnixNano(startNanos + 12_000_000L)
				.addAttributes(attribute("code.namespace", "com.example.order.OrderService"))
				.addAttributes(attribute("db.statement", "select * from secret_orders"))
				.build();
			ExportTraceServiceRequest firstBatch = ExportTraceServiceRequest.newBuilder()
				.addResourceSpans(ResourceSpans.newBuilder()
					.setResource(Resource.newBuilder().addAttributes(attribute("service.name", "order-app")))
					.addScopeSpans(ScopeSpans.newBuilder().addSpans(serviceSpan)))
				.build();
			ExportTraceServiceRequest secondBatch = ExportTraceServiceRequest.newBuilder()
				.addResourceSpans(ResourceSpans.newBuilder()
					.setResource(Resource.newBuilder().addAttributes(attribute("service.name", "order-app")))
					.addScopeSpans(ScopeSpans.newBuilder().addSpans(serverSpan).addSpans(serviceSpan)))
				.build();

			assertEquals(1, ingestService.ingest(firstBatch));
			assertEquals(2, ingestService.ingest(secondBatch));
			Thread.sleep(900);

			Trace trace = traceService.getTrace(traceId);
			assertEquals(TraceSource.OPENTELEMETRY, trace.source());
			assertEquals("order-app", trace.serviceName());
			assertEquals(2, trace.events().size());
			assertTrue(trace.events().stream().anyMatch(event ->
				serviceSpanId.equals(event.spanId()) && serverSpanId.equals(event.parentSpanId())));
			assertTrue(trace.events().stream().anyMatch(event -> event.component().name().equals("SERVICE")));
			assertFalse(trace.events().stream().anyMatch(event -> event.metadata().containsKey("db.statement")));
			assertEquals("order response", trace.responsePreview().body());
		} finally {
			externalTraceService.shutdown();
		}
	}

	@Test
	void ignoresSpansForTraceIdsThatStackFlowDidNotStart() {
		TraceService traceService = new TraceService(new TraceStreamService());
		ExternalTraceService externalTraceService = new ExternalTraceService(traceService);
		OtlpTraceIngestService ingestService = new OtlpTraceIngestService(externalTraceService, new InstrumentationProfileRegistry());
		String unknownTraceId = "0123456789abcdef0123456789abcdef";
		long startNanos = Instant.now().toEpochMilli() * 1_000_000L;
		try {
			ExportTraceServiceRequest request = ExportTraceServiceRequest.newBuilder()
				.addResourceSpans(ResourceSpans.newBuilder()
					.addScopeSpans(ScopeSpans.newBuilder().addSpans(span(
						unknownTraceId, "0123456789abcdef", null, "GET /unknown",
						Span.SpanKind.SPAN_KIND_SERVER, startNanos, 4
					))))
				.build();

			assertEquals(0, ingestService.ingest(request));
			assertTrue(traceService.getRecentTraces().isEmpty());
		} finally {
			externalTraceService.shutdown();
		}
	}

	@Test
	void readsLegacySemanticKeysAndErrorTypeWithoutLeakingSensitiveMetadata() throws Exception {
		TraceService traceService = new TraceService(new TraceStreamService());
		ExternalTraceService externalTraceService = new ExternalTraceService(traceService);
		OtlpTraceIngestService ingestService = new OtlpTraceIngestService(externalTraceService, new InstrumentationProfileRegistry());
		ExternalTraceService.TraceCaptureContext capture = externalTraceService.startCapture("GET", "/legacy");
		long startNanos = Instant.now().toEpochMilli() * 1_000_000L;
		try {
			externalTraceService.recordHttpResponse(capture.traceId(), 504, 1_200);
			Span serverSpan = Span.newBuilder(span(
				capture.traceId(), "5123456789abcdef", null, "GET /legacy",
				Span.SpanKind.SPAN_KIND_SERVER, startNanos, 1_200
			))
				.addAttributes(attribute("http.method", "GET"))
				.addAttributes(attribute("http.status_code", "504"))
				.addAttributes(attribute("http.target", "/legacy?secret=value"))
				.addAttributes(attribute("error.type", "java.sql.SQLTimeoutException"))
				.addAttributes(attribute("http.request.header.authorization", "Bearer private"))
				.addAttributes(attribute("db.user", "private-user"))
				.addAttributes(attribute("db.connection_string", "postgresql://private-host/database"))
				.setStatus(Status.newBuilder().setCode(Status.StatusCode.STATUS_CODE_ERROR).setMessage("query timed out"))
				.build();
			ExportTraceServiceRequest request = ExportTraceServiceRequest.newBuilder()
				.addResourceSpans(ResourceSpans.newBuilder()
					.addScopeSpans(ScopeSpans.newBuilder().addSpans(serverSpan)))
				.build();

			assertEquals(1, ingestService.ingest(request));
			Thread.sleep(900);

			Trace trace = traceService.getTrace(capture.traceId());
			assertEquals(EventStatus.TIMEOUT, trace.resultStatus());
			assertEquals("java.sql.SQLTimeoutException", trace.events().getFirst().errorType());
			assertEquals("GET", trace.events().getFirst().metadata().get("http.method"));
			assertEquals("/legacy", trace.events().getFirst().metadata().get("http.target"));
			assertFalse(trace.events().getFirst().metadata().containsKey("http.request.header.authorization"));
			assertFalse(trace.events().getFirst().metadata().containsKey("db.user"));
			assertFalse(trace.events().getFirst().metadata().containsKey("db.connection_string"));
		} finally {
			externalTraceService.shutdown();
		}
	}

	@Test
	void classifiesPostgresqlAndRedisDatabaseSpans() throws Exception {
		TraceService traceService = new TraceService(new TraceStreamService());
		ExternalTraceService externalTraceService = new ExternalTraceService(traceService);
		OtlpTraceIngestService ingestService = new OtlpTraceIngestService(externalTraceService, new InstrumentationProfileRegistry());
		ExternalTraceService.TraceCaptureContext capture = externalTraceService.startCapture("GET", "/lab/products/1001");
		String traceId = capture.traceId();
		String serverSpanId = "1123456789abcdef";
		long startNanos = Instant.now().toEpochMilli() * 1_000_000L;
		try {
			externalTraceService.recordHttpResponse(traceId, 200, 30);
			Span serverSpan = span(traceId, serverSpanId, null, "GET /lab/products/1001", Span.SpanKind.SPAN_KIND_SERVER, startNanos, 30);
			Span redisSpan = Span.newBuilder(span(
				traceId, "2123456789abcdef", serverSpanId, "GET", Span.SpanKind.SPAN_KIND_CLIENT, startNanos + 1_000_000L, 4
			)).addAttributes(attribute("db.system.name", "redis")).build();
			Span postgresqlSpan = Span.newBuilder(span(
				traceId, "3123456789abcdef", serverSpanId, "SELECT products", Span.SpanKind.SPAN_KIND_CLIENT, startNanos + 6_000_000L, 8
			))
				.addAttributes(attribute("db.system.name", "postgresql"))
				.addAttributes(attribute("db.operation.name", "SELECT"))
				.addAttributes(attribute("db.statement", "select * from products"))
				.build();
			Span cacheServiceSpan = Span.newBuilder(span(
				traceId, "4123456789abcdef", serverSpanId, "ProductCacheService.findById",
				Span.SpanKind.SPAN_KIND_INTERNAL, startNanos + 15_000_000L, 4
			))
				.addAttributes(attribute("code.namespace", "com.example.product.cache.ProductCacheService"))
				.setStatus(Status.newBuilder().setCode(Status.StatusCode.STATUS_CODE_ERROR))
				.build();
			ExportTraceServiceRequest request = ExportTraceServiceRequest.newBuilder()
				.addResourceSpans(ResourceSpans.newBuilder()
					.setResource(Resource.newBuilder().addAttributes(attribute("service.name", "trace-lab")))
					.addScopeSpans(ScopeSpans.newBuilder()
						.addSpans(serverSpan)
						.addSpans(redisSpan)
						.addSpans(postgresqlSpan)
						.addSpans(cacheServiceSpan)))
				.build();

			assertEquals(4, ingestService.ingest(request));
			Thread.sleep(900);

			Trace trace = traceService.getTrace(traceId);
			assertEquals(EventStatus.WARNING, trace.resultStatus());
			assertEquals(2, trace.events().stream().filter(event -> event.component() == ComponentType.REDIS).count());
			assertTrue(trace.events().stream().anyMatch(event ->
				event.component() == ComponentType.POSTGRESQL
					&& "SELECT".equals(event.metadata().get("db.operation.name"))
					&& !event.metadata().containsKey("db.statement")));
		} finally {
			externalTraceService.shutdown();
		}
	}

	@Test
	void marksKnownProfileAsSeenWithoutStoringUntrackedTrace() {
		TraceService traceService = new TraceService(new TraceStreamService());
		ExternalTraceService externalTraceService = new ExternalTraceService(traceService);
		InstrumentationProfileRegistry profileRegistry = new InstrumentationProfileRegistry();
		String profileId = profileRegistry.register("order-app").profileId();
		OtlpTraceIngestService ingestService = new OtlpTraceIngestService(externalTraceService, profileRegistry);
		String unknownTraceId = "1123456789abcdef0123456789abcdef";
		long startNanos = Instant.now().toEpochMilli() * 1_000_000L;
		try {
			ExportTraceServiceRequest request = ExportTraceServiceRequest.newBuilder()
				.addResourceSpans(ResourceSpans.newBuilder()
					.setResource(Resource.newBuilder()
						.addAttributes(attribute("service.name", "order-app-live"))
						.addAttributes(attribute("stackflow.profile.id", profileId)))
					.addScopeSpans(ScopeSpans.newBuilder().addSpans(span(
						unknownTraceId, "1123456789abcdef", null, "GET /health",
						Span.SpanKind.SPAN_KIND_SERVER, startNanos, 3
					))))
				.build();

			assertEquals(0, ingestService.ingest(request));
			var status = profileRegistry.getStatus(profileId).orElseThrow();
			assertEquals(InstrumentationConnectionStatus.SPAN_RECEIVED, status.connectionStatus());
			assertEquals("order-app-live", status.serviceName());
			assertTrue(status.lastSeenAt() != null);
			assertTrue(traceService.getRecentTraces().isEmpty());
		} finally {
			externalTraceService.shutdown();
		}
	}

	@Test
	void ignoresUnknownProfileId() {
		TraceService traceService = new TraceService(new TraceStreamService());
		ExternalTraceService externalTraceService = new ExternalTraceService(traceService);
		InstrumentationProfileRegistry profileRegistry = new InstrumentationProfileRegistry();
		OtlpTraceIngestService ingestService = new OtlpTraceIngestService(externalTraceService, profileRegistry);
		long startNanos = Instant.now().toEpochMilli() * 1_000_000L;
		try {
			ExportTraceServiceRequest request = ExportTraceServiceRequest.newBuilder()
				.addResourceSpans(ResourceSpans.newBuilder()
					.setResource(Resource.newBuilder()
						.addAttributes(attribute("stackflow.profile.id", "unknown-profile")))
					.addScopeSpans(ScopeSpans.newBuilder().addSpans(span(
						"2123456789abcdef0123456789abcdef", "2123456789abcdef", null, "GET /unknown",
						Span.SpanKind.SPAN_KIND_SERVER, startNanos, 3
					))))
				.build();

			assertEquals(0, ingestService.ingest(request));
			assertTrue(profileRegistry.getStatus("unknown-profile").isEmpty());
			assertTrue(traceService.getRecentTraces().isEmpty());
		} finally {
			externalTraceService.shutdown();
		}
	}

	@Test
	void doesNotConfirmAProfileFromAnEmptyResourceBatch() {
		TraceService traceService = new TraceService(new TraceStreamService());
		ExternalTraceService externalTraceService = new ExternalTraceService(traceService);
		InstrumentationProfileRegistry profileRegistry = new InstrumentationProfileRegistry();
		String profileId = profileRegistry.register("order-app").profileId();
		OtlpTraceIngestService ingestService = new OtlpTraceIngestService(externalTraceService, profileRegistry);
		try {
			ExportTraceServiceRequest request = ExportTraceServiceRequest.newBuilder()
				.addResourceSpans(ResourceSpans.newBuilder()
					.setResource(Resource.newBuilder()
						.addAttributes(attribute("stackflow.profile.id", profileId))))
				.build();

			assertEquals(0, ingestService.ingest(request));
			assertEquals(
				InstrumentationConnectionStatus.PROFILE_GENERATED,
				profileRegistry.getStatus(profileId).orElseThrow().connectionStatus()
			);
		} finally {
			externalTraceService.shutdown();
		}
	}

	private static Span span(
		String traceId,
		String spanId,
		String parentSpanId,
		String name,
		Span.SpanKind kind,
		long startNanos,
		long durationMillis
	) {
		Span.Builder builder = Span.newBuilder()
			.setTraceId(bytes(traceId))
			.setSpanId(bytes(spanId))
			.setName(name)
			.setKind(kind)
			.setStartTimeUnixNano(startNanos)
			.setEndTimeUnixNano(startNanos + durationMillis * 1_000_000L);
		if (parentSpanId != null) {
			builder.setParentSpanId(bytes(parentSpanId));
		}
		return builder.build();
	}

	private static ByteString bytes(String hex) {
		return ByteString.copyFrom(HexFormat.of().parseHex(hex));
	}

	private static KeyValue attribute(String key, String value) {
		return KeyValue.newBuilder()
			.setKey(key)
			.setValue(AnyValue.newBuilder().setStringValue(value))
			.build();
	}
}
