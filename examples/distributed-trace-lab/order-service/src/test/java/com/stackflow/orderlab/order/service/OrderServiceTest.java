package com.stackflow.orderlab.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.stackflow.orderlab.order.client.ProductClient;
import com.stackflow.orderlab.order.dto.ProductResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

	@Mock
	ProductClient productClient;

	@Test
	void mapsOrderToProductAndReturnsConfirmedResponse() {
		when(productClient.getProduct(1001L))
			.thenReturn(new ProductResponse(1001L, "Trace Keyboard", 129000L, "DATABASE"));
		OrderService orderService = new OrderService(productClient);

		var response = orderService.getOrder(2001L);

		assertThat(response.orderId()).isEqualTo(2001L);
		assertThat(response.status()).isEqualTo("CONFIRMED");
		assertThat(response.product().id()).isEqualTo(1001L);
	}

	@Test
	void callsProductTimeoutEndpointForMappedProduct() {
		OrderService orderService = new OrderService(productClient);

		orderService.triggerProductTimeout(2002L);

		verify(productClient).triggerDatabaseTimeout(1002L);
	}

	@Test
	void rejectsUnknownOrderBeforeCallingProduct() {
		OrderService orderService = new OrderService(productClient);

		assertThatThrownBy(() -> orderService.getOrder(9999L))
			.isInstanceOf(OrderNotFoundException.class);
		verifyNoInteractions(productClient);
	}
}
