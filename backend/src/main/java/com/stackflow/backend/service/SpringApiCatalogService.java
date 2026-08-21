package com.stackflow.backend.service;

import com.stackflow.backend.dto.ApiCatalogItemResponse;
import com.stackflow.backend.dto.ProjectAnalysisStatus;
import com.stackflow.backend.dto.ProjectControllerResponse;
import com.stackflow.backend.dto.ProjectDomainResponse;
import com.stackflow.backend.dto.ProjectEvidenceItemResponse;
import com.stackflow.backend.dto.ProjectLayerResponse;
import com.stackflow.backend.dto.ProjectStructureResponse;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;

@Service
public class SpringApiCatalogService {

	private static final Pattern TYPE_NAME_PATTERN = Pattern.compile("\\b(?:class|interface|record|enum)\\s+(\\w+)");
	private static final Pattern TYPE_DECLARATION_PATTERN = Pattern.compile("\\b(?:class|interface|record|enum)\\s+\\w+");
	private static final Pattern METHOD_NAME_PATTERN = Pattern.compile("\\b(?:(?:public|private|protected)\\s+)?[\\w<?>.,\\s]+\\s+(\\w+)\\s*\\(");
	private static final Pattern PATH_VARIABLE_PATTERN = Pattern.compile("\\{([^}/]+)}");
	private static final List<String> PROJECT_METADATA_FILES = List.of(
		"build.gradle",
		"build.gradle.kts",
		"pom.xml",
		"src/main/resources/application.properties",
		"src/main/resources/application.yml",
		"src/main/resources/application.yaml",
		"backend/src/main/resources/application.properties",
		"backend/src/main/resources/application.yml",
		"backend/src/main/resources/application.yaml"
	);
	private final SpringMappingParser mappingParser = new SpringMappingParser();

	public List<ApiCatalogItemResponse> getApiCatalog() {
		Path projectRoot = resolveProjectRoot(null);
		Path sourceRoot = resolveSourceRoot(projectRoot);
		if (!Files.exists(sourceRoot)) {
			return List.of();
		}

		try (Stream<Path> paths = Files.walk(sourceRoot)) {
			return paths
				.filter(path -> path.toString().endsWith(".java"))
				.flatMap(path -> scanController(sourceRoot, path).stream())
				.flatMap(scan -> scan.endpoints().stream())
				.sorted(Comparator.comparing(ApiCatalogItemResponse::path).thenComparing(ApiCatalogItemResponse::method))
				.toList();
		} catch (IOException exception) {
			return List.of();
		}
	}

	public ProjectStructureResponse getProjectStructure() {
		return getProjectStructure(null);
	}

