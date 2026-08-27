package com.stackflow.tracelab.product.service;

public class ProductNotFoundException extends RuntimeException {

	public ProductNotFoundException(long productId) {
		super("Product " + productId + " was not found.");
	}
}
