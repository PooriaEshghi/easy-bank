package com.eazybytes.message.functions;

import com.eazybytes.message.dto.AccountsMsgDto;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

class MessageFunctionsTest {

	private final AccountsMsgDto message = new AccountsMsgDto(
			1414941474L, "Nuovo cliente", "kafka.ui@eazybank.com", "4902847209");

	@Test
	void emailReturnsTheSameMessage() {
		AccountsMsgDto sent = new MessageFunctions().email().apply(message);

		assertSame(message, sent);
	}

	@Test
	void smsReturnsTheAccountNumber() {
		Long accountNumber = new MessageFunctions().sms().apply(message);

		assertEquals(1414941474L, accountNumber);
	}

}
