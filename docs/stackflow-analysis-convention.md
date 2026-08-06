# StackFlow Analysis Convention

Date: 2026-08-06
Status: Active

## Purpose

This document defines the Spring Boot code shapes that StackFlow can analyze most clearly without AI assistance.

The goal is not to force one coding style across every project.
The goal is to make the project map, API catalog, and estimated request flow easier to detect and explain with deterministic rules.

## Core Principle

StackFlow currently reads code through static Spring signals.

Main signals:

- `@RestController`, `@RequestMapping`, `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, `@PatchMapping`
- Class names such as `Controller`, `Service`, `Repository`, `Store`, and `Cache`
- Package structure
- Build and configuration files such as `build.gradle`, `pom.xml`, and `application.properties`

Because of this, projects are easier to analyze when roles are explicit in code and package names.

## Recommended Layer Shape

Preferred request path:

```text
Client
-> Controller
-> Service
-> Cache (optional)
-> Repository or Store
-> Database or external infrastructure
-> Response
```

Why:

- The entry point is clear.
- Business logic stays separate from transport code.
- Data and cache boundaries are visible in the map.
- The estimated flow can stay simple and explainable.

## Naming Rules

Use role-oriented class names whenever possible.

Recommended:

- `ProductController`
- `ProductService`
- `ProductRepository`
- `ProductStore`
- `ProductCacheService`
- `ProductClient`

Avoid overly generic names when the class is part of a visible request flow.

Less helpful for static analysis:

- `ProductManager`
- `CommonHelper`
- `Executor`
- `Processor`

Reason:

- `Manager`, `Helper`, and similar names do not expose the boundary clearly.
- StackFlow can detect generic classes, but it cannot explain their role as reliably.

## Controller Rules

Controllers should stay as thin request entry points.

Recommended pattern:

```java
@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @GetMapping("/{productId}")
    public ProductResponse getProduct(@PathVariable Long productId) {
        return productService.getProduct(productId);
    }
}
```

Why:

- StackFlow can detect the API path, HTTP method, handler, and source location cleanly.
- The next hop in the estimated flow is easy to infer.

## Service Rules

Services should represent use cases, not miscellaneous utility containers.

Recommended:

- `getProduct`
- `listProducts`
- `refreshProductCache`

Prefer one public method per user-visible request path where possible.

Why:

- The API catalog reads more naturally.
- The estimated flow can map handler to service responsibility with fewer guesses.

## Repository and Store Rules

Use `Repository` or `Store` when the class is the data access boundary.

Recommended:

- `ProductRepository`
- `OrderStore`

Why:

- StackFlow can classify persistence-related layers reliably.
- The map can separate business logic from storage logic.

## Cache Rules

If a class is responsible for cache reads or writes, make that visible in the name.

Recommended:

- `ProductCacheService`
- `InventoryCache`

Why:

- Static analysis can mark cache boundaries without pretending to know every runtime detail.
- The estimated flow can explain read-through or write-through patterns more clearly.

## Package Rules

Prefer package layout that matches request-flow roles.

Recommended:

```text
com.example.product
  controller/
  service/
  repository/
  cache/
  dto/
```

Why:

- Package boundaries reinforce class naming.
- Domain grouping becomes more stable.

## Configuration Rules

If infrastructure is important to understanding the project, keep configuration conventional and discoverable.

Helpful files:

- `build.gradle`
- `build.gradle.kts`
- `pom.xml`
- `src/main/resources/application.properties`
- `src/main/resources/application.yml`

Why:

- StackFlow can use these files as evidence when labeling infrastructure such as Redis or MySQL.
- Without configuration evidence, StackFlow should stay conservative and show broader labels such as `Cache` or `Persistence`.

## Example Shape

Example package:

```text
com.example.product
  controller/ProductController.java
  service/ProductService.java
  repository/ProductRepository.java
  cache/ProductCacheService.java
  dto/ProductResponse.java
```

Example estimated flow:

```text
GET /api/products/{productId}
-> ProductController.getProduct
-> ProductService.getProduct
-> ProductCacheService.find
-> ProductRepository.findProduct
-> ProductCacheService.save
-> Response
```

## Known Limits

Even with these conventions, StackFlow still has limits.

- It does not prove the real runtime path for external projects.
- It does not fully understand custom architectures with names like `UseCase`, `Gateway`, or `Manager` unless extra rules are added.
- It does not fully analyze reflection-heavy, event-driven, or dynamic proxy-heavy code paths.

Because of this, static analysis results must continue to be treated as `estimated` unless runtime instrumentation is connected.

## Current Recommendation

Before adding AI summaries or explanations, prioritize these in order:

1. Make Spring request-flow roles explicit in code.
2. Keep package and class naming predictable.
3. Keep infrastructure evidence in standard config files.
4. Use StackFlow to visualize the deterministic structure first.
5. Add AI later only as an explanation layer on top of reliable project facts.
