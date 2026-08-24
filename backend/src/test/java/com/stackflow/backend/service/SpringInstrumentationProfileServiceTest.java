package com.stackflow.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.stackflow.backend.dto.InstrumentationProfileRequest;
import com.stackflow.backend.dto.InstrumentationProfileResponse;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
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
}
