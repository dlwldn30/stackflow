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
			""").getFirst();

		assertEquals("GET", mapping.method());
		assertTrue(mapping.methodSpecified());
		assertEquals("/products/{productId}", mapping.path());
	}

	@Test
	void parsesShortcutMappingWithMultiplePositionalPaths() {
		List<SpringMappingParser.MappingAnnotation> mappings = parser.parse("""
			@GetMapping({"/products", "/products/search"})
			""");

		assertEquals(2, mappings.size());
		assertTrue(mappings.stream().allMatch(mapping -> mapping.method().equals("GET")));
		assertTrue(mappings.stream().allMatch(SpringMappingParser.MappingAnnotation::methodSpecified));
		assertEquals("/products", mappings.get(0).path());
		assertEquals("/products/search", mappings.get(1).path());
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
			""").getFirst();

		assertEquals("PATCH", mapping.method());
		assertTrue(mapping.methodSpecified());
		assertEquals("/orders/{orderId}", mapping.path());
	}

	@Test
	void parsesRequestMappingWithMultipleExplicitMethods() {
		List<SpringMappingParser.MappingAnnotation> mappings = parser.parse("""
			@RequestMapping(
				value = "/orders/{orderId}",
				method = {RequestMethod.GET, RequestMethod.POST}
			)
			""");

		assertEquals(2, mappings.size());
		assertEquals("GET", mappings.get(0).method());
		assertEquals("POST", mappings.get(1).method());
		assertTrue(mappings.stream().allMatch(SpringMappingParser.MappingAnnotation::methodSpecified));
		assertTrue(mappings.stream().allMatch(mapping -> mapping.path().equals("/orders/{orderId}")));
	}

	@Test
	void parsesRequestMappingWithMultipleMethodsAndPaths() {
		List<SpringMappingParser.MappingAnnotation> mappings = parser.parse("""
			@RequestMapping(
				path = {"/orders", "/orders/search"},
				method = {RequestMethod.GET, RequestMethod.POST}
			)
			""");

		assertEquals(4, mappings.size());
		assertEquals("GET", mappings.get(0).method());
		assertEquals("/orders", mappings.get(0).path());
		assertEquals("GET", mappings.get(1).method());
		assertEquals("/orders/search", mappings.get(1).path());
		assertEquals("POST", mappings.get(2).method());
		assertEquals("/orders", mappings.get(2).path());
		assertEquals("POST", mappings.get(3).method());
		assertEquals("/orders/search", mappings.get(3).path());
		assertTrue(mappings.stream().allMatch(SpringMappingParser.MappingAnnotation::methodSpecified));
	}

	@Test
	void parsesRequestMappingWithoutExplicitMethodAsAnalysisOnly() {
		SpringMappingParser.MappingAnnotation mapping = parser.parse("""
			@RequestMapping(path = "/orders/summary")
			""").getFirst();

		assertEquals("UNSPECIFIED", mapping.method());
		assertFalse(mapping.methodSpecified());
		assertEquals("/orders/summary", mapping.path());
	}

	@Test
	void doesNotTreatMappingOptionsAsPositionalPath() {
		SpringMappingParser.MappingAnnotation mapping = parser.parse("""
			@RequestMapping(
				method = RequestMethod.GET,
				produces = "application/json"
			)
			""").getFirst();

		assertEquals("GET", mapping.method());
		assertTrue(mapping.methodSpecified());
		assertEquals("", mapping.path());
	}

	@Test
	void reportsUnresolvedConstantPathWithoutCreatingRootMapping() {
		SpringMappingParser.ParseResult result = parser.parseResult("@GetMapping(ApiPaths.PRODUCTS)");

		assertTrue(result.unresolvedPath());
		assertTrue(result.mappings().isEmpty());
	}

	@Test
	void reportsMixedLiteralAndConstantPathArrayAsUnresolved() {
		SpringMappingParser.ParseResult result = parser.parseResult("@GetMapping({\"/products\", ApiPaths.SEARCH})");

		assertTrue(result.unresolvedPath());
		assertEquals(List.of("/products"), result.mappings().stream().map(SpringMappingParser.MappingAnnotation::path).toList());
	}

	@Test
	void reportsConcatenatedPathExpressionAsUnresolved() {
		assertTrue(parser.parseResult("@GetMapping(\"/api/\" + ApiPaths.VERSION)").unresolvedPath());
		assertTrue(parser.parseResult("@GetMapping(path = \"/api/\" + ApiPaths.VERSION)").unresolvedPath());
	}

	@Test
	void ignoresNonMappingAnnotationBlocks() {
		assertTrue(parser.parse("@Autowired").isEmpty());
		assertFalse(parser.startsMappingAnnotation("@Autowired"));
	}
}
