package com.stackflow.backend.service;

import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class SpringMappingParser {

	private static final Pattern MAPPING_PATH_PATTERN = Pattern.compile("(?:value|path)\\s*=\\s*\"([^\"]*)\"|\"([^\"]*)\"");
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

	Optional<MappingAnnotation> parse(String annotationBlock) {
		if (!annotationBlock.startsWith("@")) {
			return Optional.empty();
		}

		return parseShortcutMapping(annotationBlock, "@GetMapping", "GET")
			.or(() -> parseShortcutMapping(annotationBlock, "@PostMapping", "POST"))
			.or(() -> parseShortcutMapping(annotationBlock, "@PutMapping", "PUT"))
			.or(() -> parseShortcutMapping(annotationBlock, "@DeleteMapping", "DELETE"))
			.or(() -> parseShortcutMapping(annotationBlock, "@PatchMapping", "PATCH"))
			.or(() -> parseRequestMapping(annotationBlock));
	}

	Optional<String> extractPath(String annotationBlock) {
		Matcher matcher = MAPPING_PATH_PATTERN.matcher(annotationBlock);
		if (!matcher.find()) {
			return Optional.empty();
		}

		String namedPath = matcher.group(1);
		return Optional.of(namedPath == null ? matcher.group(2) : namedPath);
	}

	private Optional<MappingAnnotation> parseShortcutMapping(String annotationBlock, String annotation, String method) {
		if (!annotationBlock.contains(annotation)) {
			return Optional.empty();
		}

		return Optional.of(new MappingAnnotation(method, true, extractPath(annotationBlock).orElse("")));
	}

	private Optional<MappingAnnotation> parseRequestMapping(String annotationBlock) {
		if (!annotationBlock.contains("@RequestMapping")) {
			return Optional.empty();
		}

		Matcher methodMatcher = REQUEST_METHOD_PATTERN.matcher(annotationBlock);
		String method = "UNSPECIFIED";
		boolean methodSpecified = false;
		if (methodMatcher.find()) {
			method = methodMatcher.group(1);
			methodSpecified = true;
		}

		return Optional.of(new MappingAnnotation(method, methodSpecified, extractPath(annotationBlock).orElse("")));
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
}
