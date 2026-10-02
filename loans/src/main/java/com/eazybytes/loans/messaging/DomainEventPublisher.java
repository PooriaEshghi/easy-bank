package com.eazybytes.loans.messaging;

public interface DomainEventPublisher {

    void publish(String eventType, String mobileNumber);
}
