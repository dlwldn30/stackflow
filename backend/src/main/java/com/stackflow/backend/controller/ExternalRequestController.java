package com.stackflow.backend.controller;

import com.stackflow.backend.dto.ExternalRequestPayload;
import com.stackflow.backend.dto.ExternalRequestResponse;
import com.stackflow.backend.service.ExternalRequestService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/external")
public class ExternalRequestController {

	private final ExternalRequestService externalRequestService;

	public ExternalRequestController(ExternalRequestService externalRequestService) {
		this.externalRequestService = externalRequestService;
	}

	@PostMapping("/request")
	public ExternalRequestResponse executeExternalRequest(@RequestBody ExternalRequestPayload payload) {
		return externalRequestService.execute(payload);
	}
}