	public ProjectStructureResponse getProjectStructure(String projectPath) {
		Path projectRoot = resolveProjectRoot(projectPath);
		Path sourceRoot = resolveSourceRoot(projectRoot);
		if (!Files.exists(sourceRoot)) {
			return buildProjectStructure(
				projectRoot,
				sourceRoot,
				detectFramework(projectRoot),
				relativizeProjectPath(projectRoot, detectFrameworkEvidencePath(projectRoot)).orElse("No Gradle or Maven build file was detected."),
				ProjectAnalysisStatus.FAILED,
				"No Java source root was found under the provided project path."
			);
		}

		try (Stream<Path> paths = Files.walk(sourceRoot)) {
			List<Path> javaFiles = paths
				.filter(path -> path.toString().endsWith(".java"))
				.toList();
			if (javaFiles.isEmpty()) {
				return buildProjectStructure(
					projectRoot,
					sourceRoot,
					detectFramework(projectRoot),
					relativizeProjectPath(projectRoot, detectFrameworkEvidencePath(projectRoot)).orElse("No Gradle or Maven build file was detected."),
					ProjectAnalysisStatus.EMPTY,
					"No Java files were found in the detected source root."
				);
			}
			String framework = detectFramework(projectRoot);
			String frameworkEvidence = relativizeProjectPath(projectRoot, detectFrameworkEvidencePath(projectRoot))
				.orElse("No Gradle or Maven build file was detected.");
			List<ControllerScan> controllers = javaFiles.stream()
				.map(javaFile -> scanController(sourceRoot, javaFile))
				.flatMap(Optional::stream)
				.sorted(Comparator.comparing(ControllerScan::controller))
				.toList();
			List<ClassMetadata> classes = javaFiles.stream()
				.map(this::scanClassMetadata)
				.flatMap(Optional::stream)
				.toList();
			List<ApiCatalogItemResponse> endpoints = controllers.stream()
				.flatMap(controller -> controller.endpoints().stream())
				.sorted(Comparator.comparing(ApiCatalogItemResponse::path).thenComparing(ApiCatalogItemResponse::method))
				.toList();
			List<ProjectEvidenceItemResponse> infrastructureDetails = detectInfrastructureDetails(projectRoot, classes, endpoints);
			ProjectAnalysisStatus analysisStatus = endpoints.isEmpty()
				? ProjectAnalysisStatus.EMPTY
				: ProjectAnalysisStatus.SUCCESS;

			return buildProjectStructure(
				projectRoot,
				sourceRoot,
				resolveProjectName(projectRoot),
				framework,
				frameworkEvidence,
				analysisStatus,
				buildAnalysisMessage(projectRoot, analysisStatus, controllers.size(), endpoints.size(), sourceRoot),
				detectInfrastructure(infrastructureDetails),
				infrastructureDetails,
				buildLayerSummary(classes),
				buildDomains(projectRoot, controllers, classes, endpoints)
			);
		} catch (IOException exception) {
			return buildProjectStructure(
				projectRoot,
				sourceRoot,
				detectFramework(projectRoot),
				relativizeProjectPath(projectRoot, detectFrameworkEvidencePath(projectRoot)).orElse("No Gradle or Maven build file was detected."),
				ProjectAnalysisStatus.FAILED,
				"Project files could not be read for Spring analysis."
			);
		}
	}

	private Path resolveProjectRoot(String projectPath) {
		if (projectPath == null || projectPath.isBlank()) {
			return Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
		}

		return Path.of(projectPath).toAbsolutePath().normalize();
	}

	private Path resolveSourceRoot(Path projectRoot) {
		if (projectRoot.endsWith(Path.of("src/main/java")) && Files.exists(projectRoot)) {
			return projectRoot;
		}

		Path direct = projectRoot.resolve("src/main/java");
		if (Files.exists(direct)) {
			return direct;
		}

		return projectRoot.resolve("backend/src/main/java");
	}

	private Optional<ControllerScan> scanController(Path sourceRoot, Path javaFile) {
		String source;
		try {
			source = Files.readString(javaFile);
		} catch (IOException exception) {
			return Optional.empty();
		}

		List<String> lines = source.lines().toList();
		if (lines.stream().map(String::trim).noneMatch(this::isRestControllerAnnotation)) {
			return Optional.empty();
		}

		String controller = extractTypeName(source).orElse(javaFile.getFileName().toString().replace(".java", ""));
		if (isInternalController(controller)) {
			return Optional.empty();
		}

		String basePath = extractClassBasePath(source);
		String packageName = extractPackageName(source).orElse("");
		List<ApiCatalogItemResponse> catalog = new ArrayList<>();
		String sourceFile = relativizeSourcePath(sourceRoot, javaFile);
		int classDeclarationIndex = findClassDeclarationIndex(lines);

		for (int index = 0; index < lines.size(); index += 1) {
			String line = lines.get(index).trim();
			if (index < classDeclarationIndex) {
				continue;
			}
			if (!mappingParser.startsMappingAnnotation(line)) {
				continue;
			}

			SpringMappingParser.AnnotationBlock annotationBlock = mappingParser.collectAnnotationBlock(lines, index);
			List<SpringMappingParser.MappingAnnotation> mappings = mappingParser.parse(annotationBlock.content());
			if (mappings.isEmpty()) {
				continue;
			}

			Optional<HandlerMetadata> handler = findNextHandlerName(lines, annotationBlock.endIndex() + 1);
			if (handler.isEmpty()) {
				continue;
			}

			for (SpringMappingParser.MappingAnnotation mapping : mappings) {
				String path = normalizePath(basePath, mapping.path());
				List<String> pathVariables = extractPathVariables(path);
				catalog.add(new ApiCatalogItemResponse(
					buildId(mapping.method(), path, controller, handler.get().name()),
					mapping.method(),
					mapping.methodSpecified(),
					path,
					controller,
					handler.get().name(),
					classifyRequestType(mapping.method(), path, handler.get().name()),
					!pathVariables.isEmpty(),
					pathVariables,
					sourceFile,
					handler.get().lineNumber()
				));
			}
			index = annotationBlock.endIndex();
		}

		return Optional.of(new ControllerScan(controller, packageName, basePath, sourceFile, List.copyOf(catalog)));
	}

