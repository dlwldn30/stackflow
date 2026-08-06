package com.stackflow.backend.service;

import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class PaymentGateway {

	private final PaymentClient paymentClient;

	public PaymentGateway(PaymentClient paymentClient) {
		this.paymentClient = paymentClient;
	}

	public List<Map<String, Object>> fetchPayments() {
		return paymentClient.readPayments();
	}

	public Map<String, Object> requestQuote() {
		return paymentClient.fetchQuote();
	}
}
