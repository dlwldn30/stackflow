package com.stackflow.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.stackflow.backend.domain.InstrumentationConnectionStatus;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

class InstrumentationProfileRegistryTest {

	@Test
	void expiresProfilesAfterTwentyFourHours() {
		MutableClock clock = new MutableClock(Instant.parse("2026-08-24T00:00:00Z"));
		InstrumentationProfileRegistry registry = new InstrumentationProfileRegistry(clock);
		String profileId = registry.register("order-app").profileId();

		clock.advance(Duration.ofHours(24));

		assertTrue(registry.getStatus(profileId).isEmpty());
		assertTrue(!registry.markSpanReceived(profileId, "order-app"));
	}

	@Test
	void recordsTheLatestSpanObservation() {
		MutableClock clock = new MutableClock(Instant.parse("2026-08-24T00:00:00Z"));
		InstrumentationProfileRegistry registry = new InstrumentationProfileRegistry(clock);
		String profileId = registry.register("order-app").profileId();
		clock.advance(Duration.ofSeconds(5));

		assertTrue(registry.markSpanReceived(profileId, "order-app-live"));

		var status = registry.getStatus(profileId).orElseThrow();
		assertEquals(InstrumentationConnectionStatus.SPAN_RECEIVED, status.connectionStatus());
		assertEquals("order-app-live", status.serviceName());
		assertEquals(Instant.parse("2026-08-24T00:00:05Z"), status.lastSeenAt());
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
