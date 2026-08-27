package com.stackflow.orderlab.order.client;

public class ProductClientException extends RuntimeException {

	private final int statusCode;

	public ProductClientException(int statusCode, String message) {
		super(message);
		this.statusCode = statusCode;
	}

	public ProductClientException(String message, Throwable cause) {
		super(message, cause);
		this.statusCode = 0;
	}

	public int statusCode() {
		return statusCode;
	}
}
