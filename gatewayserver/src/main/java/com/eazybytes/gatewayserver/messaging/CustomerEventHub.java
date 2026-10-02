package com.eazybytes.gatewayserver.messaging;

import com.eazybytes.gatewayserver.dto.DomainEvent;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;

@Component
public class CustomerEventHub {

    private final Sinks.Many<DomainEvent> events = Sinks.many().multicast().directBestEffort();

    public void emit(DomainEvent event) {
        if (event == null || event.getMobileNumber() == null) {
            return;
        }
        events.tryEmitNext(event);
    }

    public Flux<ServerSentEvent<DomainEvent>> subscribe(String mobileNumber) {
        return events.asFlux()
                .filter(event -> mobileNumber.equals(event.getMobileNumber()))
                .map(event -> ServerSentEvent.builder(event)
                        .id(event.getEventId())
                        .event(event.getEventType())
                        .build());
    }
}
