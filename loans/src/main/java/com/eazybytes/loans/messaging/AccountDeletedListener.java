package com.eazybytes.loans.messaging;

import com.eazybytes.loans.dto.DomainEvent;
import com.eazybytes.loans.exception.ResourceNotFoundException;
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

    public AccountDeletedListener(ILoansService service) {
        this.service = service;
    }

    @RabbitListener(queues = "loans.accounts")
    public void onAccountDeleted(DomainEvent event) {
        if (event == null || event.getMobileNumber() == null || !"accounts.deleted".equals(event.getEventType())) {
            return;
        }
        CorrelationIds.set(event.getCorrelationId());
        try {
            service.deleteLoan(event.getMobileNumber());
        } catch (ResourceNotFoundException ex) {
            log.info("Prestito assente per {} correlation {}", event.getMobileNumber(), event.getCorrelationId());
        } catch (RuntimeException ex) {
            log.warn("Cancellazione non riuscita per {} correlation {}",
                    event.getMobileNumber(), event.getCorrelationId(), ex);
            throw ex;
        } finally {
            CorrelationIds.clear();
        }
    }
}
