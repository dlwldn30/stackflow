package com.stackflow.backend.domain;

public enum ScenarioMode {
	NORMAL,
	REDIS_DOWN,
	DB_TIMEOUT,
	SERVICE_ERROR;

	public static ScenarioMode from(String value) {
		if (value == null || value.isBlank()) {
			return NORMAL;
		}

		return switch (value.trim().toLowerCase()) {
			case "redis-down" -> REDIS_DOWN;
			case "db-timeout" -> DB_TIMEOUT;
			case "service-error" -> SERVICE_ERROR;
			default -> NORMAL;
		};
	}

	public String apiValue() {
		return name().toLowerCase().replace('_', '-');
	}
}
