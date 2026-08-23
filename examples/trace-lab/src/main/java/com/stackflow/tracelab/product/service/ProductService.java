package com.stackflow.tracelab.product.service;

import com.stackflow.tracelab.product.cache.ProductCacheLookup;
import com.stackflow.tracelab.product.cache.ProductCacheService;
import com.stackflow.tracelab.product.domain.Product;
import com.stackflow.tracelab.product.dto.CacheEvictionResponse;
import com.stackflow.tracelab.product.dto.ProductSource;
import com.stackflow.tracelab.product.dto.ProductTraceResponse;
import com.stackflow.tracelab.product.repository.ProductRepositoryService;
import java.util.List;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

@Service
public class ProductService {

	private final ProductCacheService productCacheService;
	private final ProductRepositoryService productRepositoryService;

	public ProductService(ProductCacheService productCacheService, ProductRepositoryService productRepositoryService) {
		this.productCacheService = productCacheService;
		this.productRepositoryService = productRepositoryService;
	}

	public ProductTraceResponse getProduct(long productId) {
		ProductCacheLookup cacheLookup;
		boolean cacheUnavailable = false;
		try {
			cacheLookup = productCacheService.findById(productId);
		} catch (DataAccessException exception) {
			cacheLookup = ProductCacheLookup.miss();
			cacheUnavailable = true;
		}
		if (cacheLookup.status() == ProductCacheLookup.Status.HIT) {
			return ProductTraceResponse.from(cacheLookup.product().orElseThrow());
		}

		Product product = productRepositoryService.findById(productId);
		if (!cacheUnavailable) {
			try {
				productCacheService.save(product);
			} catch (DataAccessException exception) {
				cacheUnavailable = true;
			}
		}
		ProductSource source = cacheUnavailable ? ProductSource.DATABASE_FALLBACK : ProductSource.DATABASE;
		return ProductTraceResponse.from(product, source);
	}

	public List<ProductTraceResponse> getProducts() {
		return productRepositoryService.findAll().stream()
			.map(product -> ProductTraceResponse.from(product, ProductSource.DATABASE))
			.toList();
	}

	public CacheEvictionResponse evictProductCache(long productId) {
		productCacheService.evict(productId);
		return new CacheEvictionResponse(productId, "EVICTED");
	}

	public void triggerDatabaseError() {
		productRepositoryService.triggerDatabaseError();
	}

	public void triggerDatabaseTimeout(long productId) {
		productRepositoryService.findById(productId);
		productRepositoryService.triggerDatabaseTimeout();
	}
}
