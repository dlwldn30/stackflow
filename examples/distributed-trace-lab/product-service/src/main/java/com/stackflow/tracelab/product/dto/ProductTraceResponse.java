package com.stackflow.tracelab.product.dto;

import com.stackflow.tracelab.product.cache.ProductCacheLookup.CachedProduct;
import com.stackflow.tracelab.product.domain.Product;

public record ProductTraceResponse(long id, String name, long price, ProductSource source) {

	public static ProductTraceResponse from(Product product, ProductSource source) {
		return new ProductTraceResponse(product.getId(), product.getName(), product.getPrice(), source);
	}

	public static ProductTraceResponse from(CachedProduct product) {
		return new ProductTraceResponse(product.id(), product.name(), product.price(), ProductSource.CACHE);
	}
}
