package com.stackflow.backend.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.stackflow.backend.service.InstrumentationProfileRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class InstrumentationControllerTest {

	@Test
	void returnsRegisteredProfileStatus() {
		InstrumentationProfileRegistry registry = new InstrumentationProfileRegistry();
		String profileId = registry.register("order-app").profileId();
		InstrumentationController controller = new InstrumentationController(null, registry);

		assertEquals(profileId, controller.getProfileStatus(profileId).profileId());
	}

	@Test
	void returnsNotFoundForUnknownOrExpiredProfile() {
		InstrumentationController controller = new InstrumentationController(null, new InstrumentationProfileRegistry());

		ResponseStatusException exception = assertThrows(
			ResponseStatusException.class,
			() -> controller.getProfileStatus("missing-profile")
		);

		assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
	}
}
