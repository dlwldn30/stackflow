package com.stackflow.backend.service;

public class DatabaseTimeoutException extends RuntimeException {

	public DatabaseTimeoutException(String message) {
		super(message);
	}
}
