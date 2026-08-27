package com.stackflow.backend.service;

import com.stackflow.backend.dto.InstrumentationProfileRequest;
import com.stackflow.backend.dto.InstrumentationProfileResponse;
import com.stackflow.backend.dto.WorkspaceAnalysisResponse;
import com.stackflow.backend.dto.WorkspaceInstrumentationProfileRequest;
import com.stackflow.backend.dto.WorkspaceInstrumentationProfileResponse;
import com.stackflow.backend.dto.WorkspaceServiceAnalysisResponse;
import com.stackflow.backend.dto.WorkspaceServiceProfileResponse;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;

@Service
public class SpringWorkspaceService {

	private static final int MAX_SERVICES = 10;
	private static final int MAX_SOURCE_DEPTH = 12;
	private static final List<String> BUILD_MARKERS = List.of(
		"settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts", "pom.xml", "gradlew", "mvnw"
	);

	private final SpringApiCatalogService catalogService;
	private final SpringInstrumentationProfileService profileService;

	public SpringWorkspaceService(
		SpringApiCatalogService catalogService,
		SpringInstrumentationProfileService profileService
	) {
		this.catalogService = catalogService;
		this.profileService = profileService;
	}

	public WorkspaceAnalysisResponse analyze(String workspacePath) {
		Workspace workspace = discover(workspacePath);
		List<WorkspaceServiceAnalysisResponse> services = workspace.projects().stream()
			.map(project -> new WorkspaceServiceAnalysisResponse(
				project.serviceId(),
				project.relativePath(),
				catalogService.getProjectStructure(project.path().toString())
			))
			.toList();
		return new WorkspaceAnalysisResponse(workspace.name(), services, workspace.warnings());
	}

	public WorkspaceInstrumentationProfileResponse createProfiles(WorkspaceInstrumentationProfileRequest request) {
		Workspace workspace = discover(request.workspacePath());
		List<ServiceProject> projects = workspace.projects();
		Set<String> serviceNames = new HashSet<>();
		for (ServiceProject project : projects) {
			String projectName = catalogService.getProjectStructure(project.path().toString()).projectName();
			String serviceName = SpringInstrumentationProfileService.normalizeServiceName(projectName);
			if (!serviceNames.add(serviceName)) {
				throw new IllegalArgumentException(
					"Workspace projects resolve to the same service name: " + serviceName
				);
			}
		}

		List<WorkspaceServiceProfileResponse> profiles = projects.stream().map(project -> {
			InstrumentationProfileResponse profile = profileService.createProfile(new InstrumentationProfileRequest(
				project.path().toString(),
				request.collectorBaseUrl(),
				request.agentPath()
			));
			return new WorkspaceServiceProfileResponse(
				project.serviceId(),
				project.relativePath(),
				project.path().toString(),
				profile
			);
		}).toList();
		return new WorkspaceInstrumentationProfileResponse(workspace.name(), profiles);
	}

	Workspace discover(String workspacePath) {
		Path workspaceRoot = resolveWorkspaceRoot(workspacePath);
		Path realWorkspaceRoot;
		try {
			realWorkspaceRoot = workspaceRoot.toRealPath();
		} catch (IOException exception) {
			throw new IllegalArgumentException("workspacePath must point to a readable directory.", exception);
		}

		List<String> warnings = new ArrayList<>();
		List<Path> projects;
		if (hasBuildMarker(workspaceRoot) && hasJavaSourceRoot(workspaceRoot)) {
			projects = List.of(workspaceRoot);
		} else {
			projects = discoverChildProjects(workspaceRoot, realWorkspaceRoot, warnings);
		}
		if (projects.isEmpty()) {
			throw new IllegalArgumentException("No Spring Java projects were found in the workspace.");
		}
		if (projects.size() > MAX_SERVICES) {
			throw new IllegalArgumentException("A workspace can contain at most " + MAX_SERVICES + " services.");
		}

		List<ServiceProject> serviceProjects = projects.stream()
			.sorted()
			.map(path -> toServiceProject(workspaceRoot, path))
			.toList();
		String workspaceName = workspaceRoot.getFileName() == null
			? "workspace"
			: workspaceRoot.getFileName().toString();
		return new Workspace(workspaceName, serviceProjects, List.copyOf(warnings));
	}

	private List<Path> discoverChildProjects(Path workspaceRoot, Path realWorkspaceRoot, List<String> warnings) {
		try (Stream<Path> children = Files.list(workspaceRoot)) {
			return children
				.filter(path -> Files.isDirectory(path) || Files.isSymbolicLink(path))
				.map(path -> validateChildProject(path, realWorkspaceRoot, warnings))
				.flatMap(java.util.Optional::stream)
				.filter(this::hasBuildMarker)
				.filter(this::hasJavaSourceRoot)
				.sorted()
				.toList();
		} catch (IOException exception) {
			throw new IllegalArgumentException("Workspace entries could not be read.", exception);
		}
	}

	private java.util.Optional<Path> validateChildProject(
		Path candidate,
		Path realWorkspaceRoot,
		List<String> warnings
	) {
		try {
			Path realCandidate = candidate.toRealPath();
			if (!realCandidate.startsWith(realWorkspaceRoot)) {
				warnings.add(candidate.getFileName() + " was ignored because it resolves outside the workspace.");
				return java.util.Optional.empty();
			}
			return java.util.Optional.of(realCandidate);
		} catch (IOException | SecurityException exception) {
			warnings.add(candidate.getFileName() + " was ignored because it could not be read.");
			return java.util.Optional.empty();
		}
	}

	private boolean hasBuildMarker(Path projectRoot) {
		return BUILD_MARKERS.stream().anyMatch(marker -> Files.isRegularFile(projectRoot.resolve(marker)));
	}

	private boolean hasJavaSourceRoot(Path projectRoot) {
		try (Stream<Path> paths = Files.find(
			projectRoot,
			MAX_SOURCE_DEPTH,
			(path, attributes) -> attributes.isDirectory() && path.endsWith(Path.of("src/main/java"))
		)) {
			return paths.findAny().isPresent();
		} catch (IOException | SecurityException exception) {
			return false;
		}
	}

	private ServiceProject toServiceProject(Path workspaceRoot, Path projectPath) {
		String relativePath = projectPath.equals(workspaceRoot)
			? "."
			: workspaceRoot.relativize(projectPath).toString();
		String rawId = projectPath.getFileName() == null ? "service" : projectPath.getFileName().toString();
		String serviceId = rawId.toLowerCase(Locale.ROOT)
			.replaceAll("[^a-z0-9._-]+", "-")
			.replaceAll("^-+|-+$", "");
		return new ServiceProject(serviceId.isBlank() ? "service" : serviceId, relativePath, projectPath);
	}

	private Path resolveWorkspaceRoot(String workspacePath) {
		if (workspacePath == null || workspacePath.isBlank()) {
			throw new IllegalArgumentException("workspacePath is required.");
		}
		try {
			Path root = Path.of(workspacePath.trim()).toAbsolutePath().normalize();
			if (!Files.isDirectory(root)) {
				throw new IllegalArgumentException("workspacePath must point to an existing directory.");
			}
			return root;
		} catch (InvalidPathException exception) {
			throw new IllegalArgumentException("workspacePath is invalid.", exception);
		}
	}

	record Workspace(String name, List<ServiceProject> projects, List<String> warnings) {
	}

	record ServiceProject(String serviceId, String relativePath, Path path) {
	}
}
