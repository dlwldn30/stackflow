package com.stackflow.orderlab.order.client;

import com.stackflow.orderlab.order.dto.ProductResponse;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Component
public class ProductClient {

	private final HttpClient httpClient;
	private final ObjectMapper objectMapper;
	private final URI productServiceBaseUrl;
	private final Duration requestTimeout;

	@Autowired
	public ProductClient(
		ObjectMapper objectMapper,
		@Value("${product-service.base-url}") URI productServiceBaseUrl,
		@Value("${product-service.request-timeout}") Duration requestTimeout
	) {
		this(HttpClient.newBuilder().connectTimeout(requestTimeout).build(), objectMapper, productServiceBaseUrl, requestTimeout);
	}

	ProductClient(
		HttpClient httpClient,
		ObjectMapper objectMapper,
		URI productServiceBaseUrl,
		Duration requestTimeout
	) {
		this.httpClient = httpClient;
		this.objectMapper = objectMapper;
		this.productServiceBaseUrl = productServiceBaseUrl;
		this.requestTimeout = requestTimeout;
	}

	public ProductResponse getProduct(long productId) {
		return execute("/lab/products/" + productId, ProductResponse.class);
	}

	public void triggerDatabaseTimeout(long productId) {
		execute("/lab/products/" + productId + "/database-timeout", Void.class);
	}

	private <T> T execute(String path, Class<T> responseType) {
		HttpRequest request = HttpRequest.newBuilder(productServiceBaseUrl.resolve(path))
			.timeout(requestTimeout)
			.GET()
			.build();
		try {
			HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
			if (response.statusCode() < 200 || response.statusCode() >= 300) {
				throw new ProductClientException(
					response.statusCode(),
					"Product service returned HTTP " + response.statusCode() + "."
				);
			}
			if (responseType == Void.class) {
				return null;
			}
			return objectMapper.readValue(response.body(), responseType);
		} catch (JacksonException exception) {
			throw new ProductClientException("Product service returned an invalid JSON response.", exception);
		} catch (IOException exception) {
			throw new ProductClientException("Product service could not be reached.", exception);
		} catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			throw new ProductClientException("Product service request was interrupted.", exception);
		}
	}
}
