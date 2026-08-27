package com.stackflow.orderlab.order.service;

import com.stackflow.orderlab.order.client.ProductClient;
import com.stackflow.orderlab.order.domain.Order;
import com.stackflow.orderlab.order.dto.OrderResponse;
import com.stackflow.orderlab.order.dto.ProductResponse;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class OrderService {

	private static final Map<Long, Order> ORDERS = Map.of(
		2001L, new Order(2001L, 1001L),
		2002L, new Order(2002L, 1002L)
	);

	private final ProductClient productClient;

	public OrderService(ProductClient productClient) {
		this.productClient = productClient;
	}

	public OrderResponse getOrder(long orderId) {
		Order order = findOrder(orderId);
		ProductResponse product = productClient.getProduct(order.productId());
		return new OrderResponse(order.id(), "CONFIRMED", product);
	}

	public void triggerProductTimeout(long orderId) {
		Order order = findOrder(orderId);
		productClient.triggerDatabaseTimeout(order.productId());
	}

	private Order findOrder(long orderId) {
		Order order = ORDERS.get(orderId);
		if (order == null) {
			throw new OrderNotFoundException(orderId);
		}
		return order;
	}
}
