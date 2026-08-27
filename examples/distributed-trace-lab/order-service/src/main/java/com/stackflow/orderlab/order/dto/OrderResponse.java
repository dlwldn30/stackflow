package com.stackflow.orderlab.order.dto;

public record OrderResponse(long orderId, String status, ProductResponse product) {
}
