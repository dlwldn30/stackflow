package com.stackflow.backend.service;

import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class PaymentUseCase {

	private final PaymentGateway paymentGateway;

	public PaymentUseCase(PaymentGateway paymentGateway) {
		this.paymentGateway = paymentGateway;
	}

	public List<Map<String, Object>> listPayments() {
		return paymentGateway.fetchPayments();
	}

	public Map<String, Object> createPaymentQuote() {
		return paymentGateway.requestQuote();
	}
}
