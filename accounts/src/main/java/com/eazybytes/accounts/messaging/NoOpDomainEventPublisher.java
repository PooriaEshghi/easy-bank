package com.eazybytes.accounts.messaging;

import org.springframework.stereotype.Component;

@Component
public class NoOpDomainEventPublisher implements DomainEventPublisher {

    @Override
    public void publish(String eventType, String mobileNumber) {
    }
}
