package com.stackflow.tracelab.product.cache;

import java.util.Optional;

public record ProductCacheLookup(Status status, Optional<CachedProduct> product) {

	public enum Status {
		HIT,
		MISS,
		UNAVAILABLE
	}

	public record CachedProduct(long id, String name, long price) {
	}

	public static ProductCacheLookup hit(CachedProduct product) {
		return new ProductCacheLookup(Status.HIT, Optional.of(product));
	}

	public static ProductCacheLookup miss() {
		return new ProductCacheLookup(Status.MISS, Optional.empty());
	}

	public static ProductCacheLookup unavailable() {
		return new ProductCacheLookup(Status.UNAVAILABLE, Optional.empty());
	}
}
