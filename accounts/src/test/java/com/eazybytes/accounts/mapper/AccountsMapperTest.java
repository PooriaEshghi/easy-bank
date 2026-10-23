package com.eazybytes.accounts.mapper;

import com.eazybytes.accounts.dto.AccountsDto;
import com.eazybytes.accounts.entity.Accounts;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

class AccountsMapperTest {

	@Test
	void copiesAccountFieldsOntoTheDto() {
		Accounts account = new Accounts();
		account.setCustomerId(7L);
		account.setAccountNumber(3454433243L);
		account.setAccountType("Savings");
		account.setBranchAddress("123 NewYork");
		account.setCommunicationSw(Boolean.TRUE);
		AccountsDto dto = new AccountsDto();

		AccountsDto mapped = AccountsMapper.mapToAccountsDto(account, dto);

		assertSame(dto, mapped);
		assertEquals(3454433243L, mapped.getAccountNumber());
		assertEquals("Savings", mapped.getAccountType());
		assertEquals("123 NewYork", mapped.getBranchAddress());
	}

	@Test
	void copiesAccountFieldsOntoTheEntity() {
		AccountsDto dto = new AccountsDto();
		dto.setAccountNumber(3454433243L);
		dto.setAccountType("Savings");
		dto.setBranchAddress("123 NewYork");
		Accounts account = new Accounts();
		account.setCustomerId(7L);
		account.setCommunicationSw(Boolean.TRUE);

		Accounts mapped = AccountsMapper.mapToAccounts(dto, account);

		assertSame(account, mapped);
		assertEquals(3454433243L, mapped.getAccountNumber());
		assertEquals("Savings", mapped.getAccountType());
		assertEquals("123 NewYork", mapped.getBranchAddress());
		assertEquals(7L, mapped.getCustomerId());
		assertEquals(Boolean.TRUE, mapped.getCommunicationSw());
	}

	@Test
	void leavesMissingFieldsEmpty() {
		AccountsDto mapped = AccountsMapper.mapToAccountsDto(new Accounts(), new AccountsDto());

		assertNull(mapped.getAccountNumber());
		assertNull(mapped.getAccountType());
		assertNull(mapped.getBranchAddress());
	}

}
