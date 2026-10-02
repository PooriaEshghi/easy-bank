package com.eazybytes.gatewayserver.messaging;

import com.eazybytes.gatewayserver.dto.DomainEvent;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;

@RestController
@ConditionalOnProperty(name = "eazybank.messaging.broker", havingValue = "rabbit")
public class CustomerEventsController {

    private final CustomerEventHub customerEventHub;

    public CustomerEventsController(CustomerEventHub customerEventHub) {
        this.customerEventHub = customerEventHub;
    }

    @GetMapping(path = "/eazybank/events/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<DomainEvent>> stream(@RequestParam String mobileNumber) {
        if (mobileNumber == null || !mobileNumber.matches("[0-9]{10}")) {
            return Flux.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mobile number must be 10 digits"));
        }
        return customerEventHub.subscribe(mobileNumber);
    }
}
