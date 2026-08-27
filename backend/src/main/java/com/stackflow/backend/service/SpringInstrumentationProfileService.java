package com.stackflow.backend.service;

import com.stackflow.backend.dto.InstrumentationProfileRequest;
import com.stackflow.backend.dto.InstrumentationProfileResponse;
import com.stackflow.backend.dto.InstrumentationProfileStatusResponse;
import com.stackflow.backend.dto.ProjectStructureResponse;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;

@Service
public class SpringInstrumentationProfileService {

	private static final Set<String> INSTRUMENTED_LAYERS = Set.of(
		"Controller", "Service", "UseCase", "Repository", "Store", "Cache", "Gateway", "Client"
	);
	private static final Pattern PACKAGE_PATTERN = Pattern.compile("(?m)^\\s*package\\s+([\\w.]+)\\s*;");
	private static final Pattern TYPE_PATTERN = Pattern.compile("\\b(?:class|interface|record|enum)\\s+(\\w+)");
	private static final Pattern PUBLIC_METHOD_PATTERN = Pattern.compile(
		"\\bpublic\\s+(?:<[^>{}]+>\\s+)?[\\w<?>.,\\[\\]\\s]+\\s+(\\w+)\\s*\\("
	);
	private static final String DEFAULT_COLLECTOR = "http://localhost:18080";
	private static final String DEFAULT_AGENT_PATH = "~/.stackflow/agents/opentelemetry-javaagent.jar";

	private final SpringApiCatalogService catalogService;
	private final InstrumentationProfileRegistry profileRegistry;

	public SpringInstrumentationProfileService(
		SpringApiCatalogService catalogService,
		InstrumentationProfileRegistry profileRegistry
	) {
		this.catalogService = catalogService;
		this.profileRegistry = profileRegistry;
	}

	public InstrumentationProfileResponse createProfile(InstrumentationProfileRequest request) {
		Path projectRoot = resolveProjectRoot(request.projectPath());
		ProjectStructureResponse structure = catalogService.getProjectStructure(projectRoot.toString());
		if (!structure.analysisStatus().name().equals("SUCCESS")) {
			throw new IllegalArgumentException("A successfully analyzed Spring Boot project is required.");
		}

		String collectorBaseUrl = normalizeCollectorBaseUrl(request.collectorBaseUrl());
		String agentPath = normalizeAgentPath(request.agentPath());
		Set<String> eligibleClasses = collectEligibleClassNames(structure);
		List<String> analyzedSourceRoots = structure.analysisCoverage() == null
			? List.of()
			: structure.analysisCoverage().sourceRoots();
		List<Path> sourceRoots = resolveSourceRoots(
			projectRoot,
			analyzedSourceRoots,
			structure.sourceRoot()
		);
		List<InstrumentedClass> instrumentedClasses = scanInstrumentedClasses(sourceRoots, eligibleClasses);
		String methodsInclude = instrumentedClasses.stream()
			.filter(item -> !item.methods().isEmpty())
			.map(item -> item.qualifiedName() + "[" + String.join(",", item.methods()) + "]")
			.reduce((left, right) -> left + ";" + right)
			.orElse("");
		String serviceName = normalizeServiceName(structure.projectName());
		String buildTool = detectBuildTool(projectRoot);
		InstrumentationProfileStatusResponse profileStatus = profileRegistry.register(serviceName);
		Map<String, String> environment = buildEnvironment(
			serviceName,
			collectorBaseUrl,
			methodsInclude,
			profileStatus.profileId()
		);
		Map<String, String> commands = buildCommands(agentPath, environment);

		return new InstrumentationProfileResponse(
			structure.projectName(),
			serviceName,
			buildTool,
			collectorBaseUrl,
			agentPath,
			instrumentedClasses.stream().map(InstrumentedClass::qualifiedName).toList(),
			instrumentedClasses.stream().mapToInt(item -> item.methods().size()).sum(),
			methodsInclude,
			environment,
			commands,
			profileStatus.profileId(),
			profileStatus.connectionStatus(),
			profileStatus.createdAt(),
			profileStatus.lastSeenAt()
		);
	}

