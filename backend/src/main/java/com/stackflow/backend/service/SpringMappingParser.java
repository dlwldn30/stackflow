package com.stackflow.backend.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class SpringMappingParser {

	private static final Pattern NAMED_MAPPING_PATH_PATTERN = Pattern.compile("(?:value|path)\\s*=\\s*\"([^\"]*)\"");
	private static final Pattern NAMED_MAPPING_PATH_ARRAY_PATTERN = Pattern.compile("(?:value|path)\\s*=\\s*\\{([^}]*)}");
	private static final Pattern POSITIONAL_MAPPING_PATH_PATTERN = Pattern.compile("^\\s*\"([^\"]*)\"");
	private static final Pattern POSITIONAL_MAPPING_PATH_ARRAY_PATTERN = Pattern.compile("^\\s*\\{([^}]*)}");
	private static final Pattern QUOTED_STRING_PATTERN = Pattern.compile("\"([^\"]*)\"");
	private static final Pattern REQUEST_METHOD_PATTERN = Pattern.compile("RequestMethod\\.(GET|POST|PUT|DELETE|PATCH)");

	boolean startsMappingAnnotation(String line) {
		return line.startsWith("@GetMapping")
			|| line.startsWith("@PostMapping")
			|| line.startsWith("@PutMapping")
			|| line.startsWith("@DeleteMapping")
			|| line.startsWith("@PatchMapping")
			|| line.startsWith("@RequestMapping");
	}

	AnnotationBlock collectAnnotationBlock(List<String> lines, int startIndex) {
		StringBuilder builder = new StringBuilder();
		int depth = 0;
		int endIndex = startIndex;
		boolean started = false;

		for (int index = startIndex; index < lines.size(); index += 1) {
			String line = lines.get(index).trim();
			if (!started && !line.startsWith("@")) {
				break;
			}
			if (started && depth <= 0 && !line.startsWith("@") && !line.isBlank()) {
				break;
			}
			if (!builder.isEmpty()) {
				builder.append('\n');
			}
			builder.append(line);
			depth += countChar(line, '(') - countChar(line, ')');
			endIndex = index;
			started = true;
			if (depth <= 0 && !line.endsWith(",")) {
				break;
			}
		}

		return new AnnotationBlock(builder.toString(), endIndex);
	}

	List<MappingAnnotation> parse(String annotationBlock) {
		if (!annotationBlock.startsWith("@")) {
			return List.of();
		}

		for (MappingShortcut shortcut : MappingShortcut.values()) {
			List<MappingAnnotation> mappings = parseShortcutMapping(annotationBlock, shortcut.annotation(), shortcut.method());
			if (!mappings.isEmpty()) {
				return mappings;
			}
		}
		return parseRequestMapping(annotationBlock);
	}

	Optional<String> extractPath(String annotationBlock) {
		return extractPaths(annotationBlock).stream().findFirst();
	}

	private List<String> extractPaths(String annotationBlock) {
		Matcher namedPathArrayMatcher = NAMED_MAPPING_PATH_ARRAY_PATTERN.matcher(annotationBlock);
		if (namedPathArrayMatcher.find()) {
			return extractQuotedStrings(namedPathArrayMatcher.group(1));
		}

		Matcher namedPathMatcher = NAMED_MAPPING_PATH_PATTERN.matcher(annotationBlock);
		if (namedPathMatcher.find()) {
			return List.of(namedPathMatcher.group(1));
		}

		return extractAnnotationArguments(annotationBlock)
			.map(arguments -> {
				Matcher positionalPathArrayMatcher = POSITIONAL_MAPPING_PATH_ARRAY_PATTERN.matcher(arguments);
				if (positionalPathArrayMatcher.find()) {
					return extractQuotedStrings(positionalPathArrayMatcher.group(1));
				}

				Matcher positionalPathMatcher = POSITIONAL_MAPPING_PATH_PATTERN.matcher(arguments);
				return positionalPathMatcher.find()
					? List.of(positionalPathMatcher.group(1))
					: List.<String>of();
			})
			.orElse(List.of());
	}

	private List<String> extractQuotedStrings(String value) {
		Matcher matcher = QUOTED_STRING_PATTERN.matcher(value);
		List<String> values = new ArrayList<>();
		while (matcher.find()) {
			values.add(matcher.group(1));
		}
		return List.copyOf(values);
	}

	private Optional<String> extractAnnotationArguments(String annotationBlock) {
		int openIndex = annotationBlock.indexOf('(');
		int closeIndex = annotationBlock.lastIndexOf(')');
		if (openIndex < 0 || closeIndex <= openIndex) {
			return Optional.empty();
		}
		return Optional.of(annotationBlock.substring(openIndex + 1, closeIndex));
	}

	private List<MappingAnnotation> parseShortcutMapping(String annotationBlock, String annotation, String method) {
		if (!annotationBlock.contains(annotation)) {
			return List.of();
		}

		return extractPathsOrRoot(annotationBlock).stream()
			.map(path -> new MappingAnnotation(method, true, path))
			.toList();
	}

	private List<MappingAnnotation> parseRequestMapping(String annotationBlock) {
		if (!annotationBlock.contains("@RequestMapping")) {
			return List.of();
		}

		Matcher methodMatcher = REQUEST_METHOD_PATTERN.matcher(annotationBlock);
		List<MappingAnnotation> mappings = new ArrayList<>();
		List<String> paths = extractPathsOrRoot(annotationBlock);
		while (methodMatcher.find()) {
			for (String path : paths) {
				mappings.add(new MappingAnnotation(methodMatcher.group(1), true, path));
			}
		}

		if (mappings.isEmpty()) {
			return paths.stream()
				.map(path -> new MappingAnnotation("UNSPECIFIED", false, path))
				.toList();
		}
		return List.copyOf(mappings);
	}

	private List<String> extractPathsOrRoot(String annotationBlock) {
		List<String> paths = extractPaths(annotationBlock);
		return paths.isEmpty() ? List.of("") : paths;
	}

	private int countChar(String value, char target) {
		int count = 0;
		for (int index = 0; index < value.length(); index += 1) {
			if (value.charAt(index) == target) {
				count += 1;
			}
		}
		return count;
	}

	record MappingAnnotation(String method, boolean methodSpecified, String path) {
	}

	record AnnotationBlock(String content, int endIndex) {
	}

	private enum MappingShortcut {
		GET("@GetMapping", "GET"),
		POST("@PostMapping", "POST"),
		PUT("@PutMapping", "PUT"),
		DELETE("@DeleteMapping", "DELETE"),
		PATCH("@PatchMapping", "PATCH");

		private final String annotation;
		private final String method;

		MappingShortcut(String annotation, String method) {
			this.annotation = annotation;
			this.method = method;
		}

		String annotation() {
			return annotation;
		}

		String method() {
			return method;
		}
	}
}
