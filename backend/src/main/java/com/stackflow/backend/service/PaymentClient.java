package com.stackflow.backend.service;

import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class PaymentClient {

	public List<Map<String, Object>> readPayments() {
		return List.of(
			Map.of("paymentId", "pay-100", "provider", "Stripe", "status", "READY"),
			Map.of("paymentId", "pay-101", "provider", "Adyen", "status", "SETTLED")
		);
	}

	public Map<String, Object> fetchQuote() {
		return Map.of(
			"quoteId", "quote-200",
			"provider", "Stripe",
			"currency", "USD",
			"amount", 14900
		);
	}
}
