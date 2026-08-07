package com.stackflow.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.stackflow.backend.dto.ApiCatalogItemResponse;
import com.stackflow.backend.dto.ProjectAnalysisStatus;
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

		assertEquals(6, catalog.size());
		assertTrue(routes.contains("GET /api/products"));
		assertTrue(routes.contains("GET /api/products/{productId}"));
		assertTrue(routes.contains("GET /api/products/{productId}/stock"));
		assertTrue(routes.contains("POST /api/products/{productId}/cache-refresh"));
		assertTrue(routes.contains("GET /api/payments"));
		assertTrue(routes.contains("POST /api/payments/quote"));
	}

	@Test
	void exposesControllerAndHandlerMetadata() {
		ApiCatalogItemResponse stockApi = springApiCatalogService.getApiCatalog().stream()
			.filter(item -> item.path().equals("/api/products/{productId}/stock"))
			.findFirst()
			.orElseThrow();

		assertEquals("GET", stockApi.method());
		assertTrue(stockApi.methodSpecified());
		assertEquals("ProductController", stockApi.controller());
		assertEquals("getProductStock", stockApi.handler());
		assertEquals("QUERY_STOCK", stockApi.requestType());
		assertTrue(stockApi.requiresPathVariable());
		assertEquals(List.of("productId"), stockApi.pathVariables());
		assertTrue(stockApi.sourceFile().endsWith("ProductController.java"));
		assertTrue(stockApi.sourceLine() > 0);
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
		assertEquals(ProjectAnalysisStatus.SUCCESS, structure.analysisStatus());
		assertEquals("build.gradle", structure.frameworkEvidence());
		assertEquals("src/main/java", structure.sourceRoot());
		assertEquals(2, structure.domains().size());
		assertTrue(structure.infrastructure().contains("Redis"));
		assertTrue(structure.infrastructure().contains("MySQL"));
		assertFalse(structure.infrastructureDetails().isEmpty());
		assertEquals("Product", productDomain.name());
		assertEquals(4, productDomain.endpoints().size());
		assertTrue(productDomain.controllers().stream().anyMatch(controller -> controller.name().equals("ProductController")));
		assertTrue(productDomain.controllers().stream().allMatch(controller -> !controller.sourceFile().startsWith("/")));
		assertTrue(productDomain.layers().stream().anyMatch(layer -> layer.name().equals("Service")));
		assertTrue(productDomain.layers().stream().anyMatch(layer -> layer.name().equals("Repository")));
		assertTrue(productDomain.layers().stream().allMatch(layer -> !layer.evidence().isBlank()));
		assertTrue(structure.domains().stream().anyMatch(domain -> domain.id().equals("payment")));
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
		assertEquals(ProjectAnalysisStatus.SUCCESS, structure.analysisStatus());
		assertEquals("build.gradle", structure.frameworkEvidence());
		assertEquals("src/main/java", structure.sourceRoot());
		assertEquals("Order", orderDomain.name());
		assertEquals(1, orderDomain.endpoints().size());
		assertEquals("/api/orders/{orderId}", orderDomain.endpoints().getFirst().path());
		assertEquals(List.of("orderId"), orderDomain.endpoints().getFirst().pathVariables());
		assertEquals("com/example/order/OrderController.java", orderDomain.endpoints().getFirst().sourceFile());
		assertTrue(orderDomain.layers().stream().anyMatch(layer -> layer.name().equals("Service")));
	}

	@Test
	void returnsFailureStatusWhenSourceRootDoesNotExist(@TempDir Path projectRoot) {
		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());

		assertEquals(ProjectAnalysisStatus.FAILED, structure.analysisStatus());
		assertTrue(structure.domains().isEmpty());
		assertTrue(structure.analysisMessage().contains("No Java source root"));
	}

	@Test
	void returnsEmptyStatusWhenNoRestControllersExist(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("build.gradle"), "plugins { id 'org.springframework.boot' version '4.1.0' }");
		Path sourceRoot = projectRoot.resolve("src/main/java/com/example/plain");
		Files.createDirectories(sourceRoot);
		Files.writeString(sourceRoot.resolve("PlainService.java"), """
			package com.example.plain;

			public class PlainService {
			}
			""");

		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());

		assertEquals(ProjectAnalysisStatus.EMPTY, structure.analysisStatus());
		assertTrue(structure.domains().isEmpty());
		assertTrue(structure.analysisMessage().contains("no REST API mappings"));
	}

	@Test
	void groupsUseCaseAndGatewayClassesIntoTheSameDomain(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("build.gradle"), "plugins { id 'org.springframework.boot' version '4.1.0' }");
		Path sourceRoot = projectRoot.resolve("src/main/java/com/example/payment");
		Files.createDirectories(sourceRoot);
		Files.writeString(sourceRoot.resolve("PaymentController.java"), """
			package com.example.payment;

			import org.springframework.web.bind.annotation.GetMapping;
			import org.springframework.web.bind.annotation.RequestMapping;
			import org.springframework.web.bind.annotation.RestController;

			@RestController
			@RequestMapping("/api/payments")
			public class PaymentController {
				@GetMapping
				public String listPayments() {
					return "ok";
				}
			}
			""");
		Files.writeString(sourceRoot.resolve("PaymentUseCase.java"), """
			package com.example.payment;

			public class PaymentUseCase {
			}
			""");
		Files.writeString(sourceRoot.resolve("PaymentGateway.java"), """
			package com.example.payment;

			public class PaymentGateway {
			}
			""");
		Files.writeString(sourceRoot.resolve("PaymentClient.java"), """
			package com.example.payment;

			public class PaymentClient {
			}
			""");

		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());
		ProjectDomainResponse paymentDomain = structure.domains().stream()
			.filter(domain -> domain.id().equals("payment"))
			.findFirst()
			.orElseThrow();

		assertEquals(ProjectAnalysisStatus.SUCCESS, structure.analysisStatus());
		assertTrue(paymentDomain.layers().stream().anyMatch(layer -> layer.name().equals("UseCase")));
		assertTrue(paymentDomain.layers().stream().anyMatch(layer -> layer.name().equals("Gateway")));
		assertTrue(paymentDomain.layers().stream().anyMatch(layer -> layer.name().equals("Client")));
	}
	@Test
	void detectsMultiLineRequestMappings(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("build.gradle"), "plugins { id 'org.springframework.boot' version '4.1.0' }");
		Path sourceRoot = projectRoot.resolve("src/main/java/com/example/order");
		Files.createDirectories(sourceRoot);
		Files.writeString(sourceRoot.resolve("OrderController.java"), """
			package com.example.order;

			import org.springframework.web.bind.annotation.GetMapping;
			import org.springframework.web.bind.annotation.RequestMapping;
			import org.springframework.web.bind.annotation.RequestMethod;
			import org.springframework.web.bind.annotation.RestController;

			@RestController
			@RequestMapping(
				value = "/api/orders"
			)
			public class OrderController {
				@RequestMapping(
					value = "/{orderId}",
					method = RequestMethod.GET
				)
				public String getOrder() {
					return "ok";
				}

				@GetMapping(
					path = "/summary"
				)
				public String getSummary() {
					return "ok";
				}
			}
			""");

		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());
		Set<String> routes = structure.domains().stream()
			.flatMap(domain -> domain.endpoints().stream())
			.map(item -> item.method() + " " + item.path())
			.collect(Collectors.toSet());

		assertEquals(ProjectAnalysisStatus.SUCCESS, structure.analysisStatus());
		assertTrue(routes.contains("GET /api/orders/{orderId}"));
		assertTrue(routes.contains("GET /api/orders/summary"));
	}

	@Test
	void detectsMethodLevelRequestMappingWithoutExplicitMethod(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("build.gradle"), "plugins { id 'org.springframework.boot' version '4.1.0' }");
		Path sourceRoot = projectRoot.resolve("src/main/java/com/example/order");
		Files.createDirectories(sourceRoot);
		Files.writeString(sourceRoot.resolve("OrderController.java"), """
			package com.example.order;

			import org.springframework.web.bind.annotation.RequestMapping;
			import org.springframework.web.bind.annotation.RequestMethod;
			import org.springframework.web.bind.annotation.RestController;

			@RestController
			@RequestMapping("/api/orders")
			public class OrderController {
				@RequestMapping(path = "/summary")
				public String getSummary() {
					return "ok";
				}

				@RequestMapping(
					path = "/detail",
					method = RequestMethod.GET
				)
				public String getDetail() {
					return "ok";
				}
			}
			""");

		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());
		ProjectDomainResponse orderDomain = structure.domains().stream()
			.filter(domain -> domain.id().equals("order"))
			.findFirst()
			.orElseThrow();
		ApiCatalogItemResponse summaryApi = orderDomain.endpoints().stream()
			.filter(item -> item.path().equals("/api/orders/summary"))
			.findFirst()
			.orElseThrow();
		ApiCatalogItemResponse detailApi = orderDomain.endpoints().stream()
			.filter(item -> item.path().equals("/api/orders/detail"))
			.findFirst()
			.orElseThrow();

		assertEquals(ProjectAnalysisStatus.SUCCESS, structure.analysisStatus());
		assertEquals(2, orderDomain.endpoints().size());
		assertEquals("UNSPECIFIED", summaryApi.method());
		assertFalse(summaryApi.methodSpecified());
		assertEquals("GET", detailApi.method());
		assertTrue(detailApi.methodSpecified());
		assertFalse(orderDomain.endpoints().stream().anyMatch(item -> item.path().equals("/api/orders")));
	}

	@Test
	void detectsMethodLevelRequestMappingThatUsesOnlyClassLevelBasePath(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("build.gradle"), "plugins { id 'org.springframework.boot' version '4.1.0' }");
		Path sourceRoot = projectRoot.resolve("src/main/java/com/example/order");
		Files.createDirectories(sourceRoot);
		Files.writeString(sourceRoot.resolve("OrderController.java"), """
			package com.example.order;

			import org.springframework.web.bind.annotation.RequestMapping;
			import org.springframework.web.bind.annotation.RequestMethod;
			import org.springframework.web.bind.annotation.RestController;

			@RestController
			@RequestMapping("/api/orders")
			public class OrderController {
				@RequestMapping(method = RequestMethod.GET)
				public String listOrders() {
					return "ok";
				}

				@RequestMapping
				public String fallbackRoute() {
					return "ok";
				}
			}
			""");

		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());
		ProjectDomainResponse orderDomain = structure.domains().stream()
			.filter(domain -> domain.id().equals("order"))
			.findFirst()
			.orElseThrow();
		List<ApiCatalogItemResponse> rootApis = orderDomain.endpoints().stream()
			.filter(item -> item.path().equals("/api/orders"))
			.toList();

		assertEquals(ProjectAnalysisStatus.SUCCESS, structure.analysisStatus());
		assertEquals(2, rootApis.size());
		assertTrue(rootApis.stream().anyMatch(ApiCatalogItemResponse::methodSpecified));
		assertTrue(rootApis.stream().anyMatch(item -> item.method().equals("GET")));
		assertTrue(rootApis.stream().anyMatch(item -> !item.methodSpecified()));
		assertTrue(rootApis.stream().anyMatch(item -> item.method().equals("UNSPECIFIED")));
	}
}