	private boolean isInternalController(String controller) {
		return controller.equals("TraceController")
			|| controller.equals("ProjectAnalysisController")
			|| controller.equals("ExternalRequestController");
	}

	private boolean isRestControllerAnnotation(String line) {
		return line.equals("@RestController") || line.startsWith("@RestController(");
	}

	private Optional<String> extractTypeName(String source) {
		Matcher matcher = TYPE_NAME_PATTERN.matcher(source);
		return matcher.find() ? Optional.of(matcher.group(1)) : Optional.empty();
	}

	private Optional<String> extractPackageName(String source) {
		Matcher matcher = Pattern.compile("\\bpackage\\s+([\\w.]+);").matcher(source);
		return matcher.find() ? Optional.of(matcher.group(1)) : Optional.empty();
	}

	private String extractClassBasePath(String source) {
		List<String> lines = source.lines().toList();
		int classDeclarationIndex = findClassDeclarationIndex(lines);
		for (int index = classDeclarationIndex - 1; index >= 0; index -= 1) {
			if (!lines.get(index).trim().startsWith("@RequestMapping")) {
				continue;
			}
			return mappingParser.extractPath(mappingParser.collectAnnotationBlock(lines, index).content()).orElse("");
		}
		return "";
	}

	private int findClassDeclarationIndex(List<String> lines) {
		for (int index = 0; index < lines.size(); index += 1) {
			if (TYPE_DECLARATION_PATTERN.matcher(lines.get(index)).find()) {
				return index;
			}
		}
		return 0;
	}

	private Optional<HandlerMetadata> findNextHandlerName(List<String> lines, int startIndex) {
		for (int index = startIndex; index < lines.size(); index += 1) {
			String line = lines.get(index).trim();
			Matcher matcher = METHOD_NAME_PATTERN.matcher(line);
			if (matcher.find()) {
				return Optional.of(new HandlerMetadata(matcher.group(1), index + 1));
			}

			if (line.startsWith("@")) {
				continue;
			}
		}

		return Optional.empty();
	}

	private String normalizePath(String basePath, String methodPath) {
		String normalizedBase = normalizePathSegment(basePath);
		String normalizedMethod = normalizePathSegment(methodPath);
		if (normalizedBase.equals("/")) {
			return normalizedMethod;
		}
		if (normalizedMethod.equals("/")) {
			return normalizedBase;
		}
		return normalizedBase + normalizedMethod;
	}

	private String normalizePathSegment(String path) {
		if (path == null || path.isBlank()) {
			return "/";
		}

		String normalized = path.trim();
		if (!normalized.startsWith("/")) {
			normalized = "/" + normalized;
		}
		if (normalized.length() > 1 && normalized.endsWith("/")) {
			normalized = normalized.substring(0, normalized.length() - 1);
		}
		return normalized;
	}

