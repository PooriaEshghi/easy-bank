package com.eazybytes.cards.messaging;

public interface DomainEventPublisher {

    void publish(String eventType, String mobileNumber);
}
