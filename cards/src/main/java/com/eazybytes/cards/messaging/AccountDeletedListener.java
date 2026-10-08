package com.eazybytes.cards.messaging;

import com.eazybytes.cards.dto.DomainEvent;
import com.eazybytes.cards.exception.ResourceNotFoundException;
import com.eazybytes.cards.service.ICardsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "eazybank.messaging.broker", havingValue = "rabbit")
public class AccountDeletedListener {

    private static final Logger log = LoggerFactory.getLogger(AccountDeletedListener.class);

    private final ICardsService service;

    public AccountDeletedListener(ICardsService service) {
        this.service = service;
    }

    @RabbitListener(queues = "cards.accounts")
    public void onAccountDeleted(DomainEvent event) {
        if (event == null || event.getMobileNumber() == null || !"accounts.deleted".equals(event.getEventType())) {
            return;
        }
        CorrelationIds.set(event.getCorrelationId());
        try {
            service.deleteCard(event.getMobileNumber());
        } catch (ResourceNotFoundException ex) {
            log.info("Carta assente per {} correlation {}", event.getMobileNumber(), event.getCorrelationId());
        } catch (RuntimeException ex) {
            log.warn("Cancellazione non riuscita per {} correlation {}",
                    event.getMobileNumber(), event.getCorrelationId(), ex);
            throw ex;
        } finally {
            CorrelationIds.clear();
        }
    }
}
