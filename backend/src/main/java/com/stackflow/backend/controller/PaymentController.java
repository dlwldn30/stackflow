package com.stackflow.backend.controller;

import com.stackflow.backend.service.PaymentUseCase;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/payments")
public class PaymentController {

	private final PaymentUseCase paymentUseCase;

	public PaymentController(PaymentUseCase paymentUseCase) {
		this.paymentUseCase = paymentUseCase;
	}

	@GetMapping
	public List<Map<String, Object>> listPayments() {
		return paymentUseCase.listPayments();
	}

	@PostMapping("/quote")
	public Map<String, Object> createPaymentQuote() {
		return paymentUseCase.createPaymentQuote();
	}
}
