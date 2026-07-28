package com.stackflow.backend.store;

import com.stackflow.backend.domain.Product;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class ProductCatalogStore {

	private final Map<Long, Product> products = new ConcurrentHashMap<>();

	public ProductCatalogStore() {
		products.put(1001L, new Product(1001L, "Redis Deep Dive", "Books", new BigDecimal("38.50"), "Tracing-friendly sample catalog item."));
		products.put(1002L, new Product(1002L, "Latency Dashboard Kit", "Tools", new BigDecimal("89.00"), "Useful for graphing request bottlenecks."));
		products.put(1003L, new Product(1003L, "Failure Injection Switch", "Infra", new BigDecimal("24.90"), "Helps reproduce fallback and timeout paths."));
	}

	public Product findById(Long productId) {
		return products.get(productId);
	}

	public List<Product> findAll() {
		return products.values().stream()
			.sorted((left, right) -> left.id().compareTo(right.id()))
			.toList();
	}

	public int stockById(Long productId) {
		return switch (productId.intValue()) {
			case 1001 -> 42;
			case 1002 -> 8;
			case 1003 -> 0;
			default -> -1;
		};
	}
}
