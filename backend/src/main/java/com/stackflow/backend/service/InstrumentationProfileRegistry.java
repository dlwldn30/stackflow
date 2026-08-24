package com.stackflow.backend.service;

import com.stackflow.backend.domain.InstrumentationConnectionStatus;
import com.stackflow.backend.dto.InstrumentationProfileStatusResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class InstrumentationProfileRegistry {

	private static final int MAX_PROFILES = 100;
	private static final Duration PROFILE_TTL = Duration.ofHours(24);

	private final Map<String, ProfileEntry> profiles = new ConcurrentHashMap<>();
	private final Clock clock;

	public InstrumentationProfileRegistry() {
		this(Clock.systemUTC());
	}

	InstrumentationProfileRegistry(Clock clock) {
		this.clock = clock;
	}

	public synchronized InstrumentationProfileStatusResponse register(String serviceName) {
		Instant now = clock.instant();
		pruneExpired(now);
		while (profiles.size() >= MAX_PROFILES) {
			profiles.values().stream()
				.min(Comparator.comparing(entry -> entry.createdAt))
				.ifPresent(entry -> profiles.remove(entry.profileId));
		}
		String profileId = UUID.randomUUID().toString();
		ProfileEntry entry = new ProfileEntry(profileId, serviceName, now);
		profiles.put(profileId, entry);
		return entry.toResponse();
	}

	public Optional<InstrumentationProfileStatusResponse> getStatus(String profileId) {
		ProfileEntry entry = profiles.get(profileId);
		if (entry == null) {
			return Optional.empty();
		}
		if (isExpired(entry, clock.instant())) {
			profiles.remove(profileId, entry);
			return Optional.empty();
		}
		return Optional.of(entry.toResponse());
	}

	public boolean markSpanReceived(String profileId, String serviceName) {
		if (profileId == null || profileId.isBlank()) {
			return false;
		}
		ProfileEntry entry = profiles.get(profileId);
		Instant now = clock.instant();
		if (entry == null || isExpired(entry, now)) {
			if (entry != null) {
				profiles.remove(profileId, entry);
			}
			return false;
		}
		entry.markSpanReceived(serviceName, now);
		return true;
	}

	private void pruneExpired(Instant now) {
		profiles.values().removeIf(entry -> isExpired(entry, now));
	}

	private boolean isExpired(ProfileEntry entry, Instant now) {
		return Duration.between(entry.createdAt, now).compareTo(PROFILE_TTL) >= 0;
	}

	private static final class ProfileEntry {
		private final String profileId;
		private final Instant createdAt;
		private volatile String serviceName;
		private volatile InstrumentationConnectionStatus status = InstrumentationConnectionStatus.PROFILE_GENERATED;
		private volatile Instant lastSeenAt;

		private ProfileEntry(String profileId, String serviceName, Instant createdAt) {
			this.profileId = profileId;
			this.serviceName = serviceName;
			this.createdAt = createdAt;
		}

		private synchronized void markSpanReceived(String nextServiceName, Instant seenAt) {
			if (nextServiceName != null && !nextServiceName.isBlank()) {
				serviceName = nextServiceName;
			}
			status = InstrumentationConnectionStatus.SPAN_RECEIVED;
			lastSeenAt = seenAt;
		}

		private InstrumentationProfileStatusResponse toResponse() {
			return new InstrumentationProfileStatusResponse(profileId, status, serviceName, createdAt, lastSeenAt);
		}
	}
}
