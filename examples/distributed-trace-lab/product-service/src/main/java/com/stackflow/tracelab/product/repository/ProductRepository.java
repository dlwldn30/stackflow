package com.stackflow.tracelab.product.repository;

import com.stackflow.tracelab.product.domain.Product;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductRepository extends JpaRepository<Product, Long> {
}
