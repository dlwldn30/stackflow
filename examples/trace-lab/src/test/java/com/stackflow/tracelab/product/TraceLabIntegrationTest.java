package com.stackflow.tracelab.product;

import static org.assertj.core.api.Assertions.assertThat;

import com.stackflow.tracelab.product.dto.ProductSource;
import com.stackflow.tracelab.product.dto.ProductTraceResponse;
import com.stackflow.tracelab.product.service.ProductService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import java.util.UUID;

@Testcontainers(disabledWithoutDocker = true)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@SpringBootTest(
	webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
	properties = "spring.jpa.hibernate.ddl-auto=create"
)
class TraceLabIntegrationTest {

	@Container
	static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"))
		.withDatabaseName("trace_lab")
		.withUsername("trace_lab")
		.withPassword(UUID.randomUUID().toString());

	@Container
	static final GenericContainer<?> REDIS = new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
		.withExposedPorts(6379);

	@DynamicPropertySource
	static void registerProperties(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::getUsername);
		registry.add("spring.datasource.password", POSTGRES::getPassword);
		registry.add("spring.data.redis.host", REDIS::getHost);
		registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
	}

	@Autowired
	ProductService productService;

	@LocalServerPort
	int serverPort;

	@BeforeEach
	void clearProductCache() {
		productService.evictProductCache(1001L);
	}

	@Test
	@Order(1)
	void loadsFromPostgresqlAndThenFromRedis() {
		ProductTraceResponse first = productService.getProduct(1001L);
		ProductTraceResponse second = productService.getProduct(1001L);

		assertThat(first.source()).isEqualTo(ProductSource.DATABASE);
		assertThat(second.source()).isEqualTo(ProductSource.CACHE);
	}

	@Test
	@Order(2)
	void cacheEvictionForcesAnotherDatabaseLookup() {
		productService.getProduct(1001L);
		productService.evictProductCache(1001L);

		ProductTraceResponse response = productService.getProduct(1001L);

		assertThat(response.source()).isEqualTo(ProductSource.DATABASE);
	}

	@Test
	@Order(3)
	void deliberateDatabaseFailureReturnsHttp500() throws Exception {
		HttpRequest request = HttpRequest.newBuilder()
			.uri(URI.create("http://localhost:" + serverPort + "/lab/products/database-error"))
			.GET()
			.build();

		HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());

		assertThat(response.statusCode()).isEqualTo(500);
		assertThat(response.body()).contains("\"code\":\"DATABASE_ERROR\"");
	}

	@Test
	@Order(4)
	void actualPostgresqlQueryTimeoutReturnsHttp504() throws Exception {
		long startedAt = System.nanoTime();
		HttpRequest request = HttpRequest.newBuilder()
			.uri(URI.create("http://localhost:" + serverPort + "/lab/products/1001/database-timeout"))
			.GET()
			.build();

		HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
		long durationMs = (System.nanoTime() - startedAt) / 1_000_000;

		assertThat(response.statusCode()).isEqualTo(504);
		assertThat(response.body()).contains("\"code\":\"DATABASE_TIMEOUT\"");
		assertThat(durationMs).isBetween(700L, 5_000L);
	}

	@Test
	@Order(5)
	void fallsBackToPostgresqlWhenRedisStops() {
		REDIS.getDockerClient().stopContainerCmd(REDIS.getContainerId()).exec();

		ProductTraceResponse response = productService.getProduct(1002L);

		assertThat(response.source()).isEqualTo(ProductSource.DATABASE_FALLBACK);
	}
}
