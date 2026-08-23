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
		assertFalse(catalog.stream().anyMatch(item -> item.controller().equals("InstrumentationController")));
		assertFalse(catalog.stream().anyMatch(item -> item.controller().equals("OtlpTraceIngestController")));
	}

	@Test
	void exposesProjectStructureByDomain() {
		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure();
		ProjectDomainResponse productDomain = structure.domains().stream()
			.filter(domain -> domain.id().equals("product"))
			.findFirst()
			.orElseThrow();
		ProjectDomainResponse paymentDomain = structure.domains().stream()
			.filter(domain -> domain.id().equals("payment"))
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
		assertFalse(productDomain.layers().stream()
			.flatMap(layer -> layer.classes().stream())
			.anyMatch(className -> className.startsWith("Payment") || className.startsWith("Trace") || className.startsWith("ApiCatalog")));
		assertTrue(paymentDomain.layers().stream()
			.anyMatch(layer -> layer.name().equals("UseCase") && layer.classes().contains("PaymentUseCase")));
		assertTrue(paymentDomain.layers().stream()
			.anyMatch(layer -> layer.name().equals("Gateway") && layer.classes().contains("PaymentGateway")));
		assertTrue(paymentDomain.layers().stream()
			.anyMatch(layer -> layer.name().equals("Client") && layer.classes().contains("PaymentClient")));
		assertFalse(paymentDomain.layers().stream()
			.flatMap(layer -> layer.classes().stream())
			.anyMatch(className -> className.startsWith("Product")));
		assertTrue(structure.layers().stream()
			.anyMatch(layer -> layer.classes().contains("ApiCatalogItemResponse")));
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
	void detectsRepositoryInterfacesAsPersistenceEvidence(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("build.gradle"), "plugins { id 'org.springframework.boot' version '4.1.0' }");
		Path sourceRoot = projectRoot.resolve("src/main/java/com/example/order");
		Files.createDirectories(sourceRoot);
		Files.writeString(sourceRoot.resolve("OrderController.java"), """
			package com.example.order;

			import org.springframework.web.bind.annotation.GetMapping;
			import org.springframework.web.bind.annotation.RestController;

			@RestController
			public class OrderController {
				@GetMapping("/orders")
				public String listOrders() {
					return "ok";
				}
			}
			""");
		Files.writeString(sourceRoot.resolve("OrderRepository.java"), """
			package com.example.order;

			public interface OrderRepository {
			}
			""");

		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());

		assertEquals(ProjectAnalysisStatus.SUCCESS, structure.analysisStatus());
		assertTrue(structure.layers().stream()
			.anyMatch(layer -> layer.name().equals("Repository") && layer.classes().contains("OrderRepository")));
		assertTrue(structure.infrastructure().contains("Persistence"));
		assertTrue(structure.infrastructureDetails().stream()
			.anyMatch(item -> item.name().equals("Persistence") && item.evidence().contains("OrderRepository")));
	}

	@Test
	void detectsRedisAndPostgresqlInfrastructureFromProjectEvidence(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("build.gradle"), """
			dependencies {
				implementation 'org.springframework.boot:spring-boot-starter-data-redis'
				runtimeOnly 'org.postgresql:postgresql'
			}
			""");
		Path sourceRoot = projectRoot.resolve("src/main/java/com/example/product");
		Files.createDirectories(sourceRoot);
		Files.writeString(sourceRoot.resolve("ProductController.java"), """
			package com.example.product;
			import org.springframework.web.bind.annotation.GetMapping;
			import org.springframework.web.bind.annotation.RestController;
			@RestController
			public class ProductController {
				@GetMapping("/lab/products")
				public String listProducts() { return "ok"; }
			}
			""");
		Files.writeString(sourceRoot.resolve("ProductRepository.java"), """
			package com.example.product;
			public interface ProductRepository { }
			""");
		Files.writeString(sourceRoot.resolve("ProductCacheService.java"), """
			package com.example.product;
			public class ProductCacheService { }
			""");

		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());

		assertEquals(ProjectAnalysisStatus.SUCCESS, structure.analysisStatus());
		assertTrue(structure.infrastructure().contains("Redis"));
		assertTrue(structure.infrastructure().contains("PostgreSQL"));
		assertTrue(structure.infrastructureDetails().stream()
			.anyMatch(item -> item.name().equals("PostgreSQL") && item.detectedBy().equals("project-config-and-class-name")));
	}

	@Test
	void leavesAmbiguousPackageSiblingClassesAtProjectScope(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("build.gradle"), "plugins { id 'org.springframework.boot' version '4.1.0' }");
		Path reportControllerRoot = projectRoot.resolve("src/main/java/com/example/board/controller");
		Path boardRepositoryRoot = projectRoot.resolve("src/main/java/com/example/board/repository");
		Path userRepositoryRoot = projectRoot.resolve("src/main/java/com/example/user/repository");
		Files.createDirectories(reportControllerRoot);
		Files.createDirectories(boardRepositoryRoot);
		Files.createDirectories(userRepositoryRoot);
		Files.writeString(reportControllerRoot.resolve("ReportController.java"), """
			package com.example.board.controller;

			import org.springframework.web.bind.annotation.GetMapping;
			import org.springframework.web.bind.annotation.RestController;

			@RestController
			public class ReportController {
				@GetMapping("/board/reports")
				public String listReports() {
					return "ok";
				}
			}
			""");
		Files.writeString(reportControllerRoot.resolve("AuditController.java"), """
			package com.example.board.controller;

			import org.springframework.web.bind.annotation.GetMapping;
			import org.springframework.web.bind.annotation.RestController;

			@RestController
			public class AuditController {
				@GetMapping("/board/audits")
				public String listAudits() {
					return "ok";
				}
			}
			""");
		Files.writeString(boardRepositoryRoot.resolve("PostRepository.java"), """
			package com.example.board.repository;

			public interface PostRepository {
			}
			""");
		Files.writeString(userRepositoryRoot.resolve("UserRepository.java"), """
			package com.example.user.repository;

			public interface UserRepository {
			}
			""");

		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());
		ProjectDomainResponse reportDomain = structure.domains().stream()
			.filter(domain -> domain.id().equals("report"))
			.findFirst()
			.orElseThrow();

		assertEquals(ProjectAnalysisStatus.SUCCESS, structure.analysisStatus());
		assertFalse(reportDomain.layers().stream()
			.anyMatch(layer -> layer.name().equals("Repository") && layer.classes().contains("PostRepository")));
		assertFalse(reportDomain.layers().stream()
			.anyMatch(layer -> layer.name().equals("Controller") && layer.classes().contains("AuditController")));
		assertFalse(reportDomain.layers().stream()
			.anyMatch(layer -> layer.name().equals("Repository") && layer.classes().contains("UserRepository")));
		assertFalse(reportDomain.infrastructure().contains("Persistence"));
		assertTrue(structure.layers().stream()
			.anyMatch(layer -> layer.name().equals("Repository") && layer.classes().contains("PostRepository")));
	}

	@Test
	void groupsClassesFromExplicitDomainPackageSegment(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("build.gradle"), "plugins { id 'org.springframework.boot' version '4.1.0' }");
		Path controllerRoot = projectRoot.resolve("src/main/java/com/example/order/controller");
		Path applicationRoot = projectRoot.resolve("src/main/java/com/example/order/application");
		Path sharedRoot = projectRoot.resolve("src/main/java/com/example/shared/client");
		Files.createDirectories(controllerRoot);
		Files.createDirectories(applicationRoot);
		Files.createDirectories(sharedRoot);
		Files.writeString(controllerRoot.resolve("OrderController.java"), """
			package com.example.order.controller;

			import org.springframework.web.bind.annotation.GetMapping;
			import org.springframework.web.bind.annotation.RestController;

			@RestController
			public class OrderController {
				@GetMapping("/orders")
				public String listOrders() {
					return "ok";
				}
			}
			""");
		Files.writeString(applicationRoot.resolve("CheckoutService.java"), """
			package com.example.order.application;

			public class CheckoutService {
			}
			""");
		Files.writeString(sharedRoot.resolve("SharedClient.java"), """
			package com.example.shared.client;

			public class SharedClient {
			}
			""");

		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());
		ProjectDomainResponse orderDomain = structure.domains().stream()
			.filter(domain -> domain.id().equals("order"))
			.findFirst()
			.orElseThrow();

		assertTrue(orderDomain.layers().stream()
			.anyMatch(layer -> layer.name().equals("Service") && layer.classes().contains("CheckoutService")));
		assertFalse(orderDomain.layers().stream()
			.anyMatch(layer -> layer.classes().contains("SharedClient")));
		assertTrue(structure.layers().stream()
			.anyMatch(layer -> layer.classes().contains("SharedClient")));
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
	void keepsPackagePrivateControllerClassRequestMappingAsBasePathOnly(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("build.gradle"), "plugins { id 'org.springframework.boot' version '4.1.0' }");
		Path sourceRoot = projectRoot.resolve("src/main/java/com/example/order");
		Files.createDirectories(sourceRoot);
		Files.writeString(sourceRoot.resolve("OrderController.java"), """
			package com.example.order;

			import org.springframework.web.bind.annotation.GetMapping;
			import org.springframework.web.bind.annotation.RequestMapping;
			import org.springframework.web.bind.annotation.RestController;

			@RestController
			@RequestMapping("/api/orders")
			class OrderController {
				@GetMapping("/{orderId}")
				String getOrder() {
					return "ok";
				}
			}
			""");

		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());
		ProjectDomainResponse orderDomain = structure.domains().stream()
			.filter(domain -> domain.id().equals("order"))
			.findFirst()
			.orElseThrow();

		assertEquals(ProjectAnalysisStatus.SUCCESS, structure.analysisStatus());
		assertEquals(1, orderDomain.endpoints().size());
		assertEquals("/api/orders/{orderId}", orderDomain.endpoints().getFirst().path());
		assertFalse(orderDomain.endpoints().stream().anyMatch(item -> item.path().equals("/api/orders")));
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
	void detectsEachMethodFromRequestMappingMethodArray(@TempDir Path projectRoot) throws IOException {
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
				@RequestMapping(
					path = "/{orderId}",
					method = {RequestMethod.GET, RequestMethod.POST}
				)
				public String handleOrder() {
					return "ok";
				}
			}
			""");

		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());
		ProjectDomainResponse orderDomain = structure.domains().stream()
			.filter(domain -> domain.id().equals("order"))
			.findFirst()
			.orElseThrow();
		Set<String> routes = orderDomain.endpoints().stream()
			.map(item -> item.method() + " " + item.path())
			.collect(Collectors.toSet());

		assertEquals(ProjectAnalysisStatus.SUCCESS, structure.analysisStatus());
		assertEquals(2, orderDomain.endpoints().size());
		assertTrue(routes.contains("GET /api/orders/{orderId}"));
		assertTrue(routes.contains("POST /api/orders/{orderId}"));
		assertTrue(orderDomain.endpoints().stream().allMatch(ApiCatalogItemResponse::methodSpecified));
	}

	@Test
	void detectsEachPathFromMappingPathArray(@TempDir Path projectRoot) throws IOException {
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
			@RequestMapping("/api/orders")
			public class OrderController {
				@GetMapping({"/list", "/search"})
				public String listOrders() {
					return "ok";
				}

				@RequestMapping(
					path = {"/bulk", "/batch"},
					method = {RequestMethod.POST, RequestMethod.PATCH}
				)
				public String handleBulkOrders() {
					return "ok";
				}
			}
			""");

		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());
		ProjectDomainResponse orderDomain = structure.domains().stream()
			.filter(domain -> domain.id().equals("order"))
			.findFirst()
			.orElseThrow();
		Set<String> routes = orderDomain.endpoints().stream()
			.map(item -> item.method() + " " + item.path())
			.collect(Collectors.toSet());

		assertEquals(ProjectAnalysisStatus.SUCCESS, structure.analysisStatus());
		assertEquals(6, orderDomain.endpoints().size());
		assertTrue(routes.contains("GET /api/orders/list"));
		assertTrue(routes.contains("GET /api/orders/search"));
		assertTrue(routes.contains("POST /api/orders/bulk"));
		assertTrue(routes.contains("POST /api/orders/batch"));
		assertTrue(routes.contains("PATCH /api/orders/bulk"));
		assertTrue(routes.contains("PATCH /api/orders/batch"));
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

	@Test
	void doesNotUseRequestMappingOptionsAsEndpointPath(@TempDir Path projectRoot) throws IOException {
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
				@RequestMapping(
					method = RequestMethod.GET,
					produces = "application/json"
				)
				public String listOrders() {
					return "ok";
				}

				@RequestMapping(
					params = "summary=true"
				)
				public String summarizeOrders() {
					return "ok";
				}
			}
			""");

		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());
		ProjectDomainResponse orderDomain = structure.domains().stream()
			.filter(domain -> domain.id().equals("order"))
			.findFirst()
			.orElseThrow();
		Set<String> routes = orderDomain.endpoints().stream()
			.map(item -> item.method() + " " + item.path())
			.collect(Collectors.toSet());

		assertEquals(ProjectAnalysisStatus.SUCCESS, structure.analysisStatus());
		assertEquals(2, orderDomain.endpoints().size());
		assertTrue(routes.contains("GET /api/orders"));
		assertTrue(routes.contains("UNSPECIFIED /api/orders"));
		assertFalse(orderDomain.endpoints().stream().anyMatch(item -> item.path().contains("application/json")));
		assertFalse(orderDomain.endpoints().stream().anyMatch(item -> item.path().contains("summary=true")));
	}

	@Test
	void scansEveryJavaSourceRootInAMultiModuleProject(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("settings.gradle"), "include 'orders', 'payments'");
		Path orderRoot = projectRoot.resolve("orders/src/main/java/com/example/order");
		Path paymentRoot = projectRoot.resolve("payments/src/main/java/com/example/payment");
		Path excludedRoot = projectRoot.resolve("orders/build/generated/src/main/java/com/example/generated");
		Files.createDirectories(orderRoot);
		Files.createDirectories(paymentRoot);
		Files.createDirectories(excludedRoot);
		Files.writeString(orderRoot.resolve("OrderController.java"), simpleRestController("Order", "/api/orders"));
		Files.writeString(paymentRoot.resolve("PaymentController.java"), simpleRestController("Payment", "/api/payments"));
		Files.writeString(excludedRoot.resolve("GeneratedController.java"), simpleRestController("Generated", "/generated"));

		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());

		assertEquals(ProjectAnalysisStatus.SUCCESS, structure.analysisStatus());
		assertEquals(2, structure.domains().size());
		assertEquals(List.of("orders/src/main/java", "payments/src/main/java"), structure.analysisCoverage().sourceRoots());
		assertEquals(2, structure.analysisCoverage().scannedJavaFiles());
		assertEquals(2, structure.analysisCoverage().controllerCandidates());
		assertEquals(2, structure.analysisCoverage().detectedControllers());
		assertEquals(2, structure.analysisCoverage().detectedEndpoints());
	}

	@Test
	void detectsControllerMethodsOnlyWhenResponseBodyIsExplicit(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("pom.xml"), "<project />");
		Path sourceRoot = projectRoot.resolve("src/main/java/com/example/report");
		Files.createDirectories(sourceRoot);
		Files.writeString(sourceRoot.resolve("ReportController.java"), """
			package com.example.report;

			import org.springframework.stereotype.Controller;
			import org.springframework.web.bind.annotation.GetMapping;
			import org.springframework.web.bind.annotation.ResponseBody;

			@Controller
			public class ReportController {
				@ResponseBody
				@GetMapping("/api/reports")
				public String listReports() { return "ok"; }

				@GetMapping("/reports/page")
				public String reportPage() { return "report"; }
			}
			""");
		Files.writeString(sourceRoot.resolve("SummaryController.java"), """
			package com.example.summary;

			import org.springframework.stereotype.Controller;
			import org.springframework.web.bind.annotation.GetMapping;
			import org.springframework.web.bind.annotation.ResponseBody;

			@Controller
			@ResponseBody
			public class SummaryController {
				@GetMapping("/api/summaries")
				public String listSummaries() { return "ok"; }
			}
			""");

		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());

		assertEquals(ProjectAnalysisStatus.SUCCESS, structure.analysisStatus());
		assertEquals(2, structure.analysisCoverage().controllerCandidates());
		assertEquals(2, structure.analysisCoverage().detectedControllers());
		assertEquals(2, structure.analysisCoverage().detectedEndpoints());
		assertTrue(structure.domains().stream()
			.flatMap(domain -> domain.endpoints().stream())
			.map(ApiCatalogItemResponse::path)
			.collect(Collectors.toSet())
			.containsAll(Set.of("/api/reports", "/api/summaries")));
	}

	@Test
	void reportsKotlinAndComposedMappingAsCoverageWarnings(@TempDir Path projectRoot) throws IOException {
		Path javaRoot = projectRoot.resolve("app/src/main/java/com/example/order");
		Path kotlinRoot = projectRoot.resolve("app/src/main/kotlin/com/example/order");
		Files.createDirectories(javaRoot);
		Files.createDirectories(kotlinRoot);
		Files.writeString(javaRoot.resolve("PublicGet.java"), """
			package com.example.order;

			import org.springframework.web.bind.annotation.GetMapping;

			@GetMapping
			public @interface PublicGet {}
			""");
		Files.writeString(kotlinRoot.resolve("KotlinController.kt"), "class KotlinController");

		ProjectStructureResponse structure = springApiCatalogService.getProjectStructure(projectRoot.toString());

		assertTrue(structure.analysisCoverage().warnings().stream().anyMatch(message -> message.contains("Kotlin")));
		assertTrue(structure.analysisCoverage().warnings().stream().anyMatch(message -> message.contains("합성 mapping")));
	}

	private String simpleRestController(String domain, String path) {
		return """
			package com.example.%s;

			import org.springframework.web.bind.annotation.GetMapping;
			import org.springframework.web.bind.annotation.RestController;

			@RestController
			public class %sController {
				@GetMapping("%s")
				public String list%s() { return "ok"; }
			}
			""".formatted(domain.toLowerCase(), domain, path, domain);
	}
}