	private List<String> extractPathVariables(String path) {
		Matcher matcher = PATH_VARIABLE_PATTERN.matcher(path);
		List<String> variables = new ArrayList<>();
		while (matcher.find()) {
			variables.add(matcher.group(1));
		}
		return List.copyOf(variables);
	}

	private String buildId(String method, String path, String controller, String handler) {
		String normalizedPath = path.replaceAll("[^A-Za-z0-9]+", "-").replaceAll("(^-|-$)", "").toLowerCase(Locale.ROOT);
		return method.toLowerCase(Locale.ROOT) + "-" + normalizedPath + "-" + controller + "-" + handler;
	}

	private String classifyRequestType(String method, String path, String handler) {
		String lowerHandler = handler.toLowerCase(Locale.ROOT);
		String lowerPath = path.toLowerCase(Locale.ROOT);
		if (Set.of("POST", "PUT", "PATCH", "DELETE").contains(method)) {
			return lowerPath.contains("cache") || lowerHandler.contains("cache") ? "CACHE_WRITE" : "WRITE";
		}
		if (lowerHandler.contains("stock") || lowerPath.contains("stock")) {
			return "QUERY_STOCK";
		}
		if (lowerHandler.contains("list")) {
			return "QUERY_LIST";
		}
		return "QUERY_DETAIL";
	}

	private Optional<ClassMetadata> scanClassMetadata(Path javaFile) {
		String source;
		try {
			source = Files.readString(javaFile);
		} catch (IOException exception) {
			return Optional.empty();
		}

		Optional<String> typeName = extractTypeName(source);
		if (typeName.isEmpty()) {
			return Optional.empty();
		}

		return Optional.of(new ClassMetadata(
			typeName.get(),
			extractPackageName(source).orElse(""),
			classifyLayerType(typeName.get())
		));
	}

	private String classifyLayerType(String className) {
		if (className.endsWith("Controller")) {
			return "Controller";
		}
		if (className.endsWith("UseCase")) {
			return "UseCase";
		}
		if (className.endsWith("RepositoryService") || className.endsWith("Repository")) {
			return "Repository";
		}
		if (className.endsWith("CacheService")) {
			return "Cache";
		}
		if (className.endsWith("Store")) {
			return "Store";
		}
		if (className.endsWith("Gateway")) {
			return "Gateway";
		}
		if (className.endsWith("Client")) {
			return "Client";
		}
		if (className.endsWith("Service")) {
			return "Service";
		}
		if (className.endsWith("Application")) {
			return "Application";
		}
		if (className.endsWith("ExceptionHandler")) {
			return "Error Handling";
		}
		if (className.endsWith("Response")) {
			return "DTO";
		}
		return "Domain";
	}

