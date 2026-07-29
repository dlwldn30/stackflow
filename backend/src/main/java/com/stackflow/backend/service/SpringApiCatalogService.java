package com.stackflow.backend.service;

import com.stackflow.backend.dto.ApiCatalogItemResponse;
import com.stackflow.backend.dto.ProjectControllerResponse;
import com.stackflow.backend.dto.ProjectDomainResponse;
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
import java.util.stream.Stream;
import org.springframework.stereotype.Service;

@Service
public class SpringApiCatalogService {

	private static final Pattern CLASS_NAME_PATTERN = Pattern.compile("\\bclass\\s+(\\w+)");
	private static final Pattern METHOD_NAME_PATTERN = Pattern.compile("\\b(?:public|private|protected)\\s+[\\w<?>.,\\s]+\\s+(\\w+)\\s*\\(");
	private static final Pattern MAPPING_PATH_PATTERN = Pattern.compile("(?:value|path)\\s*=\\s*\"([^\"]*)\"|\"([^\"]*)\"");
	private static final Pattern REQUEST_METHOD_PATTERN = Pattern.compile("RequestMethod\\.(GET|POST|PUT|DELETE|PATCH)");
	private static final Pattern PATH_VARIABLE_PATTERN = Pattern.compile("\\{([^}/]+)}");

