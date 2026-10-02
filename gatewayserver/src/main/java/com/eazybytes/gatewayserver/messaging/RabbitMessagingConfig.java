package com.eazybytes.gatewayserver.messaging;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.support.converter.JacksonJsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.beans.factory.annotation.Value;
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
    Queue gatewayEventsQueue(@Value("${eazybank.instance-id}") String instanceId) {
        return QueueBuilder.nonDurable("gatewayserver.events." + instanceId)
                .autoDelete()
                .build();
    }

    @Bean
    Binding gatewayAccountsBinding(Queue gatewayEventsQueue, TopicExchange eazybankEventsExchange) {
        return BindingBuilder.bind(gatewayEventsQueue).to(eazybankEventsExchange).with("accounts.*");
    }

    @Bean
    Binding gatewayCardsBinding(Queue gatewayEventsQueue, TopicExchange eazybankEventsExchange) {
        return BindingBuilder.bind(gatewayEventsQueue).to(eazybankEventsExchange).with("cards.*");
    }

    @Bean
    Binding gatewayLoansBinding(Queue gatewayEventsQueue, TopicExchange eazybankEventsExchange) {
        return BindingBuilder.bind(gatewayEventsQueue).to(eazybankEventsExchange).with("loans.*");
    }

    @Bean
    MessageConverter jacksonMessageConverter() {
        return new JacksonJsonMessageConverter();
    }
}
