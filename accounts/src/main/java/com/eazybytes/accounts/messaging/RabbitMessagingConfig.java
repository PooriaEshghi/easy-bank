package com.eazybytes.accounts.messaging;

import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.support.converter.JacksonJsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnProperty(name = "eazybank.messaging.broker", havingValue = "rabbit")
public class RabbitMessagingConfig {

    @Bean
    TopicExchange eazybankEventsExchange() {
        return new TopicExchange(RabbitNames.EXCHANGE, true, false);
    }

    @Bean
    TopicExchange eazybankEventsDlx() {
        return new TopicExchange(RabbitNames.DLX, true, false);
    }

    @Bean
    MessageConverter jacksonMessageConverter() {
        return new JacksonJsonMessageConverter();
    }
}