	private Set<String> collectEligibleClassNames(ProjectStructureResponse structure) {
		Set<String> classes = new LinkedHashSet<>();
		structure.domains().forEach(domain -> domain.layers().stream()
			.filter(layer -> INSTRUMENTED_LAYERS.contains(layer.name()))
			.forEach(layer -> classes.addAll(layer.classes())));
		return classes;
	}

	List<Path> resolveSourceRoots(Path projectRoot, List<String> analyzedSourceRoots, String fallbackSourceRoot) {
		Path normalizedProjectRoot = projectRoot.toAbsolutePath().normalize();
		Path realProjectRoot;
		try {
			realProjectRoot = normalizedProjectRoot.toRealPath();
		} catch (IOException exception) {
			throw new IllegalArgumentException("projectPath must point to a readable directory.", exception);
		}

		List<Path> sourceRoots = new ArrayList<>();
		if (analyzedSourceRoots != null) {
			analyzedSourceRoots.forEach(root -> resolveSourceRoot(
				normalizedProjectRoot,
				realProjectRoot,
				root
			).ifPresent(sourceRoots::add));
		}
		if (sourceRoots.isEmpty()) {
			resolveSourceRoot(normalizedProjectRoot, realProjectRoot, fallbackSourceRoot)
				.ifPresent(sourceRoots::add);
		}
		return sourceRoots.stream().distinct().toList();
	}

	private java.util.Optional<Path> resolveSourceRoot(
		Path projectRoot,
		Path realProjectRoot,
		String sourceRoot
	) {
		if (sourceRoot == null || sourceRoot.isBlank()) {
			return java.util.Optional.empty();
		}
		try {
			Path configuredPath = Path.of(sourceRoot.trim());
			Path candidate = configuredPath.isAbsolute()
				? configuredPath.normalize()
				: projectRoot.resolve(configuredPath).normalize();
			if (!candidate.startsWith(projectRoot)
				|| !candidate.endsWith(Path.of("src/main/java"))
				|| !Files.isDirectory(candidate)) {
				return java.util.Optional.empty();
			}
			Path realSourceRoot = candidate.toRealPath();
			return realSourceRoot.startsWith(realProjectRoot)
				? java.util.Optional.of(realSourceRoot)
				: java.util.Optional.empty();
		} catch (InvalidPathException | IOException | SecurityException exception) {
			return java.util.Optional.empty();
		}
	}

	private List<InstrumentedClass> scanInstrumentedClasses(
		List<Path> sourceRoots,
		Set<String> eligibleClasses
	) {
		Map<String, Set<String>> methodsByClass = new TreeMap<>();
		for (Path sourceRoot : sourceRoots) {
			try (Stream<Path> paths = Files.walk(sourceRoot)) {
				List<Path> sourceFiles = paths.filter(Files::isRegularFile)
					.filter(path -> path.toString().endsWith(".java"))
					.sorted()
					.toList();
				for (Path sourceFile : sourceFiles) {
					scanClass(sourceFile, eligibleClasses).ifPresent(item -> methodsByClass
						.computeIfAbsent(item.qualifiedName(), ignored -> new TreeSet<>())
						.addAll(item.methods()));
				}
			} catch (IOException exception) {
				throw new IllegalArgumentException("Spring source files could not be read.", exception);
			}
		}
		return methodsByClass.entrySet().stream()
			.map(entry -> new InstrumentedClass(entry.getKey(), List.copyOf(entry.getValue())))
			.toList();
	}

	private java.util.Optional<InstrumentedClass> scanClass(
		Path sourceFile,
		Set<String> eligibleClasses
	) throws IOException {
		String source = Files.readString(sourceFile);
		Matcher typeMatcher = TYPE_PATTERN.matcher(source);
		if (!typeMatcher.find() || !eligibleClasses.contains(typeMatcher.group(1))) {
			return java.util.Optional.empty();
		}
		String className = typeMatcher.group(1);
		Matcher packageMatcher = PACKAGE_PATTERN.matcher(source);
		String packageName = packageMatcher.find() ? packageMatcher.group(1) : "";
		Set<String> methods = new LinkedHashSet<>();
		Matcher methodMatcher = PUBLIC_METHOD_PATTERN.matcher(source);
		while (methodMatcher.find()) {
			String methodName = methodMatcher.group(1);
			if (!methodName.equals("main") && !methodName.equals(className)) {
				methods.add(methodName);
			}
		}
		String qualifiedName = packageName.isBlank() ? className : packageName + "." + className;
		return java.util.Optional.of(new InstrumentedClass(qualifiedName, methods.stream().sorted().toList()));
	}

