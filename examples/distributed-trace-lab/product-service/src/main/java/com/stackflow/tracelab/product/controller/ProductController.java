package com.stackflow.tracelab.product.controller;

import com.stackflow.tracelab.product.dto.CacheEvictionResponse;
import com.stackflow.tracelab.product.dto.ProductTraceResponse;
import com.stackflow.tracelab.product.service.ProductService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/lab/products")
public class ProductController {

	private final ProductService productService;

	public ProductController(ProductService productService) {
		this.productService = productService;
	}

	@GetMapping("/{productId}")
	public ProductTraceResponse getProduct(@PathVariable long productId) {
		return productService.getProduct(productId);
	}

	@GetMapping
	public List<ProductTraceResponse> getProducts() {
		return productService.getProducts();
	}

	@DeleteMapping("/{productId}/cache")
	public CacheEvictionResponse evictProductCache(@PathVariable long productId) {
		return productService.evictProductCache(productId);
	}

	@GetMapping("/database-error")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void triggerDatabaseError() {
		productService.triggerDatabaseError();
	}

	@GetMapping("/{productId}/database-timeout")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void triggerDatabaseTimeout(@PathVariable long productId) {
		productService.triggerDatabaseTimeout(productId);
	}
}
