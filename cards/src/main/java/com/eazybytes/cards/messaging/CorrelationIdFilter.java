package com.eazybytes.cards.messaging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationIdFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String correlationId = request.getHeader(CorrelationIds.HEADER);
        if (correlationId != null && !correlationId.isBlank()) {
            CorrelationIds.set(correlationId);
        }
        try {
            filterChain.doFilter(request, response);
        } finally {
            CorrelationIds.clear();
        }
    }
}
