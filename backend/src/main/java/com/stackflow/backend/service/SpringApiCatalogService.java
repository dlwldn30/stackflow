package com.stackflow.backend.service;

import com.stackflow.backend.dto.ApiCatalogItemResponse;
import com.stackflow.backend.dto.AnalysisCoverageResponse;
import com.stackflow.backend.dto.ProjectAnalysisStatus;
import com.stackflow.backend.dto.ProjectControllerResponse;
import com.stackflow.backend.dto.ProjectDomainResponse;
import com.stackflow.backend.dto.ProjectEvidenceItemResponse;
import com.stackflow.backend.dto.ProjectLayerResponse;
import com.stackflow.backend.dto.ProjectStructureResponse;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.FileVisitResult;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Arrays;
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
	private static final Pattern UNSUPPORTED_MAPPING_PATTERN = Pattern.compile("@(\\w*Mapping)\\b");
	private static final int MAX_SOURCE_ROOT_DEPTH = 12;
	private static final int MAX_JAVA_FILES = 20_000;
	private static final Set<String> EXCLUDED_DIRECTORIES = Set.of(".git", "build", "target", "out", "node_modules");
	private static final Set<String> SUPPORTED_MAPPING_ANNOTATIONS = Set.of(
		"RequestMapping", "GetMapping", "PostMapping", "PutMapping", "DeleteMapping", "PatchMapping"
	);
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
		List<Path> sourceRoots = discoverSourceRoots(projectRoot);
		if (sourceRoots.isEmpty()) {
			return List.of();
		}

		try {
			return collectJavaFiles(sourceRoots).files().stream()
				.flatMap(path -> scanController(findSourceRoot(sourceRoots, path), path).stream())
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
		List<Path> sourceRoots = discoverSourceRoots(projectRoot);
		if (sourceRoots.isEmpty()) {
			AnalysisCoverageResponse coverage = new AnalysisCoverageResponse(
				List.of(), 0, 0, 0, 0, discoverUnsupportedSourceWarnings(projectRoot)
			);
			return buildProjectStructure(
				projectRoot,
				null,
				detectFramework(projectRoot),
				relativizeProjectPath(projectRoot, detectFrameworkEvidencePath(projectRoot)).orElse("No Gradle or Maven build file was detected."),
				ProjectAnalysisStatus.FAILED,
				"No Java source root was found under the provided project path.",
				coverage
			);
		}

		Path primarySourceRoot = sourceRoots.getFirst();
		try {
			JavaFileCollection javaFileCollection = collectJavaFiles(sourceRoots);
			List<Path> javaFiles = javaFileCollection.files();
			if (javaFiles.isEmpty()) {
				AnalysisCoverageResponse coverage = buildCoverage(
					projectRoot, sourceRoots, javaFiles, List.of(), List.of(), javaFileCollection.limitReached()
				);
				return buildProjectStructure(
					projectRoot,
					primarySourceRoot,
					detectFramework(projectRoot),
					relativizeProjectPath(projectRoot, detectFrameworkEvidencePath(projectRoot)).orElse("No Gradle or Maven build file was detected."),
					ProjectAnalysisStatus.EMPTY,
					"No Java files were found in the detected source roots.",
					coverage
				);
			}
			String framework = detectFramework(projectRoot);
			String frameworkEvidence = relativizeProjectPath(projectRoot, detectFrameworkEvidencePath(projectRoot))
				.orElse("No Gradle or Maven build file was detected.");
			List<ControllerScan> controllers = javaFiles.stream()
				.map(javaFile -> scanController(findSourceRoot(sourceRoots, javaFile), javaFile))
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
			AnalysisCoverageResponse coverage = buildCoverage(
				projectRoot, sourceRoots, javaFiles, controllers, endpoints, javaFileCollection.limitReached()
			);

			return buildProjectStructure(
				projectRoot,
				primarySourceRoot,
				resolveProjectName(projectRoot),
				framework,
				frameworkEvidence,
				analysisStatus,
				buildAnalysisMessage(analysisStatus, controllers.size(), endpoints.size(), coverage.sourceRoots()),
				coverage,
				detectInfrastructure(infrastructureDetails),
				infrastructureDetails,
				buildLayerSummary(classes),
				buildDomains(projectRoot, controllers, classes, endpoints)
			);
		} catch (IOException exception) {
			AnalysisCoverageResponse coverage = new AnalysisCoverageResponse(
				sourceRoots.stream().map(root -> relativizeSourceRoot(projectRoot, root)).toList(),
				0, 0, 0, 0, List.of("일부 프로젝트 파일을 읽지 못해 분석이 중단되었습니다.")
			);
			return buildProjectStructure(
				projectRoot,
				primarySourceRoot,
				detectFramework(projectRoot),
				relativizeProjectPath(projectRoot, detectFrameworkEvidencePath(projectRoot)).orElse("No Gradle or Maven build file was detected."),
				ProjectAnalysisStatus.FAILED,
				"Project files could not be read for Spring analysis.",
				coverage
			);
		}
	}

	private Path resolveProjectRoot(String projectPath) {
		if (projectPath == null || projectPath.isBlank()) {
			return Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
		}

		return Path.of(projectPath).toAbsolutePath().normalize();
	}

	private List<Path> discoverSourceRoots(Path projectRoot) {
		if (!Files.isDirectory(projectRoot)) {
			return List.of();
		}
		if (projectRoot.endsWith(Path.of("src/main/java"))) {
			return List.of(projectRoot);
		}

		List<Path> roots = new ArrayList<>();
		try {
			Files.walkFileTree(projectRoot, Set.of(), MAX_SOURCE_ROOT_DEPTH, new SimpleFileVisitor<>() {
				@Override
				public FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attributes) {
					if (!directory.equals(projectRoot) && isExcludedDirectory(directory)) {
						return FileVisitResult.SKIP_SUBTREE;
					}
					if (directory.endsWith(Path.of("src/main/java"))) {
						roots.add(directory);
						return FileVisitResult.SKIP_SUBTREE;
					}
					return FileVisitResult.CONTINUE;
				}
			});
		} catch (IOException exception) {
			return List.of();
		}
		return roots.stream().sorted().toList();
	}

	private boolean isExcludedDirectory(Path directory) {
		Path fileName = directory.getFileName();
		return fileName != null && EXCLUDED_DIRECTORIES.contains(fileName.toString());
	}

	private JavaFileCollection collectJavaFiles(List<Path> sourceRoots) throws IOException {
		List<Path> files = new ArrayList<>();
		boolean limitReached = false;
		for (Path sourceRoot : sourceRoots) {
			int remaining = MAX_JAVA_FILES - files.size();
			if (remaining == 0) {
				limitReached = true;
				break;
			}
			try (Stream<Path> paths = Files.walk(sourceRoot)) {
				List<Path> sourceFiles = paths
					.filter(Files::isRegularFile)
					.filter(path -> path.toString().endsWith(".java"))
					.sorted()
					.limit(remaining + 1L)
					.toList();
				files.addAll(sourceFiles.stream().limit(remaining).toList());
				if (sourceFiles.size() > remaining) {
					limitReached = true;
					break;
				}
			}
		}
		return new JavaFileCollection(List.copyOf(files), limitReached);
	}

	private Path findSourceRoot(List<Path> sourceRoots, Path javaFile) {
		return sourceRoots.stream()
			.filter(javaFile::startsWith)
			.max(Comparator.comparingInt(Path::getNameCount))
			.orElse(javaFile.getParent());
	}

	private Optional<ControllerScan> scanController(Path sourceRoot, Path javaFile) {
		String source;
		try {
			source = Files.readString(javaFile);
		} catch (IOException exception) {
			return Optional.empty();
		}

		List<String> lines = source.lines().toList();
		int classDeclarationIndex = findClassDeclarationIndex(lines);
		ControllerMode controllerMode = detectControllerMode(lines, classDeclarationIndex);
		if (controllerMode == ControllerMode.NONE) {
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
			boolean methodResponseBody = hasResponseBodyBeforeMapping(lines, index, classDeclarationIndex)
				|| handler.map(HandlerMetadata::responseBody).orElse(false);
			if (handler.isEmpty() || (controllerMode == ControllerMode.METHOD_RESPONSE_BODY && !methodResponseBody)) {
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
			|| controller.equals("ExternalRequestController")
			|| controller.equals("InstrumentationController")
			|| controller.equals("OtlpTraceIngestController");
	}

	private boolean isRestControllerAnnotation(String line) {
		return line.equals("@RestController") || line.startsWith("@RestController(");
	}

	private boolean isControllerAnnotation(String line) {
		return line.equals("@Controller") || line.startsWith("@Controller(");
	}

	private boolean isResponseBodyAnnotation(String line) {
		return line.equals("@ResponseBody") || line.startsWith("@ResponseBody(");
	}

	private ControllerMode detectControllerMode(List<String> lines, int classDeclarationIndex) {
		List<String> classAnnotations = lines.subList(0, Math.min(classDeclarationIndex, lines.size())).stream()
			.map(String::trim)
			.toList();
		if (classAnnotations.stream().anyMatch(this::isRestControllerAnnotation)) {
			return ControllerMode.REST;
		}
		if (classAnnotations.stream().noneMatch(this::isControllerAnnotation)) {
			return ControllerMode.NONE;
		}
		return classAnnotations.stream().anyMatch(this::isResponseBodyAnnotation)
			? ControllerMode.REST
			: ControllerMode.METHOD_RESPONSE_BODY;
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
		boolean responseBody = false;
		for (int index = startIndex; index < lines.size(); index += 1) {
			String line = lines.get(index).trim();
			responseBody = responseBody || isResponseBodyAnnotation(line);
			Matcher matcher = METHOD_NAME_PATTERN.matcher(line);
			if (matcher.find()) {
				return Optional.of(new HandlerMetadata(matcher.group(1), index + 1, responseBody));
			}

			if (line.startsWith("@")) {
				continue;
			}
		}

		return Optional.empty();
	}

	private boolean hasResponseBodyBeforeMapping(List<String> lines, int mappingIndex, int classDeclarationIndex) {
		for (int index = mappingIndex - 1; index > classDeclarationIndex; index -= 1) {
			String line = lines.get(index).trim();
			if (line.isBlank()) {
				continue;
			}
			if (isResponseBodyAnnotation(line)) {
				return true;
			}
			if (!line.startsWith("@")) {
				return false;
			}
		}
		return false;
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
		boolean hasPostgresqlEvidence = projectMetadataContains(projectRoot, "postgresql", "jdbc:postgresql", "org.postgresql");
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
				hasPostgresqlEvidence ? "PostgreSQL" : hasMysqlEvidence ? "MySQL" : "Persistence",
				hasPostgresqlEvidence || hasMysqlEvidence ? "project-config-and-class-name" : "class-name",
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
		List<ClassMetadata> domainClasses = classes.stream()
			.filter(item -> belongsToDomain(domainKey, domainControllerNames, item))
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
		ClassMetadata item
	) {
		if (item.layerType().equals("Controller")) {
			return domainControllerNames.contains(item.name());
		}
		return classNameMatchesDomain(item.name(), domainKey)
			|| packageContainsDomainSegment(item.packageName(), domainKey);
	}

	private boolean classNameMatchesDomain(String className, String domainKey) {
		if (!className.regionMatches(true, 0, domainKey, 0, domainKey.length())) {
			return false;
		}
		return className.length() == domainKey.length()
			|| Character.isUpperCase(className.charAt(domainKey.length()))
			|| Character.isDigit(className.charAt(domainKey.length()));
	}

	private boolean packageContainsDomainSegment(String packageName, String domainKey) {
		return Arrays.stream(packageName.split("\\."))
			.anyMatch(segment -> segment.equalsIgnoreCase(domainKey));
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
		ProjectAnalysisStatus analysisStatus,
		int controllerCount,
		int endpointCount,
		List<String> sourceRoots
	) {
		String sourceScope = sourceRoots.size() == 1
			? sourceRoots.getFirst()
			: sourceRoots.size() + " Java source roots";
		if (analysisStatus == ProjectAnalysisStatus.EMPTY) {
			return "Project files were read, but no REST API mappings were detected under " + sourceScope + ".";
		}
		return "Detected " + controllerCount + " controller classes and " + endpointCount + " API mappings under " + sourceScope + ".";
	}

	private AnalysisCoverageResponse buildCoverage(
		Path projectRoot,
		List<Path> sourceRoots,
		List<Path> javaFiles,
		List<ControllerScan> controllers,
		List<ApiCatalogItemResponse> endpoints,
		boolean limitReached
	) {
		List<String> warnings = new ArrayList<>(discoverUnsupportedSourceWarnings(projectRoot));
		boolean unsupportedMappings = javaFiles.stream().anyMatch(this::containsUnsupportedMappingAnnotation);
		if (unsupportedMappings) {
			warnings.add("합성 mapping annotation은 endpoint로 추측하지 않습니다. 표준 Spring mapping annotation으로 선언된 경로만 집계했습니다.");
		}
		if (limitReached) {
			warnings.add("Java 파일이 " + MAX_JAVA_FILES + "개를 넘어 분석 범위를 제한했습니다.");
		}
		int candidates = (int) javaFiles.stream().filter(this::isControllerCandidate).count();
		if (candidates > controllers.size()) {
			warnings.add("Controller 후보 " + candidates + "개 중 " + controllers.size() + "개에서 REST 응답 mapping을 확인했습니다.");
		}
		return new AnalysisCoverageResponse(
			sourceRoots.stream().map(root -> relativizeSourceRoot(projectRoot, root)).toList(),
			javaFiles.size(),
			candidates,
			controllers.size(),
			endpoints.size(),
			List.copyOf(warnings)
		);
	}

	private List<String> discoverUnsupportedSourceWarnings(Path projectRoot) {
		if (!Files.isDirectory(projectRoot)) {
			return List.of();
		}
		final boolean[] kotlinFound = {false};
		try {
			Files.walkFileTree(projectRoot, Set.of(), MAX_SOURCE_ROOT_DEPTH, new SimpleFileVisitor<>() {
				@Override
				public FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attributes) {
					return !directory.equals(projectRoot) && isExcludedDirectory(directory)
						? FileVisitResult.SKIP_SUBTREE
						: FileVisitResult.CONTINUE;
				}

				@Override
				public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) {
					if (file.toString().endsWith(".kt")) {
						kotlinFound[0] = true;
						return FileVisitResult.TERMINATE;
					}
					return FileVisitResult.CONTINUE;
				}
			});
		} catch (IOException exception) {
			return List.of("지원 밖 소스 존재 여부를 확인하지 못했습니다.");
		}
		return kotlinFound[0]
			? List.of("Kotlin 소스는 v0.1 분석 대상이 아니므로 Java endpoint 결과에 포함되지 않습니다.")
			: List.of();
	}

	private boolean isControllerCandidate(Path javaFile) {
		try {
			return Files.readString(javaFile).lines()
				.map(String::trim)
				.anyMatch(line -> isRestControllerAnnotation(line) || isControllerAnnotation(line));
		} catch (IOException exception) {
			return false;
		}
	}

	private boolean containsUnsupportedMappingAnnotation(Path javaFile) {
		try {
			String source = Files.readString(javaFile);
			if (source.contains("@interface") && SUPPORTED_MAPPING_ANNOTATIONS.stream().anyMatch(name -> source.contains("@" + name))) {
				return true;
			}
			Matcher matcher = UNSUPPORTED_MAPPING_PATTERN.matcher(source);
			while (matcher.find()) {
				if (!SUPPORTED_MAPPING_ANNOTATIONS.contains(matcher.group(1))) {
					return true;
				}
			}
		} catch (IOException exception) {
			return false;
		}
		return false;
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
		String message,
		AnalysisCoverageResponse analysisCoverage
	) {
		return buildProjectStructure(
			projectRoot,
			sourceRoot,
			resolveProjectName(projectRoot),
			framework,
			frameworkEvidence,
			analysisStatus,
			message,
			analysisCoverage,
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
		AnalysisCoverageResponse analysisCoverage,
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
			sourceRoot == null ? "" : relativizeSourceRoot(projectRoot, sourceRoot),
			message,
			analysisCoverage,
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

	private record HandlerMetadata(String name, int lineNumber, boolean responseBody) {
	}

	private record JavaFileCollection(List<Path> files, boolean limitReached) {
	}

	private enum ControllerMode {
		NONE,
		REST,
		METHOD_RESPONSE_BODY
	}

}
