package com.eazybytes.accounts.messaging;

public interface DomainEventPublisher {

    void publish(String eventType, String mobileNumber);
}
