package com.stackflow.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.stackflow.backend.dto.InstrumentationProfileRequest;
import com.stackflow.backend.dto.InstrumentationProfileResponse;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SpringInstrumentationProfileServiceTest {

	private final InstrumentationProfileRegistry profileRegistry = new InstrumentationProfileRegistry();
	private final SpringInstrumentationProfileService profileService =
		new SpringInstrumentationProfileService(new SpringApiCatalogService(), profileRegistry);

	@Test
	void createsAgentProfileFromAnalyzedGradleProject(@TempDir Path projectRoot) throws IOException {
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
		Files.writeString(sourceRoot.resolve("OrderService.java"), """
			package com.example.order;

			public class OrderService {
				public String findOrder() {
					return "ok";
				}

				private void internalOnly() {
				}
			}
			""");
		Files.writeString(sourceRoot.resolve("ApiResponse.java"), """
			package com.example.order;

			public record ApiResponse(String value) {
			}
			""");

		InstrumentationProfileResponse profile = profileService.createProfile(new InstrumentationProfileRequest(
			projectRoot.toString(),
			"http://localhost:8091/",
			"/tmp/opentelemetry-javaagent.jar"
		));

		assertEquals("GRADLE", profile.buildTool());
		assertEquals("http://localhost:8091", profile.collectorEndpoint());
		assertTrue(profile.instrumentedClasses().contains("com.example.order.OrderController"));
		assertTrue(profile.instrumentedClasses().contains("com.example.order.OrderService"));
		assertFalse(profile.instrumentedClasses().contains("com.example.order.ApiResponse"));
		assertTrue(profile.methodsInclude().contains("com.example.order.OrderController[listOrders]"));
		assertTrue(profile.methodsInclude().contains("com.example.order.OrderService[findOrder]"));
		assertFalse(profile.methodsInclude().contains("internalOnly"));
		assertTrue(profile.commands().get("gradle").contains("./gradlew bootRun"));
		assertTrue(profile.commands().get("gradle").contains("-javaagent:/tmp/opentelemetry-javaagent.jar"));
		assertEquals("PROFILE_GENERATED", profile.connectionStatus().name());
		assertTrue(profile.profileId().matches("[0-9a-f-]{36}"));
		assertEquals(
			"stackflow.profile.id=" + profile.profileId(),
			profile.environment().get("OTEL_RESOURCE_ATTRIBUTES")
		);
		assertEquals(profile.createdAt(), profileRegistry.getStatus(profile.profileId()).orElseThrow().createdAt());
		assertEquals(null, profile.lastSeenAt());
	}

	@Test
	void detectsMavenProjectCommand(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("pom.xml"), "<project></project>");
		Path sourceRoot = projectRoot.resolve("src/main/java/com/example/report");
		Files.createDirectories(sourceRoot);
		Files.writeString(sourceRoot.resolve("ReportController.java"), """
			package com.example.report;

			import org.springframework.web.bind.annotation.GetMapping;
			import org.springframework.web.bind.annotation.RestController;

			@RestController
			public class ReportController {
				@GetMapping("/reports")
				public String reports() {
					return "ok";
				}
			}
			""");

		InstrumentationProfileResponse profile = profileService.createProfile(new InstrumentationProfileRequest(
			projectRoot.toString(),
			null,
			null
		));

		assertEquals("MAVEN", profile.buildTool());
		assertTrue(profile.commands().get("maven").contains("./mvnw spring-boot:run"));
		assertEquals("http://localhost:18080", profile.collectorEndpoint());
		assertEquals(
			Path.of(System.getProperty("user.home"), ".stackflow/agents/opentelemetry-javaagent.jar").toString(),
			profile.agentPath()
		);
		assertTrue(profile.commands().get("maven").contains(profile.agentPath()));
	}

	@Test
	void includesInstrumentedClassesFromEveryMultiModuleSourceRoot(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("build.gradle"), "plugins { id 'org.springframework.boot' version '4.1.0' }");
		Path rootSource = projectRoot.resolve("src/main/java/com/example/root");
		Path orderSource = projectRoot.resolve("orders/src/main/java/com/example/order");
		Files.createDirectories(rootSource);
		Files.createDirectories(orderSource);
		writeController(rootSource, "com.example.root", "Root", "/root");
		writeController(orderSource, "com.example.order", "Order", "/orders");
		writePublicClass(rootSource, "com.example.root", "RootService", "loadRoot");
		writePublicClass(orderSource, "com.example.order", "OrderService", "loadOrder");
		writePublicClass(rootSource, "com.example.root", "RootApplication", "main");
		writePublicClass(rootSource, "com.example.root", "RootConfig", "configure");
		Files.writeString(rootSource.resolve("RootResponse.java"), """
			package com.example.root;
			public record RootResponse(String value) {}
			""");

		InstrumentationProfileResponse profile = createProfile(projectRoot);

		assertEquals(List.of(
			"com.example.order.OrderController",
			"com.example.order.OrderService",
			"com.example.root.RootController",
			"com.example.root.RootService"
		), profile.instrumentedClasses());
		assertTrue(profile.methodsInclude().contains("com.example.order.OrderService[loadOrder]"));
		assertTrue(profile.methodsInclude().contains("com.example.root.RootService[loadRoot]"));
		assertFalse(profile.instrumentedClasses().contains("com.example.root.RootApplication"));
		assertFalse(profile.instrumentedClasses().contains("com.example.root.RootConfig"));
		assertFalse(profile.instrumentedClasses().contains("com.example.root.RootResponse"));
	}

	@Test
	void keepsSameSimpleClassNameWhenPackagesDiffer(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("settings.gradle"), "include 'sales', 'billing'");
		Path salesSource = projectRoot.resolve("sales/src/main/java/com/example/sales");
		Path billingSource = projectRoot.resolve("billing/src/main/java/com/example/billing");
		Files.createDirectories(salesSource);
		Files.createDirectories(billingSource);
		writeController(salesSource, "com.example.sales", "Sales", "/sales");
		writeController(billingSource, "com.example.billing", "Billing", "/billing");
		writePublicClass(salesSource, "com.example.sales", "SharedService", "loadSales");
		writePublicClass(billingSource, "com.example.billing", "SharedService", "loadBilling");

		InstrumentationProfileResponse profile = createProfile(projectRoot);

		assertTrue(profile.instrumentedClasses().contains("com.example.sales.SharedService"));
		assertTrue(profile.instrumentedClasses().contains("com.example.billing.SharedService"));
		assertTrue(profile.methodsInclude().contains("com.example.sales.SharedService[loadSales]"));
		assertTrue(profile.methodsInclude().contains("com.example.billing.SharedService[loadBilling]"));
	}

	@Test
	void mergesMethodsForDuplicateQualifiedClasses(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("settings.gradle"), "include 'orders-a', 'orders-b'");
		Path firstSource = projectRoot.resolve("orders-a/src/main/java/com/example/order");
		Path secondSource = projectRoot.resolve("orders-b/src/main/java/com/example/order");
		Files.createDirectories(firstSource);
		Files.createDirectories(secondSource);
		writeController(firstSource, "com.example.order", "Order", "/orders-a");
		writeController(secondSource, "com.example.order", "Order", "/orders-b");
		writePublicClass(firstSource, "com.example.order", "OrderService", "findOrder");
		writePublicClass(secondSource, "com.example.order", "OrderService", "listOrders");

		InstrumentationProfileResponse profile = createProfile(projectRoot);

		assertEquals(1, profile.instrumentedClasses().stream()
			.filter("com.example.order.OrderService"::equals)
			.count());
		assertTrue(profile.methodsInclude().contains(
			"com.example.order.OrderService[findOrder,listOrders]"
		));
	}

	@Test
	void rejectsInvalidAndEscapedSourceRoots(@TempDir Path tempRoot) throws IOException {
		Path projectRoot = tempRoot.resolve("project");
		Path validRoot = projectRoot.resolve("module/src/main/java");
		Path outsideModule = tempRoot.resolve("outside-module");
		Path outsideRoot = outsideModule.resolve("src/main/java");
		Files.createDirectories(validRoot);
		Files.createDirectories(outsideRoot);
		Files.createSymbolicLink(projectRoot.resolve("linked-module"), outsideModule);

		List<Path> sourceRoots = profileService.resolveSourceRoots(
			projectRoot,
			List.of(
				"module/src/main/java",
				"module/src/main/java",
				"missing/src/main/java",
				"../outside-module/src/main/java",
				"linked-module/src/main/java"
			),
			"src/main/java"
		);

		assertEquals(List.of(validRoot.toRealPath()), sourceRoots);
	}

	@Test
	void fallsBackToLegacySourceRootWhenCoverageRootsAreUnavailable(@TempDir Path projectRoot) throws IOException {
		Path sourceRoot = projectRoot.resolve("src/main/java");
		Files.createDirectories(sourceRoot);

		assertEquals(
			List.of(sourceRoot.toRealPath()),
			profileService.resolveSourceRoots(projectRoot, List.of("missing/src/main/java"), "src/main/java")
		);
	}

	private InstrumentationProfileResponse createProfile(Path projectRoot) {
		return profileService.createProfile(new InstrumentationProfileRequest(projectRoot.toString(), null, null));
	}

	private void writeController(Path sourceRoot, String packageName, String prefix, String path) throws IOException {
		Files.writeString(sourceRoot.resolve(prefix + "Controller.java"), """
			package %s;

			import org.springframework.web.bind.annotation.GetMapping;
			import org.springframework.web.bind.annotation.RestController;

			@RestController
			public class %sController {
				@GetMapping("%s")
				public String handle() { return "ok"; }
			}
			""".formatted(packageName, prefix, path));
	}

	private void writePublicClass(Path sourceRoot, String packageName, String className, String methodName) throws IOException {
		Files.writeString(sourceRoot.resolve(className + ".java"), """
			package %s;
			public class %s {
				public void %s() {}
			}
			""".formatted(packageName, className, methodName));
	}
}
