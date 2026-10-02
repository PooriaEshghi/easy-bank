package com.eazybytes.loans.messaging;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "eazybank.messaging.broker", havingValue = "off", matchIfMissing = true)
public class NoOpDomainEventPublisher implements DomainEventPublisher {

    @Override
    public void publish(String eventType, String mobileNumber) {
    }
}
