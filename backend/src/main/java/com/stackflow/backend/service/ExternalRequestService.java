package com.stackflow.backend.service;

import com.stackflow.backend.dto.ExternalRequestPayload;
import com.stackflow.backend.dto.ExternalRequestResponse;
import com.stackflow.backend.domain.TraceCollectionStatus;
import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.net.URLEncoder;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class ExternalRequestService {

	private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
	private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(8);
	private static final String ALLOW_PRIVATE_TARGETS_PROPERTY = "stackflow.external.allow-private-targets";
	private static final String ALLOW_PRIVATE_TARGETS_ENV = "STACKFLOW_ALLOW_PRIVATE_TARGETS";
	private static final Set<String> BLOCKED_HEADERS = Set.of(
		"connection",
		"content-length",
		"expect",
		"host",
		"traceparent",
		"tracestate",
		"upgrade",
		"transfer-encoding"
	);

	private final HttpClient httpClient;
	private final boolean allowPrivateTargets;
	private final ExternalTraceService externalTraceService;

	@Autowired
	public ExternalRequestService(ExternalTraceService externalTraceService) {
		this(HttpClient.newBuilder()
				.connectTimeout(CONNECT_TIMEOUT)
				.build(),
			resolveAllowPrivateTargets(),
			externalTraceService);
	}

	ExternalRequestService(HttpClient httpClient) {
		this(httpClient, resolveAllowPrivateTargets(), null);
	}

	ExternalRequestService(HttpClient httpClient, boolean allowPrivateTargets) {
		this(httpClient, allowPrivateTargets, null);
	}

	ExternalRequestService(HttpClient httpClient, boolean allowPrivateTargets, ExternalTraceService externalTraceService) {
		this.httpClient = httpClient;
		this.allowPrivateTargets = allowPrivateTargets;
		this.externalTraceService = externalTraceService;
	}

	public ExternalRequestResponse execute(ExternalRequestPayload payload) {
		Instant startedAt = Instant.now();
		ExternalTraceService.TraceCaptureContext traceContext = null;
		try {
			String method = normalizeMethod(payload.method());
			URI targetUri = buildTargetUri(payload.targetBaseUrl(), payload.path(), payload.queryParams());
			traceContext = payload.captureTrace() && externalTraceService != null
				? externalTraceService.startCapture(method, targetUri.getPath())
				: null;
			HttpRequest request = buildRequest(targetUri, method, payload.headers(), payload.requestBody(), traceContext);
			HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
			long durationMs = Duration.between(startedAt, Instant.now()).toMillis();
			if (traceContext != null) {
				externalTraceService.recordHttpResponse(traceContext.traceId(), response.statusCode(), durationMs);
			}
			return new ExternalRequestResponse(
				method,
				targetUri.toString(),
				response.statusCode(),
				durationMs,
				response.statusCode() >= 200 && response.statusCode() < 400 ? "SUCCESS" : "ERROR",
				response.headers().firstValue("content-type").orElse(""),
				response.body(),
				null,
				traceContext == null ? null : traceContext.traceId(),
				traceContext == null ? TraceCollectionStatus.DISABLED : TraceCollectionStatus.PENDING
			);
		}
		catch (IllegalArgumentException | IOException | InterruptedException ex) {
			if (ex instanceof InterruptedException) {
				Thread.currentThread().interrupt();
			}
			long durationMs = Duration.between(startedAt, Instant.now()).toMillis();
			if (traceContext != null) {
				externalTraceService.recordHttpResponse(traceContext.traceId(), 0, durationMs);
			}
			return new ExternalRequestResponse(
				safeMethod(payload.method()),
				safeTargetUrl(payload.targetBaseUrl(), payload.path()),
				0,
				durationMs,
				"ERROR",
				"",
				"",
				ex.getMessage(),
				traceContext == null ? null : traceContext.traceId(),
				traceContext == null ? TraceCollectionStatus.DISABLED : TraceCollectionStatus.PENDING
			);
		}
	}

	URI buildTargetUri(String targetBaseUrl, String path) {
		return buildTargetUri(targetBaseUrl, path, List.of());
	}

	URI buildTargetUri(String targetBaseUrl, String path, List<com.stackflow.backend.dto.ExternalRequestEntry> queryParams) {
		if (targetBaseUrl == null || targetBaseUrl.isBlank()) {
			throw new IllegalArgumentException("targetBaseUrl is required.");
		}
		String normalizedBase = targetBaseUrl.trim();
		if (!normalizedBase.startsWith("http://") && !normalizedBase.startsWith("https://")) {
			throw new IllegalArgumentException("Only http:// and https:// target URLs are supported.");
		}
		while (normalizedBase.endsWith("/")) {
			normalizedBase = normalizedBase.substring(0, normalizedBase.length() - 1);
		}
		String normalizedPath = path == null || path.isBlank() ? "/" : path.trim();
		if (!normalizedPath.startsWith("/")) {
			normalizedPath = "/" + normalizedPath;
		}
		String queryString = buildQueryString(queryParams);
		URI targetUri = URI.create(normalizedBase + normalizedPath + queryString);
		validateTargetHost(targetUri);
		return targetUri;
	}

	private HttpRequest buildRequest(
		URI targetUri,
		String method,
		List<com.stackflow.backend.dto.ExternalRequestEntry> headers,
		String requestBody,
		ExternalTraceService.TraceCaptureContext traceContext
	) {
		HttpRequest.BodyPublisher bodyPublisher = shouldUseBody(method, requestBody)
			? HttpRequest.BodyPublishers.ofString(requestBody)
			: HttpRequest.BodyPublishers.noBody();

		HttpRequest.Builder builder = HttpRequest.newBuilder(targetUri)
			.timeout(REQUEST_TIMEOUT)
			.header("Accept", "application/json, text/plain, */*")
			.method(method, bodyPublisher);

		addHeaders(builder, headers);
		if (traceContext != null) {
			builder.header("traceparent", traceContext.traceparent());
		}

		if (shouldUseBody(method, requestBody)) {
			builder.header("Content-Type", "application/json");
		}
		return builder.build();
	}

	private void addHeaders(HttpRequest.Builder builder, List<com.stackflow.backend.dto.ExternalRequestEntry> headers) {
		if (headers == null) {
			return;
		}

		headers.stream()
			.filter(this::isEnabledEntry)
			.filter(entry -> !isBlockedHeader(entry.key()))
			.forEach(entry -> builder.header(entry.key().trim(), entry.value() == null ? "" : entry.value()));
	}

	private boolean isBlockedHeader(String key) {
		return key == null || key.isBlank() || BLOCKED_HEADERS.contains(key.trim().toLowerCase(Locale.ROOT));
	}

	private String buildQueryString(List<com.stackflow.backend.dto.ExternalRequestEntry> queryParams) {
		if (queryParams == null || queryParams.isEmpty()) {
			return "";
		}

		String query = queryParams.stream()
			.filter(this::isEnabledEntry)
			.map(entry -> encode(entry.key().trim()) + "=" + encode(entry.value() == null ? "" : entry.value()))
			.reduce((left, right) -> left + "&" + right)
			.orElse("");

		return query.isBlank() ? "" : "?" + query;
	}

	private boolean isEnabledEntry(com.stackflow.backend.dto.ExternalRequestEntry entry) {
		return entry != null
			&& entry.enabled()
			&& entry.key() != null
			&& !entry.key().isBlank();
	}

	private String encode(String value) {
		return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
	}

	private void validateTargetHost(URI targetUri) {
		String host = targetUri.getHost();
		if (host == null || host.isBlank()) {
			throw new IllegalArgumentException("Target URL host is required.");
		}
		if (allowPrivateTargets) {
			return;
		}
		if (host.equalsIgnoreCase("localhost")) {
			throw new IllegalArgumentException("Private target URLs are blocked by default.");
		}

		try {
			for (InetAddress address : InetAddress.getAllByName(host)) {
				if (isPrivateTargetAddress(address)) {
					throw new IllegalArgumentException("Private target URLs are blocked by default.");
				}
			}
		} catch (UnknownHostException exception) {
			throw new IllegalArgumentException("Target URL host could not be resolved.");
		}
	}

	private boolean isPrivateTargetAddress(InetAddress address) {
		return address.isAnyLocalAddress()
			|| address.isLoopbackAddress()
			|| address.isLinkLocalAddress()
			|| address.isSiteLocalAddress()
			|| address.isMulticastAddress()
			|| isUniqueLocalIpv6Address(address);
	}

	private boolean isUniqueLocalIpv6Address(InetAddress address) {
		byte[] bytes = address.getAddress();
		return bytes.length == 16 && (bytes[0] & 0xfe) == 0xfc;
	}

	private boolean shouldUseBody(String method, String requestBody) {
		return requestBody != null
			&& !requestBody.isBlank()
			&& !method.equals("GET")
			&& !method.equals("DELETE");
	}

	private String normalizeMethod(String method) {
		String normalized = safeMethod(method);
		if (!normalized.matches("GET|POST|PUT|PATCH|DELETE")) {
			throw new IllegalArgumentException("Unsupported method: " + normalized);
		}
		return normalized;
	}

	private String safeMethod(String method) {
		if (method == null || method.isBlank()) {
			return "GET";
		}
		return method.trim().toUpperCase(Locale.ROOT);
	}

	private String safeTargetUrl(String targetBaseUrl, String path) {
		try {
			return buildTargetUri(targetBaseUrl, path).toString();
		}
		catch (IllegalArgumentException ex) {
			return "";
		}
	}

	private static boolean resolveAllowPrivateTargets() {
		String propertyValue = System.getProperty(ALLOW_PRIVATE_TARGETS_PROPERTY);
		if (propertyValue != null) {
			return Boolean.parseBoolean(propertyValue);
		}
		return Boolean.parseBoolean(System.getenv(ALLOW_PRIVATE_TARGETS_ENV));
	}
}
