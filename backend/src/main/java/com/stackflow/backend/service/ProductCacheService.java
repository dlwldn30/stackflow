package com.stackflow.backend.service;

import com.stackflow.backend.domain.Product;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class ProductCacheService {

	private final Map<Long, Product> cache = new ConcurrentHashMap<>();

	public Product get(Long productId) {
		return cache.get(productId);
	}

	public void put(Product product) {
		cache.put(product.id(), product);
	}
}