	private List<ProjectEvidenceItemResponse> detectInfrastructureDetails(
		Path projectRoot,
		List<ClassMetadata> classes,
		List<ApiCatalogItemResponse> endpoints
	) {
		List<ProjectEvidenceItemResponse> infrastructure = new ArrayList<>();
		boolean hasCache = classes.stream().anyMatch(item -> item.name().contains("Cache"))
			|| endpoints.stream().anyMatch(item -> item.path().toLowerCase(Locale.ROOT).contains("cache"));
		boolean hasPersistence = classes.stream().anyMatch(item -> item.name().contains("Repository") || item.name().contains("Store"));
		boolean hasRedisEvidence = projectMetadataContains(projectRoot, "redis", "spring.data.redis", "lettuce", "jedis");
		boolean hasMysqlEvidence = projectMetadataContains(projectRoot, "mysql", "mariadb", "jdbc:mysql");

		if (hasCache) {
			String evidence = classes.stream()
				.filter(item -> item.name().contains("Cache"))
				.map(item -> item.name() + " (" + item.packageName() + ")")
				.findFirst()
				.orElse("Endpoint paths include cache operations.");
			infrastructure.add(new ProjectEvidenceItemResponse(
				hasRedisEvidence ? "Redis" : "Cache",
				hasRedisEvidence ? "project-config-and-class-name" : "class-name-and-path",
				evidence
			));
		}
		if (hasPersistence) {
			String evidence = classes.stream()
				.filter(item -> item.name().contains("Repository") || item.name().contains("Store"))
				.map(item -> item.name() + " (" + item.packageName() + ")")
				.findFirst()
				.orElse("Repository or store classes were detected.");
			infrastructure.add(new ProjectEvidenceItemResponse(
				hasMysqlEvidence ? "MySQL" : "Persistence",
				hasMysqlEvidence ? "project-config-and-class-name" : "class-name",
				evidence
			));
		}
		if (infrastructure.isEmpty()) {
			return List.of(new ProjectEvidenceItemResponse("In-memory", "fallback", "No cache or repository-style infrastructure classes were detected."));
		}
		return List.copyOf(infrastructure);
	}

	private List<String> detectInfrastructure(List<ProjectEvidenceItemResponse> infrastructureDetails) {
		return infrastructureDetails.stream()
			.map(ProjectEvidenceItemResponse::name)
			.toList();
	}

	private List<ProjectLayerResponse> buildLayerSummary(List<ClassMetadata> classes) {
		return classes.stream()
			.collect(LinkedHashMap<String, List<String>>::new, (map, item) ->
				map.computeIfAbsent(item.layerType(), key -> new ArrayList<>()).add(item.name()), Map::putAll)
			.entrySet()
			.stream()
			.sorted(Map.Entry.comparingByKey())
			.map(entry -> new ProjectLayerResponse(
				entry.getKey(),
				entry.getKey().toUpperCase(Locale.ROOT),
				entry.getValue().stream().sorted().toList(),
				buildLayerEvidence(entry.getKey(), classes)
			))
			.toList();
	}

	private List<ProjectDomainResponse> buildDomains(
		Path projectRoot,
		List<ControllerScan> controllers,
		List<ClassMetadata> classes,
		List<ApiCatalogItemResponse> endpoints
	) {
		Map<String, List<ControllerScan>> controllersByDomain = new LinkedHashMap<>();
		for (ControllerScan controller : controllers) {
			controllersByDomain
				.computeIfAbsent(toDomainKey(controller.controller()), key -> new ArrayList<>())
				.add(controller);
		}

		return controllersByDomain.entrySet().stream()
			.map(entry -> buildDomain(projectRoot, entry.getKey(), entry.getValue(), classes, endpoints))
			.sorted(Comparator.comparing(ProjectDomainResponse::name))
			.toList();
	}

	private ProjectDomainResponse buildDomain(
		Path projectRoot,
		String domainKey,
		List<ControllerScan> controllers,
		List<ClassMetadata> classes,
		List<ApiCatalogItemResponse> endpoints
	) {
		String domainName = humanizeDomain(domainKey);
		String domainId = domainKey.toLowerCase(Locale.ROOT);
		List<ApiCatalogItemResponse> domainEndpoints = endpoints.stream()
			.filter(endpoint -> controllers.stream().anyMatch(controller -> controller.controller().equals(endpoint.controller())))
			.toList();
		Set<String> domainControllerNames = controllers.stream()
			.map(ControllerScan::controller)
			.collect(Collectors.toSet());
		List<String> controllerPackageRoots = controllers.stream()
			.map(controller -> toDomainPackageRoot(controller.packageName()))
			.distinct()
			.toList();
		List<ClassMetadata> domainClasses = classes.stream()
			.filter(item -> belongsToDomain(domainKey, domainControllerNames, controllerPackageRoots, item))
			.toList();
		List<ProjectEvidenceItemResponse> domainInfrastructureDetails = detectInfrastructureDetails(projectRoot, domainClasses, domainEndpoints);

		return new ProjectDomainResponse(
			domainId,
			domainName,
			domainName + " domain request paths and runtime dependencies.",
			buildResponsibilities(domainEndpoints),
			detectInfrastructure(domainInfrastructureDetails),
			domainInfrastructureDetails,
			controllers.stream()
				.map(controller -> new ProjectControllerResponse(
					controller.controller(),
					controller.packageName(),
					controller.basePath(),
					controller.endpoints().size(),
					controller.sourceFile()
				))
				.toList(),
			buildLayerSummary(domainClasses),
			domainEndpoints,
			controllers.stream().map(ControllerScan::packageName).distinct().sorted().toList()
		);
	}

