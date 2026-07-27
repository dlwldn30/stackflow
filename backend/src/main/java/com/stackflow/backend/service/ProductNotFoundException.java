package com.stackflow.backend.service;

public class ProductNotFoundException extends RuntimeException {

	public ProductNotFoundException(Long productId) {
		super("Product not found: " + productId);
	}
}
