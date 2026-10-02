package com.eazybytes.loans.messaging;

public final class CorrelationIds {

    public static final String HEADER = "eazybank-correlation-id";

    private static final ThreadLocal<String> CURRENT = new ThreadLocal<>();

    private CorrelationIds() {
    }

    public static void set(String correlationId) {
        CURRENT.set(correlationId);
    }

    public static String get() {
        return CURRENT.get();
    }

    public static void clear() {
        CURRENT.remove();
    }
}
