package com.stackflow.orderlab.order.dto;

public record OrderErrorResponse(String code, String message, Integer downstreamStatus) {
}