	private List<String> buildResponsibilities(List<ApiCatalogItemResponse> endpoints) {
		return endpoints.stream()
			.map(ApiCatalogItemResponse::requestType)
			.distinct()
			.sorted()
			.toList();
	}

	private String toDomainKey(String className) {
		return className
			.replaceAll("(Controller|UseCase|RepositoryService|Repository|CacheService|CatalogStore|Service|Store|Gateway|Client|Response)$", "");
	}

	private boolean belongsToDomain(
		String domainKey,
		Set<String> domainControllerNames,
		List<String> packageRoots,
		ClassMetadata item
	) {
		if (toDomainKey(item.name()).equals(domainKey)) {
			return true;
		}
		if (!belongsToAnyPackageRoot(item.packageName(), packageRoots)) {
			return false;
		}
		return !item.layerType().equals("Controller") || domainControllerNames.contains(item.name());
	}

	private String toDomainPackageRoot(String packageName) {
		if (packageName.endsWith(".controller")) {
			return packageName.substring(0, packageName.length() - ".controller".length());
		}
		return packageName;
	}

	private boolean belongsToAnyPackageRoot(String packageName, List<String> packageRoots) {
		return packageRoots.stream().anyMatch(root -> packageName.equals(root) || packageName.startsWith(root + "."));
	}

	private String humanizeDomain(String domainKey) {
		return domainKey.replaceAll("([a-z])([A-Z])", "$1 $2");
	}

	private String resolveProjectName(Path projectRoot) {
		Path fileName = projectRoot.getFileName();
		if (fileName == null) {
			return "Unknown project";
		}
		return fileName.toString();
	}

	private String detectFramework(Path projectRoot) {
		if (Files.exists(projectRoot.resolve("build.gradle")) || Files.exists(projectRoot.resolve("build.gradle.kts"))) {
			return "Spring Boot + Gradle";
		}
		if (Files.exists(projectRoot.resolve("pom.xml"))) {
			return "Spring Boot + Maven";
		}
		if (Files.exists(projectRoot.resolve("backend/build.gradle")) || Files.exists(projectRoot.resolve("backend/build.gradle.kts"))) {
			return "Spring Boot + Gradle";
		}
		if (Files.exists(projectRoot.resolve("backend/pom.xml"))) {
			return "Spring Boot + Maven";
		}
		return "Spring Boot";
	}

	private Optional<Path> detectFrameworkEvidencePath(Path projectRoot) {
		for (String candidate : List.of(
			"build.gradle",
			"build.gradle.kts",
			"pom.xml",
			"backend/build.gradle",
			"backend/build.gradle.kts",
			"backend/pom.xml"
		)) {
			Path path = projectRoot.resolve(candidate);
			if (Files.exists(path)) {
				return Optional.of(path);
			}
		}
		return Optional.empty();
	}

