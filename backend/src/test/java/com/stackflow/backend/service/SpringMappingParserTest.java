package com.stackflow.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class SpringMappingParserTest {

	private final SpringMappingParser parser = new SpringMappingParser();

	@Test
	void parsesShortcutMappingWithNamedPath() {
		SpringMappingParser.MappingAnnotation mapping = parser.parse("""
			@GetMapping(
				path = "/products/{productId}"
			)
			""").orElseThrow();

		assertEquals("GET", mapping.method());
		assertTrue(mapping.methodSpecified());
		assertEquals("/products/{productId}", mapping.path());
	}

	@Test
	void collectsMultilineAnnotationBlock() {
		List<String> lines = List.of(
			"\t@GetMapping(",
			"\t\tpath = \"/products/{productId}\"",
			"\t)",
			"\tpublic String getProduct() {",
			"\t\treturn \"ok\";",
			"\t}"
		);

		SpringMappingParser.AnnotationBlock annotationBlock = parser.collectAnnotationBlock(lines, 0);

		assertEquals("""
			@GetMapping(
			path = "/products/{productId}"
			)""", annotationBlock.content());
		assertEquals(2, annotationBlock.endIndex());
	}

	@Test
	void parsesRequestMappingWithExplicitMethod() {
		SpringMappingParser.MappingAnnotation mapping = parser.parse("""
			@RequestMapping(
				value = "/orders/{orderId}",
				method = RequestMethod.PATCH
			)
			""").orElseThrow();

		assertEquals("PATCH", mapping.method());
		assertTrue(mapping.methodSpecified());
		assertEquals("/orders/{orderId}", mapping.path());
	}

	@Test
	void parsesRequestMappingWithoutExplicitMethodAsAnalysisOnly() {
		SpringMappingParser.MappingAnnotation mapping = parser.parse("""
			@RequestMapping(path = "/orders/summary")
			""").orElseThrow();

		assertEquals("UNSPECIFIED", mapping.method());
		assertFalse(mapping.methodSpecified());
		assertEquals("/orders/summary", mapping.path());
	}

	@Test
	void ignoresNonMappingAnnotationBlocks() {
		assertTrue(parser.parse("@Autowired").isEmpty());
		assertFalse(parser.startsMappingAnnotation("@Autowired"));
	}
}
