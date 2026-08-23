package com.stackflow.backend.controller;

import com.google.protobuf.InvalidProtocolBufferException;
import jakarta.servlet.http.HttpServletRequest;
import io.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;
import io.opentelemetry.proto.collector.trace.v1.ExportTraceServiceResponse;
import com.stackflow.backend.service.OtlpTraceIngestService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OtlpTraceIngestController {

	private static final int MAX_REQUEST_BYTES = 5 * 1024 * 1024;
	private final OtlpTraceIngestService ingestService;

	public OtlpTraceIngestController(OtlpTraceIngestService ingestService) {
		this.ingestService = ingestService;
	}

	@PostMapping(
		path = "/v1/traces",
		consumes = { "application/x-protobuf", "application/protobuf" },
		produces = "application/x-protobuf"
	)
	public ResponseEntity<byte[]> ingest(HttpServletRequest request) throws java.io.IOException {
		byte[] body = request.getInputStream().readNBytes(MAX_REQUEST_BYTES + 1);
		if (body.length > MAX_REQUEST_BYTES) {
			return ResponseEntity.status(413).contentType(MediaType.APPLICATION_OCTET_STREAM).body(new byte[0]);
		}
		ExportTraceServiceRequest exportRequest;
		try {
			exportRequest = ExportTraceServiceRequest.parseFrom(body);
		} catch (InvalidProtocolBufferException exception) {
			return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_OCTET_STREAM).body(new byte[0]);
		}
		ingestService.ingest(exportRequest);
		return ResponseEntity.ok()
			.contentType(MediaType.parseMediaType("application/x-protobuf"))
			.body(ExportTraceServiceResponse.getDefaultInstance().toByteArray());
	}
}