	private Map<String, String> buildEnvironment(
		String serviceName,
		String collectorBaseUrl,
		String methodsInclude,
		String profileId
	) {
		Map<String, String> environment = new LinkedHashMap<>();
		environment.put("OTEL_SERVICE_NAME", serviceName);
		environment.put("OTEL_TRACES_EXPORTER", "otlp");
		environment.put("OTEL_METRICS_EXPORTER", "none");
		environment.put("OTEL_LOGS_EXPORTER", "none");
		environment.put("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf");
		environment.put("OTEL_EXPORTER_OTLP_ENDPOINT", collectorBaseUrl);
		environment.put("OTEL_BSP_SCHEDULE_DELAY", "500");
		environment.put("OTEL_RESOURCE_ATTRIBUTES", "stackflow.profile.id=" + profileId);
		if (!methodsInclude.isBlank()) {
			environment.put("OTEL_INSTRUMENTATION_METHODS_INCLUDE", methodsInclude);
		}
		return Map.copyOf(environment);
	}

	private Map<String, String> buildCommands(String agentPath, Map<String, String> environment) {
		String variables = environment.entrySet().stream()
			.map(entry -> entry.getKey() + "=" + shellQuote(entry.getValue()))
			.reduce((left, right) -> left + " " + right)
			.orElse("");
		String javaToolOptions = "JAVA_TOOL_OPTIONS=" + shellQuote("-javaagent:" + agentPath);
		String prefix = javaToolOptions + (variables.isBlank() ? "" : " " + variables);
		Map<String, String> commands = new LinkedHashMap<>();
		commands.put("gradle", prefix + " ./gradlew bootRun");
		commands.put("maven", prefix + " ./mvnw spring-boot:run");
		commands.put("jar", prefix + " java -jar app.jar");
		return Map.copyOf(commands);
	}

	private Path resolveProjectRoot(String projectPath) {
		if (projectPath == null || projectPath.isBlank()) {
			throw new IllegalArgumentException("projectPath is required.");
		}
		Path root = Path.of(projectPath.trim()).toAbsolutePath().normalize();
		if (!Files.isDirectory(root)) {
			throw new IllegalArgumentException("projectPath must point to an existing directory.");
		}
		return root;
	}

	private String normalizeCollectorBaseUrl(String value) {
		String normalized = value == null || value.isBlank() ? DEFAULT_COLLECTOR : value.trim();
		URI uri = URI.create(normalized);
		if (!(uri.getScheme().equals("http") || uri.getScheme().equals("https")) || uri.getHost() == null) {
			throw new IllegalArgumentException("collectorBaseUrl must be an http or https URL.");
		}
		return normalized.replaceAll("/+$", "");
	}

	private String normalizeAgentPath(String value) {
		String normalized = value == null || value.isBlank() ? DEFAULT_AGENT_PATH : value.trim();
		if (normalized.equals("~")) {
			return Path.of(System.getProperty("user.home")).toAbsolutePath().normalize().toString();
		}
		if (normalized.startsWith("~/")) {
			return Path.of(System.getProperty("user.home"), normalized.substring(2))
				.toAbsolutePath()
				.normalize()
				.toString();
		}
		return normalized;
	}

	private String detectBuildTool(Path projectRoot) {
		if (Files.exists(projectRoot.resolve("gradlew")) || Files.exists(projectRoot.resolve("build.gradle")) || Files.exists(projectRoot.resolve("build.gradle.kts"))) {
			return "GRADLE";
		}
		if (Files.exists(projectRoot.resolve("mvnw")) || Files.exists(projectRoot.resolve("pom.xml"))) {
			return "MAVEN";
		}
		return "JAR";
	}

	static String normalizeServiceName(String projectName) {
		return projectName.toLowerCase(Locale.ROOT)
			.replaceAll("[^a-z0-9._-]+", "-")
			.replaceAll("^-+|-+$", "");
	}

	private String shellQuote(String value) {
		return "'" + value.replace("'", "'\\''") + "'";
	}

	private record InstrumentedClass(String qualifiedName, List<String> methods) {
	}
}
