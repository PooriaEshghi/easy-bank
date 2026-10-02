package com.eazybytes.cards.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class DomainEvent {

    private String eventId;
    private String eventType;
    private String mobileNumber;
    private String occurredAt;
    private String correlationId;

    public static DomainEvent create(String eventType, String mobileNumber, String correlationId) {
        return new DomainEvent(
                UUID.randomUUID().toString(),
                eventType,
                mobileNumber,
                OffsetDateTime.now(ZoneOffset.UTC).toString(),
                correlationId
        );
    }
}
