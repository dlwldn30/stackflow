package com.stackflow.backend.controller;

import com.stackflow.backend.dto.InstrumentationProfileRequest;
import com.stackflow.backend.dto.InstrumentationProfileResponse;
import com.stackflow.backend.dto.InstrumentationProfileStatusResponse;
import com.stackflow.backend.service.InstrumentationProfileRegistry;
import com.stackflow.backend.service.SpringInstrumentationProfileService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/instrumentation")
public class InstrumentationController {

	private final SpringInstrumentationProfileService profileService;
	private final InstrumentationProfileRegistry profileRegistry;

	public InstrumentationController(
		SpringInstrumentationProfileService profileService,
		InstrumentationProfileRegistry profileRegistry
	) {
		this.profileService = profileService;
		this.profileRegistry = profileRegistry;
	}

	@PostMapping("/profile")
	public InstrumentationProfileResponse createProfile(@RequestBody InstrumentationProfileRequest request) {
		return profileService.createProfile(request);
	}

	@GetMapping("/profiles/{profileId}/status")
	public InstrumentationProfileStatusResponse getProfileStatus(@PathVariable String profileId) {
		return profileRegistry.getStatus(profileId)
			.orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
				HttpStatus.NOT_FOUND,
				"Instrumentation profile was not found or expired."
			));
	}
}
