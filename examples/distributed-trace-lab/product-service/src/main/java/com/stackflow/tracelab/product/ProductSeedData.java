package com.stackflow.tracelab.product;

import com.stackflow.tracelab.product.domain.Product;
import com.stackflow.tracelab.product.repository.ProductRepository;
import java.util.List;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class ProductSeedData implements ApplicationRunner {

	private final ProductRepository productRepository;

	public ProductSeedData(ProductRepository productRepository) {
		this.productRepository = productRepository;
	}

	@Override
	public void run(ApplicationArguments args) {
		if (productRepository.count() == 0) {
			productRepository.saveAll(List.of(
				new Product(1001L, "Trace Keyboard", 129000L),
				new Product(1002L, "Span Monitor", 349000L)
			));
		}
	}
}
