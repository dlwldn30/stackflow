package com.stackflow.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(excludeName = {
	"org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration",
	"org.springframework.boot.data.jpa.autoconfigure.JpaRepositoriesAutoConfiguration",
	"org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
	"org.springframework.boot.data.redis.autoconfigure.RedisAutoConfiguration",
	"org.springframework.boot.data.redis.autoconfigure.RedisRepositoriesAutoConfiguration"
})
public class BackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(BackendApplication.class, args);
	}

}
