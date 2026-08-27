package com.stackflow.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.stackflow.backend.dto.WorkspaceAnalysisResponse;
import com.stackflow.backend.dto.WorkspaceInstrumentationProfileRequest;
import com.stackflow.backend.dto.WorkspaceInstrumentationProfileResponse;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SpringWorkspaceServiceTest {

	private final SpringApiCatalogService catalogService = new SpringApiCatalogService();
	private final SpringInstrumentationProfileService profileService = new SpringInstrumentationProfileService(
		catalogService,
		new InstrumentationProfileRegistry()
	);
	private final SpringWorkspaceService workspaceService = new SpringWorkspaceService(catalogService, profileService);

	@Test
	void analyzesIndependentProjectsAndCreatesProfiles(@TempDir Path workspaceRoot) throws IOException {
		writeProject(workspaceRoot.resolve("order-service"), "Order", "/orders");
		writeProject(workspaceRoot.resolve("product-service"), "Product", "/products");

		WorkspaceAnalysisResponse analysis = workspaceService.analyze(workspaceRoot.toString());
		WorkspaceInstrumentationProfileResponse profiles = workspaceService.createProfiles(
			new WorkspaceInstrumentationProfileRequest(
				workspaceRoot.toString(),
				"http://localhost:18080",
				"/tmp/opentelemetry-javaagent.jar"
			)
		);

		assertEquals("order-service", analysis.services().getFirst().serviceId());
		assertEquals("product-service", analysis.services().get(1).serviceId());
		assertEquals(1, analysis.services().getFirst().structure().analysisCoverage().detectedEndpoints());
		assertEquals(2, profiles.profiles().size());
		assertTrue(profiles.profiles().getFirst().workingDirectory().endsWith("order-service"));
		assertTrue(profiles.profiles().getFirst().profile().instrumentedClasses().stream()
			.anyMatch(name -> name.endsWith("OrderController")));
	}

	@Test
	void fallsBackToOneProjectWhenWorkspaceItselfIsSpringProject(@TempDir Path projectRoot) throws IOException {
		writeProject(projectRoot, "Catalog", "/catalog");

		WorkspaceAnalysisResponse analysis = workspaceService.analyze(projectRoot.toString());

		assertEquals(1, analysis.services().size());
		assertEquals(".", analysis.services().getFirst().relativePath());
	}

	@Test
	void keepsAnExistingMultiModuleBuildAsOneService(@TempDir Path projectRoot) throws IOException {
		Files.writeString(projectRoot.resolve("settings.gradle"), "include 'orders', 'billing'");
		writeProject(projectRoot.resolve("orders"), "Order", "/orders");
		writeProject(projectRoot.resolve("billing"), "Billing", "/billing");

		WorkspaceAnalysisResponse analysis = workspaceService.analyze(projectRoot.toString());

		assertEquals(1, analysis.services().size());
		assertEquals(".", analysis.services().getFirst().relativePath());
		assertEquals(2, analysis.services().getFirst().structure().analysisCoverage().detectedEndpoints());
	}

	@Test
	void ignoresChildSymlinkThatEscapesWorkspace(@TempDir Path tempRoot) throws IOException {
		Path workspaceRoot = tempRoot.resolve("workspace");
		Path outsideProject = tempRoot.resolve("outside-service");
		Files.createDirectories(workspaceRoot);
		writeProject(workspaceRoot.resolve("order-service"), "Order", "/orders");
		writeProject(outsideProject, "Outside", "/outside");
		Files.createSymbolicLink(workspaceRoot.resolve("outside-link"), outsideProject);

		WorkspaceAnalysisResponse analysis = workspaceService.analyze(workspaceRoot.toString());

		assertEquals(1, analysis.services().size());
		assertEquals(1, analysis.warnings().size());
		assertTrue(analysis.warnings().getFirst().contains("outside-link"));
	}

	@Test
	void rejectsMoreThanTenServices(@TempDir Path workspaceRoot) throws IOException {
		for (int index = 0; index < 11; index++) {
			writeProject(workspaceRoot.resolve("service-" + index), "Domain" + index, "/items-" + index);
		}

		IllegalArgumentException exception = assertThrows(
			IllegalArgumentException.class,
			() -> workspaceService.analyze(workspaceRoot.toString())
		);

		assertTrue(exception.getMessage().contains("at most 10"));
	}

	@Test
	void rejectsProfilesWithDuplicateNormalizedServiceNames(@TempDir Path workspaceRoot) throws IOException {
		writeProject(workspaceRoot.resolve("order service"), "First", "/first");
		writeProject(workspaceRoot.resolve("order-service"), "Second", "/second");

		IllegalArgumentException exception = assertThrows(
			IllegalArgumentException.class,
			() -> workspaceService.createProfiles(new WorkspaceInstrumentationProfileRequest(
				workspaceRoot.toString(), null, null
			))
		);

		assertTrue(exception.getMessage().contains("same service name"));
	}

	private void writeProject(Path projectRoot, String domain, String mapping) throws IOException {
		Files.createDirectories(projectRoot);
		Files.writeString(projectRoot.resolve("settings.gradle"), "rootProject.name = '" + domain.toLowerCase() + "'");
		Files.writeString(projectRoot.resolve("build.gradle"), "plugins { id 'org.springframework.boot' version '4.1.0' }");
		Path packageRoot = projectRoot.resolve("src/main/java/com/example/" + domain.toLowerCase());
		Files.createDirectories(packageRoot);
		Files.writeString(packageRoot.resolve(domain + "Controller.java"), """
			package com.example.%s;
			import org.springframework.web.bind.annotation.GetMapping;
			import org.springframework.web.bind.annotation.RestController;
			@RestController
			public class %sController {
				@GetMapping("%s")
				public String find() { return "ok"; }
			}
			""".formatted(domain.toLowerCase(), domain, mapping));
	}
}