	public List<ApiCatalogItemResponse> getApiCatalog() {
		Path projectRoot = resolveProjectRoot(null);
		Path sourceRoot = resolveSourceRoot(projectRoot);
		if (!Files.exists(sourceRoot)) {
			return List.of();
		}

		try (Stream<Path> paths = Files.walk(sourceRoot)) {
			return paths
				.filter(path -> path.toString().endsWith(".java"))
				.flatMap(path -> scanController(path).stream())
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
			return emptyProjectStructure(projectRoot, detectFramework(projectRoot));
		}

		try (Stream<Path> paths = Files.walk(sourceRoot)) {
			List<Path> javaFiles = paths
				.filter(path -> path.toString().endsWith(".java"))
				.toList();
			List<ControllerScan> controllers = javaFiles.stream()
				.map(this::scanController)
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

			return new ProjectStructureResponse(
				resolveProjectName(projectRoot),
				detectFramework(projectRoot),
				detectInfrastructure(classes, endpoints),
				buildLayerSummary(classes),
				buildDomains(controllers, classes, endpoints)
			);
		} catch (IOException exception) {
			return emptyProjectStructure(projectRoot, detectFramework(projectRoot));
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

	private Optional<ControllerScan> scanController(Path javaFile) {
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

		String controller = extractClassName(source).orElse(javaFile.getFileName().toString().replace(".java", ""));
		if (isInternalController(controller)) {
			return Optional.empty();
		}

		String basePath = extractClassBasePath(source);
		String packageName = extractPackageName(source).orElse("");
		List<ApiCatalogItemResponse> catalog = new ArrayList<>();

		for (int index = 0; index < lines.size(); index += 1) {
			String line = lines.get(index).trim();
			Optional<MappingAnnotation> mapping = parseMappingAnnotation(line);
			if (mapping.isEmpty()) {
				continue;
			}

			Optional<String> handler = findNextHandlerName(lines, index + 1);
			if (handler.isEmpty()) {
				continue;
			}

			String path = normalizePath(basePath, mapping.get().path());
			List<String> pathVariables = extractPathVariables(path);
			catalog.add(new ApiCatalogItemResponse(
				buildId(mapping.get().method(), path, controller, handler.get()),
				mapping.get().method(),
				path,
				controller,
				handler.get(),
				classifyRequestType(mapping.get().method(), path, handler.get()),
				!pathVariables.isEmpty(),
				pathVariables
			));
		}

		return Optional.of(new ControllerScan(controller, packageName, basePath, List.copyOf(catalog)));
	}

	private boolean isInternalController(String controller) {
		return controller.equals("TraceController")
			|| controller.equals("ProjectAnalysisController")
			|| controller.equals("ExternalRequestController");
	}

	private boolean isRestControllerAnnotation(String line) {
		return line.equals("@RestController") || line.startsWith("@RestController(");
	}

	private Optional<String> extractClassName(String source) {
		Matcher matcher = CLASS_NAME_PATTERN.matcher(source);
		return matcher.find() ? Optional.of(matcher.group(1)) : Optional.empty();
	}

	private Optional<String> extractPackageName(String source) {
		Matcher matcher = Pattern.compile("\\bpackage\\s+([\\w.]+);").matcher(source);
		return matcher.find() ? Optional.of(matcher.group(1)) : Optional.empty();
	}

	private String extractClassBasePath(String source) {
		int classIndex = source.indexOf("class ");
		String classHeader = classIndex < 0 ? source : source.substring(0, classIndex);
		return findLastAnnotationPath(classHeader, "@RequestMapping").orElse("");
	}

	private Optional<MappingAnnotation> parseMappingAnnotation(String line) {
		if (!line.startsWith("@")) {
			return Optional.empty();
		}

		return parseShortcutMapping(line, "@GetMapping", "GET")
			.or(() -> parseShortcutMapping(line, "@PostMapping", "POST"))
			.or(() -> parseShortcutMapping(line, "@PutMapping", "PUT"))
			.or(() -> parseShortcutMapping(line, "@DeleteMapping", "DELETE"))
			.or(() -> parseShortcutMapping(line, "@PatchMapping", "PATCH"))
			.or(() -> parseRequestMapping(line));
	}

	private Optional<MappingAnnotation> parseShortcutMapping(String line, String annotation, String method) {
		if (!line.contains(annotation)) {
			return Optional.empty();
		}

		return Optional.of(new MappingAnnotation(method, extractAnnotationPath(line).orElse("")));
	}

	private Optional<MappingAnnotation> parseRequestMapping(String line) {
		if (!line.contains("@RequestMapping") || !line.contains("RequestMethod.")) {
			return Optional.empty();
		}

		Matcher methodMatcher = REQUEST_METHOD_PATTERN.matcher(line);
		if (!methodMatcher.find()) {
			return Optional.empty();
		}

		return Optional.of(new MappingAnnotation(methodMatcher.group(1), extractAnnotationPath(line).orElse("")));
	}

	private Optional<String> findLastAnnotationPath(String source, String annotation) {
		int index = source.lastIndexOf(annotation);
		if (index < 0) {
			return Optional.empty();
		}

		int endIndex = source.indexOf("\n", index);
		String annotationLine = endIndex < 0 ? source.substring(index) : source.substring(index, endIndex);
		return extractAnnotationPath(annotationLine);
	}

	private Optional<String> extractAnnotationPath(String annotationLine) {
		Matcher matcher = MAPPING_PATH_PATTERN.matcher(annotationLine);
		if (!matcher.find()) {
			return Optional.empty();
		}

		String namedPath = matcher.group(1);
		return Optional.of(namedPath == null ? matcher.group(2) : namedPath);
	}

	private Optional<String> findNextHandlerName(List<String> lines, int startIndex) {
		for (int index = startIndex; index < lines.size(); index += 1) {
			String line = lines.get(index).trim();
			Matcher matcher = METHOD_NAME_PATTERN.matcher(line);
			if (matcher.find()) {
				return Optional.of(matcher.group(1));
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

		Optional<String> className = extractClassName(source);
		if (className.isEmpty()) {
			return Optional.empty();
		}

		return Optional.of(new ClassMetadata(
			className.get(),
			extractPackageName(source).orElse(""),
			classifyLayerType(className.get())
		));
	}

	private String classifyLayerType(String className) {
		if (className.endsWith("Controller")) {
			return "Controller";
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

	private List<String> detectInfrastructure(List<ClassMetadata> classes, List<ApiCatalogItemResponse> endpoints) {
		List<String> infrastructure = new ArrayList<>();
		if (classes.stream().anyMatch(item -> item.name().contains("Cache")) ||
			endpoints.stream().anyMatch(item -> item.path().toLowerCase(Locale.ROOT).contains("cache"))) {
			infrastructure.add("Redis");
		}
		if (classes.stream().anyMatch(item -> item.name().contains("Repository") || item.name().contains("Store"))) {
			infrastructure.add("MySQL");
		}
		return infrastructure.isEmpty() ? List.of("In-memory") : List.copyOf(infrastructure);
	}

	private List<ProjectLayerResponse> buildLayerSummary(List<ClassMetadata> classes) {
		return classes.stream()
			.collect(LinkedHashMap<String, List<String>>::new, (map, item) ->
				map.computeIfAbsent(item.layerType(), key -> new ArrayList<>()).add(item.name()), Map::putAll)
			.entrySet()
			.stream()
			.sorted(Map.Entry.comparingByKey())
			.map(entry -> new ProjectLayerResponse(entry.getKey(), entry.getKey().toUpperCase(Locale.ROOT), entry.getValue().stream().sorted().toList()))
			.toList();
	}

	private List<ProjectDomainResponse> buildDomains(
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
			.map(entry -> buildDomain(entry.getKey(), entry.getValue(), classes, endpoints))
			.sorted(Comparator.comparing(ProjectDomainResponse::name))
			.toList();
	}

	private ProjectDomainResponse buildDomain(
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
		List<ClassMetadata> domainClasses = classes.stream()
			.filter(item -> toDomainKey(item.name()).equals(domainKey))
			.toList();

		return new ProjectDomainResponse(
			domainId,
			domainName,
			domainName + " domain request paths and runtime dependencies.",
			buildResponsibilities(domainEndpoints),
			detectInfrastructure(domainClasses, domainEndpoints),
			controllers.stream()
				.map(controller -> new ProjectControllerResponse(
					controller.controller(),
					controller.packageName(),
					controller.basePath(),
					controller.endpoints().size()
				))
				.toList(),
			buildLayerSummary(domainClasses),
			domainEndpoints
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
			.replaceAll("(Controller|RepositoryService|Repository|CacheService|CatalogStore|Service|Store|Response)$", "");
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

	private ProjectStructureResponse emptyProjectStructure(Path projectRoot, String framework) {
		return new ProjectStructureResponse(
			resolveProjectName(projectRoot),
			framework,
			List.of(),
			List.of(),
			List.of()
		);
	}

	private record MappingAnnotation(String method, String path) {
	}

	private record ControllerScan(
		String controller,
		String packageName,
		String basePath,
		List<ApiCatalogItemResponse> endpoints
	) {
	}

	private record ClassMetadata(String name, String packageName, String layerType) {
	}
}
