package com.stackflow.backend.service;

import com.stackflow.backend.dto.ApiCatalogItemResponse;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
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
		Path sourceRoot = resolveSourceRoot();
		if (!Files.exists(sourceRoot)) {
			return List.of();
		}

		try (Stream<Path> paths = Files.walk(sourceRoot)) {
			return paths
				.filter(path -> path.toString().endsWith(".java"))
				.flatMap(path -> scanController(path).stream())
				.sorted(Comparator.comparing(ApiCatalogItemResponse::path).thenComparing(ApiCatalogItemResponse::method))
				.toList();
		} catch (IOException exception) {
			return List.of();
		}
	}

	private Path resolveSourceRoot() {
		Path workingDirectory = Path.of(System.getProperty("user.dir"));
		Path direct = workingDirectory.resolve("src/main/java");
		if (Files.exists(direct)) {
			return direct;
		}

		return workingDirectory.resolve("backend/src/main/java");
	}

	private List<ApiCatalogItemResponse> scanController(Path javaFile) {
		String source;
		try {
			source = Files.readString(javaFile);
		} catch (IOException exception) {
			return List.of();
		}

		List<String> lines = source.lines().toList();
		if (lines.stream().map(String::trim).noneMatch(line -> line.startsWith("@RestController"))) {
			return List.of();
		}

		String controller = extractClassName(source).orElse(javaFile.getFileName().toString().replace(".java", ""));
		if (isInternalController(controller)) {
			return List.of();
		}

		String basePath = extractClassBasePath(source);
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
				!pathVariables.isEmpty(),
				pathVariables
			));
		}

		return catalog;
	}

	private boolean isInternalController(String controller) {
		return controller.equals("TraceController") || controller.equals("ProjectAnalysisController");
	}

	private Optional<String> extractClassName(String source) {
		Matcher matcher = CLASS_NAME_PATTERN.matcher(source);
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

	private record MappingAnnotation(String method, String path) {
	}
}