	private String buildAnalysisMessage(
		Path projectRoot,
		ProjectAnalysisStatus analysisStatus,
		int controllerCount,
		int endpointCount,
		Path sourceRoot
	) {
		String displaySourceRoot = relativizeSourceRoot(projectRoot, sourceRoot);
		if (analysisStatus == ProjectAnalysisStatus.EMPTY) {
			return "Project files were read, but no REST API mappings were detected under " + displaySourceRoot + ".";
		}
		return "Detected " + controllerCount + " controller classes and " + endpointCount + " API mappings under " + displaySourceRoot + ".";
	}

	private String buildLayerEvidence(String layerName, List<ClassMetadata> classes) {
		return classes.stream()
			.filter(item -> item.layerType().equals(layerName))
			.map(item -> item.name() + " (" + item.packageName() + ")")
			.findFirst()
			.orElse("No supporting class evidence was found.");
	}

	private ProjectStructureResponse buildProjectStructure(
		Path projectRoot,
		Path sourceRoot,
		String framework,
		String frameworkEvidence,
		ProjectAnalysisStatus analysisStatus,
		String message
	) {
		return buildProjectStructure(
			projectRoot,
			sourceRoot,
			resolveProjectName(projectRoot),
			framework,
			frameworkEvidence,
			analysisStatus,
			message,
			List.of(),
			List.of(),
			List.of(),
			List.of()
		);
	}

	private ProjectStructureResponse buildProjectStructure(
		Path projectRoot,
		Path sourceRoot,
		String projectName,
		String framework,
		String frameworkEvidence,
		ProjectAnalysisStatus analysisStatus,
		String message,
		List<String> infrastructure,
		List<ProjectEvidenceItemResponse> infrastructureDetails,
		List<ProjectLayerResponse> layers,
		List<ProjectDomainResponse> domains
	) {
		return new ProjectStructureResponse(
			projectName,
			framework,
			frameworkEvidence,
			analysisStatus,
			relativizeSourceRoot(projectRoot, sourceRoot),
			message,
			infrastructure,
			infrastructureDetails,
			layers,
			domains
		);
	}

	private String relativizeSourcePath(Path sourceRoot, Path filePath) {
		try {
			return sourceRoot.toAbsolutePath().normalize().relativize(filePath.toAbsolutePath().normalize()).toString();
		} catch (IllegalArgumentException exception) {
			return filePath.getFileName().toString();
		}
	}

	private String relativizeSourceRoot(Path projectRoot, Path sourceRoot) {
		if (projectRoot.equals(sourceRoot)) {
			return "src/main/java";
		}
		return relativizeProjectPath(projectRoot, sourceRoot).orElse(sourceRoot.getFileName().toString());
	}

	private Optional<String> relativizeProjectPath(Path projectRoot, Optional<Path> targetPath) {
		return targetPath.flatMap(path -> relativizeProjectPath(projectRoot, path));
	}

	private Optional<String> relativizeProjectPath(Path projectRoot, Path targetPath) {
		try {
			return Optional.of(projectRoot.toAbsolutePath().normalize().relativize(targetPath.toAbsolutePath().normalize()).toString());
		} catch (IllegalArgumentException exception) {
			return Optional.empty();
		}
	}

	private boolean projectMetadataContains(Path projectRoot, String... tokens) {
		for (String metadataFile : PROJECT_METADATA_FILES) {
			Path filePath = projectRoot.resolve(metadataFile);
			if (!Files.exists(filePath)) {
				continue;
			}
			try {
				String content = Files.readString(filePath).toLowerCase(Locale.ROOT);
				for (String token : tokens) {
					if (content.contains(token.toLowerCase(Locale.ROOT))) {
						return true;
					}
				}
			} catch (IOException exception) {
				// Ignore unreadable metadata files and continue with the remaining evidence sources.
			}
		}
		return false;
	}

	private record ControllerScan(
		String controller,
		String packageName,
		String basePath,
		String sourceFile,
		List<ApiCatalogItemResponse> endpoints
	) {
	}

	private record ClassMetadata(String name, String packageName, String layerType) {
	}

	private record HandlerMetadata(String name, int lineNumber) {
	}

}
