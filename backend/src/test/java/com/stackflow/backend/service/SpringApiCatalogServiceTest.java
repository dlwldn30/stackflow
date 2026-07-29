package com.stackflow.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.stackflow.backend.dto.ApiCatalogItemResponse;
import com.stackflow.backend.dto.ProjectDomainResponse;
import com.stackflow.backend.dto.ProjectStructureResponse;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SpringApiCatalogServiceTest {

	private final SpringApiCatalogService springApiCatalogService = new SpringApiCatalogService();

	@Test
	void detectsProductControllerApis() {
		List<ApiCatalogItemResponse> catalog = springApiCatalogService.getApiCatalog();
		Set<String> routes = catalog.stream()
			.map(item -> item.method() + " " + item.path())
			.collect(Collectors.toSet());

		assertEquals(4, catalog.size());
		assertTrue(routes.contains("GET /api/products"));
		assertTrue(routes.contains("GET /api/products/{productId}"));
		assertTrue(routes.contains("GET /api/products/{productId}/stock"));
		assertTrue(routes.contains("POST /api/products/{productId}/cache-refresh"));
	}

	@Test
	void exposesControllerAndHandlerMetadata() {
		ApiCatalogItemResponse stockApi = springApiCatalogService.getApiCatalog().stream()
			.filter(item -> item.path().equals("/api/products/{productId}/stock"))
			.findFirst()
			.orElseThrow();

		assertEquals("GET", stockApi.method());
		assertEquals("ProductController", stockApi.controller());
		assertEquals("getProductStock", stockApi.handler());
		assertEquals("QUERY_STOCK", stockApi.requestType());
		assertTrue(stockApi.requiresPathVariable());
		assertEquals(List.of("productId"), stockApi.pathVariables());
	}

	@Test
	void excludesStackFlowInternalTraceApis() {
		List<ApiCatalogItemResponse> catalog = springApiCatalogService.getApiCatalog();

		assertFalse(catalog.stream().anyMatch(item -> item.controller().equals("TraceController")));
		assertFalse(catalog.stream().anyMatch(item -> item.path().startsWith("/api/traces")));
		assertFalse(catalog.stream().anyMatch(item -> item.controller().equals("ApiExceptionHandler")));
	}

	@Test
	void exposesProjectStructureByDomain() {
		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure();
		ProjectDomainResponse productDomain = structure.domains().stream()
			.filter(domain -> domain.id().equals("product"))
			.findFirst()
			.orElseThrow();

		assertEquals("backend", structure.projectName());
		assertEquals("Spring Boot + Gradle", structure.framework());
		assertEquals(1, structure.domains().size());
		assertTrue(structure.infrastructure().contains("Redis"));
		assertTrue(structure.infrastructure().contains("MySQL"));
		assertEquals("Product", productDomain.name());
		assertEquals(4, productDomain.endpoints().size());
		assertTrue(productDomain.controllers().stream().anyMatch(controller -> controller.name().equals("ProductController")));
		assertTrue(productDomain.layers().stream().anyMatch(layer -> layer.name().equals("Service")));
		assertTrue(productDomain.layers().stream().anyMatch(layer -> layer.name().equals("Repository")));
	}

	@Test
	void analyzesExternalSpringBootProjectPath(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("build.gradle"), "plugins { id 'org.springframework.boot' version '4.1.0' }");
		Path sourceRoot = projectRoot.resolve("src/main/java/com/example/order");
		Files.createDirectories(sourceRoot);
		Files.writeString(sourceRoot.resolve("OrderController.java"), """
			package com.example.order;

			import org.springframework.web.bind.annotation.GetMapping;
			import org.springframework.web.bind.annotation.PathVariable;
			import org.springframework.web.bind.annotation.RequestMapping;
			import org.springframework.web.bind.annotation.RestController;

			@RestController
			@RequestMapping("/api/orders")
			public class OrderController {
				@GetMapping("/{orderId}")
				public String getOrder(@PathVariable Long orderId) {
					return "ok";
				}
			}
			""");
		Files.writeString(sourceRoot.resolve("OrderService.java"), """
			package com.example.order;

			public class OrderService {
			}
			""");

		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());
		ProjectDomainResponse orderDomain = structure.domains().stream()
			.filter(domain -> domain.id().equals("order"))
			.findFirst()
			.orElseThrow();

		assertEquals(projectRoot.getFileName().toString(), structure.projectName());
		assertEquals("Spring Boot + Gradle", structure.framework());
		assertEquals("Order", orderDomain.name());
		assertEquals(1, orderDomain.endpoints().size());
		assertEquals("/api/orders/{orderId}", orderDomain.endpoints().getFirst().path());
		assertEquals(List.of("orderId"), orderDomain.endpoints().getFirst().pathVariables());
		assertTrue(orderDomain.layers().stream().anyMatch(layer -> layer.name().equals("Service")));
	}
}
