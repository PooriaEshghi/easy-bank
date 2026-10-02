package com.eazybytes.loans.messaging;

import com.eazybytes.loans.dto.DomainEvent;
import com.eazybytes.loans.service.ILoansService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "eazybank.messaging.broker", havingValue = "rabbit")
public class AccountDeletedListener {

    private static final Logger log = LoggerFactory.getLogger(AccountDeletedListener.class);

    private final ILoansService service;
    private final DomainEventPublisher domainEventPublisher;

    public AccountDeletedListener(ILoansService service, DomainEventPublisher domainEventPublisher) {
        this.service = service;
        this.domainEventPublisher = domainEventPublisher;
    }

    @RabbitListener(queues = "loans.accounts")
    public void onAccountDeleted(DomainEvent event) {
        if (event == null || !"accounts.deleted".equals(event.getEventType())) {
            return;
        }
        try {
            service.deleteLoan(event.getMobileNumber());
            CorrelationIds.set(event.getCorrelationId());
            try {
                domainEventPublisher.publish("loans.deleted", event.getMobileNumber());
            } finally {
                CorrelationIds.clear();
            }
        } catch (RuntimeException ex) {
            log.warn("Cancellazione non riuscita per {} correlation {}",
                    event.getMobileNumber(), event.getCorrelationId(), ex);
            throw ex;
        }
    }
}
