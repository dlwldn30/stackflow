package com.stackflow.backend.controller;

import com.stackflow.backend.domain.Trace;
import com.stackflow.backend.dto.TraceSummaryResponse;
import com.stackflow.backend.service.TraceService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/traces")
public class TraceController {

	private final TraceService traceService;

	public TraceController(TraceService traceService) {
		this.traceService = traceService;
	}

	@GetMapping
	public List<TraceSummaryResponse> getRecentTraces() {
		return traceService.getRecentTraces();
	}

	@GetMapping("/{traceId}")
	public Trace getTrace(@PathVariable String traceId) {
		return traceService.getTrace(traceId);
	}
}
