package com.stackflow.backend.service;

import com.stackflow.backend.domain.ComponentType;
import com.stackflow.backend.domain.EventStatus;
import com.stackflow.backend.domain.Product;
import com.stackflow.backend.domain.ScenarioMode;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class ProductService {

	private final ProductCacheService productCacheService;
	private final ProductRepositoryService productRepositoryService;

	public ProductService(ProductCacheService productCacheService, ProductRepositoryService productRepositoryService) {
		this.productCacheService = productCacheService;
		this.productRepositoryService = productRepositoryService;
	}

	public ProductLookupResult lookupProduct(Long productId, ScenarioMode scenarioMode, TraceSession traceSession) {
		TraceSession.TraceStep serviceStep = traceSession.startStep(
			ComponentType.SERVICE,
			"ProductService.lookupProduct",
			Map.of("productId", productId.toString(), "scenario", scenarioMode.apiValue())
		);

		try {
			if (scenarioMode == ScenarioMode.SERVICE_ERROR) {
				throw new ServiceProcessingException("Simulated service-layer exception.");
			}

			TraceSession.TraceStep redisLookup = traceSession.startStep(
				ComponentType.REDIS,
				"redis.lookup.product",
				Map.of("productId", productId.toString())
			);

			boolean redisUnavailable = scenarioMode == ScenarioMode.REDIS_DOWN;
			boolean forceDatabasePath = scenarioMode == ScenarioMode.DB_TIMEOUT;
			if (redisUnavailable) {
				traceSession.finishStep(
					redisLookup,
					EventStatus.WARNING,
					"RedisUnavailableException",
					"Simulated Redis outage. Falling back to MySQL.",
					Map.of("cache", "unavailable")
				);
			} else if (forceDatabasePath) {
				traceSession.finishStep(
					redisLookup,
					EventStatus.WARNING,
					null,
					null,
					Map.of("cache", "bypassed", "reason", "db-timeout-scenario")
				);
			} else {
				Product cached = productCacheService.get(productId);
				if (cached != null) {
					traceSession.finishStep(
						redisLookup,
						EventStatus.SUCCESS,
						null,
						null,
						Map.of("cache", "hit")
					);
					traceSession.finishStep(
						serviceStep,
						EventStatus.SUCCESS,
						null,
						null,
						Map.of("cacheStatus", "hit")
					);
					return new ProductLookupResult(cached, EventStatus.SUCCESS, "hit");
				}
				traceSession.finishStep(
					redisLookup,
					EventStatus.WARNING,
					null,
					null,
					Map.of("cache", "miss")
				);
			}

			Product product = productRepositoryService.findProduct(productId, scenarioMode, traceSession);

			if (!redisUnavailable) {
				TraceSession.TraceStep redisSave = traceSession.startStep(
					ComponentType.REDIS,
					"redis.store.product",
					Map.of("productId", productId.toString())
				);
				productCacheService.put(product);
				traceSession.finishStep(
					redisSave,
					EventStatus.SUCCESS,
					null,
					null,
					Map.of("cache", "store")
				);
			}

			EventStatus resultStatus = redisUnavailable ? EventStatus.WARNING : EventStatus.SUCCESS;
			traceSession.finishStep(
				serviceStep,
				resultStatus,
				null,
				null,
				Map.of("cacheStatus", redisUnavailable ? "fallback" : "miss")
			);
			return new ProductLookupResult(product, resultStatus, redisUnavailable ? "fallback" : "miss");
		} catch (ProductNotFoundException | DatabaseTimeoutException | ServiceProcessingException exception) {
			traceSession.finishStep(
				serviceStep,
				exception instanceof DatabaseTimeoutException ? EventStatus.TIMEOUT : EventStatus.ERROR,
				exception.getClass().getSimpleName(),
				exception.getMessage(),
				Map.of()
			);
			throw exception;
		} catch (RuntimeException exception) {
			traceSession.finishStep(
				serviceStep,
				EventStatus.ERROR,
				exception.getClass().getSimpleName(),
				exception.getMessage(),
				Map.of()
			);
			throw exception;
		}
	}

	public List<Product> listProducts(ScenarioMode scenarioMode, TraceSession traceSession) {
		TraceSession.TraceStep serviceStep = traceSession.startStep(
			ComponentType.SERVICE,
			"ProductService.listProducts",
			Map.of("scenario", scenarioMode.apiValue())
		);

		try {
			if (scenarioMode == ScenarioMode.SERVICE_ERROR) {
				throw new ServiceProcessingException("Simulated service-layer exception while listing products.");
			}

			List<Product> products = productRepositoryService.findProducts(scenarioMode, traceSession);
			traceSession.finishStep(
				serviceStep,
				EventStatus.SUCCESS,
				null,
				null,
				Map.of("count", Integer.toString(products.size()))
			);
			return products;
		} catch (ProductNotFoundException | DatabaseTimeoutException | ServiceProcessingException exception) {
			traceSession.finishStep(
				serviceStep,
				exception instanceof DatabaseTimeoutException ? EventStatus.TIMEOUT : EventStatus.ERROR,
				exception.getClass().getSimpleName(),
				exception.getMessage(),
				Map.of()
			);
			throw exception;
		} catch (RuntimeException exception) {
			traceSession.finishStep(
				serviceStep,
				EventStatus.ERROR,
				exception.getClass().getSimpleName(),
				exception.getMessage(),
				Map.of()
			);
			throw exception;
		}
	}

	public int getProductStock(Long productId, ScenarioMode scenarioMode, TraceSession traceSession) {
		TraceSession.TraceStep serviceStep = traceSession.startStep(
			ComponentType.SERVICE,
			"ProductService.getProductStock",
			Map.of("productId", productId.toString(), "scenario", scenarioMode.apiValue())
		);

		try {
			if (scenarioMode == ScenarioMode.SERVICE_ERROR) {
				throw new ServiceProcessingException("Simulated service-layer exception while loading product stock.");
			}

			int stock = productRepositoryService.findProductStock(productId, scenarioMode, traceSession);
			traceSession.finishStep(
				serviceStep,
				EventStatus.SUCCESS,
				null,
				null,
				Map.of("stock", Integer.toString(stock))
			);
			return stock;
		} catch (ProductNotFoundException | DatabaseTimeoutException | ServiceProcessingException exception) {
			traceSession.finishStep(
				serviceStep,
				exception instanceof DatabaseTimeoutException ? EventStatus.TIMEOUT : EventStatus.ERROR,
				exception.getClass().getSimpleName(),
				exception.getMessage(),
				Map.of()
			);
			throw exception;
		} catch (RuntimeException exception) {
			traceSession.finishStep(
				serviceStep,
				EventStatus.ERROR,
				exception.getClass().getSimpleName(),
				exception.getMessage(),
				Map.of()
			);
			throw exception;
		}
	}

	public ProductLookupResult refreshProductCache(Long productId, ScenarioMode scenarioMode, TraceSession traceSession) {
		TraceSession.TraceStep serviceStep = traceSession.startStep(
			ComponentType.SERVICE,
			"ProductService.refreshProductCache",
			Map.of("productId", productId.toString(), "scenario", scenarioMode.apiValue())
		);

		try {
			if (scenarioMode == ScenarioMode.SERVICE_ERROR) {
				throw new ServiceProcessingException("Simulated service-layer exception while refreshing product cache.");
			}

			Product product = productRepositoryService.findProduct(productId, scenarioMode, traceSession);
			TraceSession.TraceStep redisSave = traceSession.startStep(
				ComponentType.REDIS,
				"redis.refresh.product",
				Map.of("productId", productId.toString())
			);
			productCacheService.put(product);
			traceSession.finishStep(
				redisSave,
				EventStatus.SUCCESS,
				null,
				null,
				Map.of("cache", "refreshed")
			);
			traceSession.finishStep(
				serviceStep,
				EventStatus.SUCCESS,
				null,
				null,
				Map.of("cacheStatus", "refreshed")
			);
			return new ProductLookupResult(product, EventStatus.SUCCESS, "refreshed");
		} catch (ProductNotFoundException | DatabaseTimeoutException | ServiceProcessingException exception) {
			traceSession.finishStep(
				serviceStep,
				exception instanceof DatabaseTimeoutException ? EventStatus.TIMEOUT : EventStatus.ERROR,
				exception.getClass().getSimpleName(),
				exception.getMessage(),
				Map.of()
			);
			throw exception;
		} catch (RuntimeException exception) {
			traceSession.finishStep(
				serviceStep,
				EventStatus.ERROR,
				exception.getClass().getSimpleName(),
				exception.getMessage(),
				Map.of()
			);
			throw exception;
		}
	}
}
