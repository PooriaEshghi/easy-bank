package com.eazybytes.accounts.messaging;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class CorrelationIdsTest {

	@AfterEach
	void clear() {
		CorrelationIds.clear();
	}

	@Test
	void storesTheIdOnTheCurrentThread() {
		assertNull(CorrelationIds.get());

		CorrelationIds.set("abc");

		assertEquals("abc", CorrelationIds.get());
		assertEquals("eazybank-correlation-id", CorrelationIds.HEADER);
	}

	@Test
	void clearRemovesTheId() {
		CorrelationIds.set("abc");

		CorrelationIds.clear();

		assertNull(CorrelationIds.get());
	}

}
