package com.eazybytes.loans.messaging;

import com.eazybytes.loans.dto.DomainEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Component
@ConditionalOnProperty(name = "eazybank.messaging.broker", havingValue = "rabbit")
public class RabbitDomainEventPublisher implements DomainEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(RabbitDomainEventPublisher.class);

    private final RabbitTemplate rabbitTemplate;

    public RabbitDomainEventPublisher(RabbitTemplate rabbitTemplate) {
        this.rabbitTemplate = rabbitTemplate;
    }

    @Override
    public void publish(String eventType, String mobileNumber) {
        String correlationId = CorrelationIds.get();
        if (correlationId == null || correlationId.isBlank()) {
            correlationId = UUID.randomUUID().toString();
        }
        DomainEvent event = DomainEvent.create(eventType, mobileNumber, correlationId);
        CorrelationData confirm = new CorrelationData(event.getEventId());
        try {
            rabbitTemplate.convertAndSend(RabbitNames.EXCHANGE, eventType, event, message -> {
                message.getMessageProperties().setHeader(CorrelationIds.HEADER, event.getCorrelationId());
                message.getMessageProperties().setMessageId(event.getEventId());
                return message;
            }, confirm);
            CorrelationData.Confirm result = confirm.getFuture().get(2, TimeUnit.SECONDS);
            if (!result.isAck()) {
                log.warn("RabbitMQ ha rifiutato {} per {} correlation {}", eventType, mobileNumber, correlationId);
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            log.warn("Pubblicazione {} interrotta per {} correlation {}", eventType, mobileNumber, correlationId, ex);
        } catch (Exception ex) {
            log.warn("Pubblicazione {} non confermata per {} correlation {}", eventType, mobileNumber, correlationId, ex);
        }
    }
}
