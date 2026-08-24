package com.stackflow.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.stackflow.backend.domain.TraceCollectionStatus;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class TraceStreamServiceTest {

	private final List<TraceStreamService> services = new ArrayList<>();

	@AfterEach
	void shutdownServices() {
		services.forEach(TraceStreamService::shutdown);
	}

	@Test
	void rejectsUnknownAndReusedTraceIds() {
		TestContext context = context(3, 100);

		assertThrows(TraceNotFoundException.class, () -> context.service.createEmitter("unknown"));
		context.service.registerPendingTrace("sample-1");
		context.service.activateTrace("sample-1");
		assertThrows(TraceSessionConflictException.class, () -> context.service.activateTrace("sample-1"));
	}

	@Test
	void expiresPendingAndActiveRegistrations() {
		TestContext context = context(3, 100);
		context.service.registerPendingTrace("pending");
		context.clock.advance(Duration.ofSeconds(30));
		assertThrows(TraceNotFoundException.class, () -> context.service.createEmitter("pending"));

		context.service.registerActiveTrace("active");
		context.clock.advance(Duration.ofMinutes(2));
		assertThrows(TraceNotFoundException.class, () -> context.service.createEmitter("active"));
	}

	@Test
	void sendsHeartbeatWithoutAddingItToHistoryThenTimesOutConnection() {
		TestContext context = context(3, 100);
		context.service.registerActiveTrace("trace-1");
		context.service.createEmitter("trace-1");
		RecordingEmitter emitter = context.emitters.getFirst();
		context.service.publishTraceStarted("trace-1", "GET", "/orders", "normal");

		assertEquals(2, emitter.sendCount);
		assertEquals(1, context.service.historySize("trace-1"));

		context.clock.advance(Duration.ofSeconds(10));
		context.service.maintainConnections();
		assertEquals(3, emitter.sendCount);
		assertEquals(1, context.service.historySize("trace-1"));

		context.clock.advance(Duration.ofSeconds(20));
		context.service.maintainConnections();
		assertEquals(4, emitter.sendCount);
		assertEquals(1, emitter.completeCount);
		assertEquals(0, context.service.activeConnectionCount());
		assertEquals(1, context.service.historySize("trace-1"));
	}

	@Test
	void removesConnectionsOnTerminalStatusAndAllowsHistoryReplay() {
		TestContext context = context(3, 100);
		context.service.registerActiveTrace("trace-1");
		context.service.createEmitter("trace-1");
		context.service.publishTraceCollectionStatus("trace-1", TraceCollectionStatus.PENDING, "waiting");
		context.service.publishTraceCollectionStatus("trace-1", TraceCollectionStatus.TIMED_OUT, "timed out");

		assertEquals(0, context.service.activeConnectionCount());
		assertEquals(2, context.service.historySize("trace-1"));

		context.service.createEmitter("trace-1");
		RecordingEmitter replayEmitter = context.emitters.get(1);
		assertEquals(3, replayEmitter.sendCount);
		assertEquals(1, replayEmitter.completeCount);
		assertEquals(0, context.service.activeConnectionCount());
	}

	@Test
	void enforcesPerTraceAndGlobalConnectionLimits() {
		TestContext perTrace = context(2, 10);
		perTrace.service.registerPendingTrace("trace-1");
		perTrace.service.createEmitter("trace-1");
		perTrace.service.createEmitter("trace-1");
		assertThrows(TraceStreamCapacityException.class, () -> perTrace.service.createEmitter("trace-1"));

		TestContext global = context(3, 2);
		global.service.registerPendingTrace("trace-a");
		global.service.registerPendingTrace("trace-b");
		global.service.registerPendingTrace("trace-c");
		global.service.createEmitter("trace-a");
		global.service.createEmitter("trace-b");
		assertThrows(TraceStreamCapacityException.class, () -> global.service.createEmitter("trace-c"));
	}

	@Test
	void removesConnectionsOnClientCompletionErrorAndSendFailure() {
		TestContext completion = context(3, 100);
		completion.service.registerPendingTrace("completed-by-client");
		completion.service.createEmitter("completed-by-client");
		completion.emitters.getFirst().triggerCompletion();
		assertEquals(0, completion.service.activeConnectionCount());

		TestContext error = context(3, 100);
		error.service.registerPendingTrace("client-error");
		error.service.createEmitter("client-error");
		error.emitters.getFirst().triggerError();
		assertEquals(0, error.service.activeConnectionCount());

		TestContext sendFailure = context(3, 100);
		sendFailure.service.registerActiveTrace("send-failure");
		sendFailure.service.createEmitter("send-failure");
		sendFailure.emitters.getFirst().failNextSend = true;
		sendFailure.service.publishTraceStarted("send-failure", "GET", "/orders", "normal");
		assertEquals(0, sendFailure.service.activeConnectionCount());
		assertEquals(1, sendFailure.emitters.getFirst().errorCompletionCount);
	}

	private TestContext context(int maxPerTrace, int maxTotal) {
		MutableClock clock = new MutableClock(Instant.parse("2026-08-24T00:00:00Z"));
		List<RecordingEmitter> emitters = new ArrayList<>();
		TraceStreamService service = new TraceStreamService(
			clock,
			timeout -> {
				RecordingEmitter emitter = new RecordingEmitter(timeout);
				emitters.add(emitter);
				return emitter;
			},
			maxPerTrace,
			maxTotal,
			false
		);
		services.add(service);
		return new TestContext(service, clock, emitters);
	}

	private record TestContext(
		TraceStreamService service,
		MutableClock clock,
		List<RecordingEmitter> emitters
	) {
	}

	private static final class RecordingEmitter extends SseEmitter {
		private int sendCount;
		private int completeCount;
		private int errorCompletionCount;
		private boolean failNextSend;
		private Runnable completionCallback;
		private Consumer<Throwable> errorCallback;

		private RecordingEmitter(Long timeout) {
			super(timeout);
		}

		@Override
		public synchronized void send(SseEventBuilder builder) throws IOException {
			if (failNextSend) {
				failNextSend = false;
				throw new IOException("simulated send failure");
			}
			sendCount++;
		}

		@Override
		public synchronized void complete() {
			completeCount++;
		}

		@Override
		public synchronized void completeWithError(Throwable ex) {
			errorCompletionCount++;
		}

		@Override
		public void onCompletion(Runnable callback) {
			completionCallback = callback;
		}

		@Override
		public void onError(Consumer<Throwable> callback) {
			errorCallback = callback;
		}

		private void triggerCompletion() {
			completionCallback.run();
		}

		private void triggerError() {
			errorCallback.accept(new IOException("client disconnected"));
		}
	}

	private static final class MutableClock extends Clock {
		private Instant instant;

		private MutableClock(Instant instant) {
			this.instant = instant;
		}

		private void advance(Duration duration) {
			instant = instant.plus(duration);
		}

		@Override
		public ZoneId getZone() {
			return ZoneId.of("UTC");
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return this;
		}

		@Override
		public Instant instant() {
			return instant;
		}
	}
}
