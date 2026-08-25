package com.stackflow.backend.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class SpringMappingParser {

	private static final Pattern NAMED_MAPPING_PATH_PATTERN = Pattern.compile("(?:value|path)\\s*=\\s*\"([^\"]*)\"\\s*(?=,|\\))");
	private static final Pattern NAMED_MAPPING_PATH_ARRAY_PATTERN = Pattern.compile("(?:value|path)\\s*=\\s*\\{([^}]*)}");
	private static final Pattern NAMED_MAPPING_PATH_DECLARATION_PATTERN = Pattern.compile("(?:value|path)\\s*=");
	private static final Pattern POSITIONAL_MAPPING_PATH_PATTERN = Pattern.compile("^\\s*\"([^\"]*)\"\\s*(?=,|$)");
	private static final Pattern POSITIONAL_MAPPING_PATH_ARRAY_PATTERN = Pattern.compile("^\\s*\\{([^}]*)}");
	private static final Pattern NAMED_OPTION_PATTERN = Pattern.compile("^\\s*\\w+\\s*=");
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
		return parseResult(annotationBlock).mappings();
	}

	ParseResult parseResult(String annotationBlock) {
		if (!annotationBlock.startsWith("@")) {
			return new ParseResult(List.of(), false);
		}

		for (MappingShortcut shortcut : MappingShortcut.values()) {
			if (annotationBlock.contains(shortcut.annotation())) {
				return parseShortcutMapping(annotationBlock, shortcut.method());
			}
		}
		return parseRequestMapping(annotationBlock);
	}

	Optional<String> extractPath(String annotationBlock) {
		return extractPathResult(annotationBlock).paths().stream().findFirst();
	}

	private PathExtraction extractPathResult(String annotationBlock) {
		Matcher namedPathArrayMatcher = NAMED_MAPPING_PATH_ARRAY_PATTERN.matcher(annotationBlock);
		if (namedPathArrayMatcher.find()) {
			List<String> paths = extractQuotedStrings(namedPathArrayMatcher.group(1));
			return new PathExtraction(paths, paths.isEmpty() || !containsOnlyQuotedValues(namedPathArrayMatcher.group(1)));
		}

		Matcher namedPathMatcher = NAMED_MAPPING_PATH_PATTERN.matcher(annotationBlock);
		if (namedPathMatcher.find()) {
			return new PathExtraction(List.of(namedPathMatcher.group(1)), false);
		}
		if (NAMED_MAPPING_PATH_DECLARATION_PATTERN.matcher(annotationBlock).find()) {
			return new PathExtraction(List.of(), true);
		}

		return extractAnnotationArguments(annotationBlock)
			.map(arguments -> {
				if (arguments.isBlank()) {
					return new PathExtraction(List.of(""), false);
				}
				Matcher positionalPathArrayMatcher = POSITIONAL_MAPPING_PATH_ARRAY_PATTERN.matcher(arguments);
				if (positionalPathArrayMatcher.find()) {
					List<String> paths = extractQuotedStrings(positionalPathArrayMatcher.group(1));
					return new PathExtraction(paths, paths.isEmpty() || !containsOnlyQuotedValues(positionalPathArrayMatcher.group(1)));
				}

				Matcher positionalPathMatcher = POSITIONAL_MAPPING_PATH_PATTERN.matcher(arguments);
				if (positionalPathMatcher.find()) {
					return new PathExtraction(List.of(positionalPathMatcher.group(1)), false);
				}
				return NAMED_OPTION_PATTERN.matcher(arguments).find()
					? new PathExtraction(List.of(""), false)
					: new PathExtraction(List.of(), true);
			})
			.orElse(new PathExtraction(List.of(""), false));
	}

	private boolean containsOnlyQuotedValues(String value) {
		return QUOTED_STRING_PATTERN.matcher(value).replaceAll("").replace(",", "").isBlank();
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

	private ParseResult parseShortcutMapping(String annotationBlock, String method) {
		PathExtraction extraction = extractPathResult(annotationBlock);
		List<MappingAnnotation> mappings = extraction.paths().stream()
			.map(path -> new MappingAnnotation(method, true, path))
			.toList();
		return new ParseResult(mappings, extraction.unresolved());
	}

	private ParseResult parseRequestMapping(String annotationBlock) {
		if (!annotationBlock.contains("@RequestMapping")) {
			return new ParseResult(List.of(), false);
		}

		Matcher methodMatcher = REQUEST_METHOD_PATTERN.matcher(annotationBlock);
		List<MappingAnnotation> mappings = new ArrayList<>();
		PathExtraction extraction = extractPathResult(annotationBlock);
		List<String> paths = extraction.paths();
		while (methodMatcher.find()) {
			for (String path : paths) {
				mappings.add(new MappingAnnotation(methodMatcher.group(1), true, path));
			}
		}

		if (mappings.isEmpty()) {
			List<MappingAnnotation> unspecifiedMappings = paths.stream()
				.map(path -> new MappingAnnotation("UNSPECIFIED", false, path))
				.toList();
			return new ParseResult(unspecifiedMappings, extraction.unresolved());
		}
		return new ParseResult(List.copyOf(mappings), extraction.unresolved());
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

	record ParseResult(List<MappingAnnotation> mappings, boolean unresolvedPath) {
	}

	record AnnotationBlock(String content, int endIndex) {
	}

	private record PathExtraction(List<String> paths, boolean unresolved) {
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
