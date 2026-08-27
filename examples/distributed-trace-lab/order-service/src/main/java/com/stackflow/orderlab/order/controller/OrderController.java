package com.stackflow.orderlab.order.controller;

import com.stackflow.orderlab.order.dto.OrderResponse;
import com.stackflow.orderlab.order.service.OrderService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/lab/orders")
public class OrderController {

	private final OrderService orderService;

	public OrderController(OrderService orderService) {
		this.orderService = orderService;
	}

	@GetMapping("/{orderId}")
	public OrderResponse getOrder(@PathVariable long orderId) {
		return orderService.getOrder(orderId);
	}

	@GetMapping("/{orderId}/product-timeout")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void triggerProductTimeout(@PathVariable long orderId) {
		orderService.triggerProductTimeout(orderId);
	}
}
