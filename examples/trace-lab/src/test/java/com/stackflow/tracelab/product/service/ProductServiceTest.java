package com.stackflow.tracelab.product.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.stackflow.tracelab.product.cache.ProductCacheService;
import com.stackflow.tracelab.product.domain.Product;
import com.stackflow.tracelab.product.dto.ProductSource;
import com.stackflow.tracelab.product.dto.ProductTraceResponse;
import com.stackflow.tracelab.product.repository.ProductRepositoryService;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;

class ProductServiceTest {

	@Test
	void fallsBackToDatabaseWhenRedisIsUnavailable() {
		ProductCacheService cacheService = mock(ProductCacheService.class);
		ProductRepositoryService repositoryService = mock(ProductRepositoryService.class);
		Product product = new Product(1001L, "Trace Keyboard", 129000L);
		when(cacheService.findById(1001L)).thenThrow(new RedisConnectionFailureException("Redis unavailable"));
		when(repositoryService.findById(1001L)).thenReturn(product);
		ProductService service = new ProductService(cacheService, repositoryService);

		ProductTraceResponse response = service.getProduct(1001L);

		assertThat(response.source()).isEqualTo(ProductSource.DATABASE_FALLBACK);
		assertThat(response.name()).isEqualTo("Trace Keyboard");
		verify(cacheService, never()).save(product);
	}
}
