package com.stackflow.tracelab.product.repository;

import com.stackflow.tracelab.product.domain.Product;
import com.stackflow.tracelab.product.service.ProductNotFoundException;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class ProductRepositoryService {

	private final ProductRepository productRepository;
	private final JdbcTemplate jdbcTemplate;

	public ProductRepositoryService(ProductRepository productRepository, JdbcTemplate jdbcTemplate) {
		this.productRepository = productRepository;
		this.jdbcTemplate = jdbcTemplate;
	}

	public Product findById(long productId) {
		return productRepository.findById(productId)
			.orElseThrow(() -> new ProductNotFoundException(productId));
	}

	public List<Product> findAll() {
		return productRepository.findAll();
	}

	public void triggerDatabaseError() {
		jdbcTemplate.queryForObject("select count(*) from trace_lab_missing_table", Long.class);
	}
}
