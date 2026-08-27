package com.stackflow.orderlab.order.service;

public class OrderNotFoundException extends RuntimeException {

	public OrderNotFoundException(long orderId) {
		super("Order " + orderId + " was not found.");
	}
}
