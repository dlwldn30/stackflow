package com.stackflow.backend.service;

import com.stackflow.backend.domain.ComponentType;
import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.Product;
import com.stackflow.backend.domain.ScenarioMode;
import com.stackflow.backend.store.ProductCatalogStore;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class ProductRepositoryService {

	private final ProductCatalogStore productCatalogStore;

	public ProductRepositoryService(ProductCatalogStore productCatalogStore) {
		this.productCatalogStore = productCatalogStore;
	}

	public Product findProduct(Long productId, ScenarioMode scenarioMode, TraceSession traceSession) {
		TraceSession.TraceStep repositoryStep = traceSession.startStep(
			ComponentType.REPOSITORY,
			"ProductRepository.findProduct",
			Map.of("productId", productId.toString())
		);
		TraceSession.TraceStep mysqlStep = traceSession.startStep(
			ComponentType.MYSQL,
			"mysql.select.product",
			Map.of("productId", productId.toString())
		);

		try {
			if (scenarioMode == ScenarioMode.DB_TIMEOUT) {
				traceSession.finishStep(
					mysqlStep,
					EventStatus.TIMEOUT,
					"DatabaseTimeoutException",
					"Simulated MySQL timeout while loading product.",
					Map.of("latencyProfile", "slow-query")
				);
				traceSession.finishStep(
					repositoryStep,
					EventStatus.TIMEOUT,
					"DatabaseTimeoutException",
					"Repository could not complete because MySQL timed out.",
					Map.of()
				);
				throw new DatabaseTimeoutException("Simulated MySQL timeout while loading product.");
			}

			Product product = productCatalogStore.findById(productId);
			if (product == null) {
				traceSession.finishStep(
					mysqlStep,
					EventStatus.ERROR,
					"ProductNotFoundException",
					"Requested product does not exist.",
					Map.of()
				);
				traceSession.finishStep(
					repositoryStep,
					EventStatus.ERROR,
					"ProductNotFoundException",
					"Repository lookup failed because the product was missing.",
					Map.of()
				);
				throw new ProductNotFoundException(productId);
			}

			traceSession.finishStep(
				mysqlStep,
				EventStatus.SUCCESS,
				null,
				null,
				Map.of("rows", "1")
			);
			traceSession.finishStep(
				repositoryStep,
				EventStatus.SUCCESS,
				null,
				null,
				Map.of("source", "catalog-store")
			);
			return product;
		} catch (RuntimeException exception) {
			throw exception;
		}
	}
}
