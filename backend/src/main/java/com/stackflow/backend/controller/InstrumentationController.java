package com.stackflow.backend.controller;

import com.stackflow.backend.dto.InstrumentationProfileRequest;
import com.stackflow.backend.dto.InstrumentationProfileResponse;
import com.stackflow.backend.service.SpringInstrumentationProfileService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/instrumentation")
public class InstrumentationController {

	private final SpringInstrumentationProfileService profileService;

	public InstrumentationController(SpringInstrumentationProfileService profileService) {
		this.profileService = profileService;
	}

	@PostMapping("/profile")
	public InstrumentationProfileResponse createProfile(@RequestBody InstrumentationProfileRequest request) {
		return profileService.createProfile(request);
	}
}
