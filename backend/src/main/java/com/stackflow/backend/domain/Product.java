package com.stackflow.backend.domain;

import java.math.BigDecimal;

public record Product(
	Long id,
	String name,
	String category,
	BigDecimal price,
	String summary
) {
}
