package com.stackflow.tracelab.product.cache;

import com.stackflow.tracelab.product.cache.ProductCacheLookup.CachedProduct;
import com.stackflow.tracelab.product.domain.Product;
import java.time.Duration;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class ProductCacheService {

	private static final Duration CACHE_TTL = Duration.ofMinutes(10);
	private static final String KEY_PREFIX = "trace-lab:product:";

	private final StringRedisTemplate redisTemplate;

	public ProductCacheService(StringRedisTemplate redisTemplate) {
		this.redisTemplate = redisTemplate;
	}

	public ProductCacheLookup findById(long productId) {
		try {
			String value = redisTemplate.opsForValue().get(key(productId));
			if (value == null) {
				return ProductCacheLookup.miss();
			}
			return ProductCacheLookup.hit(deserialize(value));
		} catch (IllegalArgumentException exception) {
			redisTemplate.delete(key(productId));
			return ProductCacheLookup.miss();
		}
	}

	public boolean save(Product product) {
		CachedProduct cachedProduct = new CachedProduct(product.getId(), product.getName(), product.getPrice());
		redisTemplate.opsForValue().set(key(product.getId()), serialize(cachedProduct), CACHE_TTL);
		return true;
	}

	public void evict(long productId) {
		redisTemplate.delete(key(productId));
	}

	private String key(long productId) {
		return KEY_PREFIX + productId;
	}

	private String serialize(CachedProduct product) {
		return product.id() + "\t" + product.name() + "\t" + product.price();
	}

	private CachedProduct deserialize(String value) {
		String[] parts = value.split("\t", -1);
		if (parts.length != 3) {
			throw new IllegalArgumentException("Invalid cached product value.");
		}
		try {
			return new CachedProduct(Long.parseLong(parts[0]), parts[1], Long.parseLong(parts[2]));
		} catch (NumberFormatException exception) {
			throw new IllegalArgumentException("Invalid cached product value.", exception);
		}
	}
}
