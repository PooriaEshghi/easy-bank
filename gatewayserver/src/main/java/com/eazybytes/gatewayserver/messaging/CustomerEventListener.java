package com.eazybytes.gatewayserver.messaging;

import com.eazybytes.gatewayserver.dto.DomainEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "eazybank.messaging.broker", havingValue = "rabbit")
public class CustomerEventListener {

    private static final Logger log = LoggerFactory.getLogger(CustomerEventListener.class);

    private final CustomerEventHub customerEventHub;

    public CustomerEventListener(CustomerEventHub customerEventHub) {
        this.customerEventHub = customerEventHub;
    }

    @RabbitListener(queues = "#{gatewayEventsQueue.name}")
    public void onEvent(DomainEvent event) {
        try {
            customerEventHub.emit(event);
        } catch (RuntimeException ex) {
            String mobileNumber = event == null ? "" : event.getMobileNumber();
            String correlationId = event == null ? "" : event.getCorrelationId();
            log.warn("Evento non consegnato allo stream per {} correlation {}", mobileNumber, correlationId, ex);
        }
    }
}
