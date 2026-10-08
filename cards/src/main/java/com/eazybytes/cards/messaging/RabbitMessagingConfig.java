package com.eazybytes.cards.messaging;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.config.RetryInterceptorBuilder;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.retry.RepublishMessageRecoverer;
import org.springframework.amqp.support.converter.JacksonJavaTypeMapper;
import org.springframework.amqp.support.converter.JacksonJsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnProperty(name = "eazybank.messaging.broker", havingValue = "rabbit")
public class RabbitMessagingConfig {

    static final String QUEUE = "cards.accounts";
    static final String DLQ = "cards.accounts.dlq";

    @Bean
    TopicExchange eazybankEventsExchange() {
        return new TopicExchange(RabbitNames.EXCHANGE, true, false);
    }

    @Bean
    TopicExchange eazybankEventsDlx() {
        return new TopicExchange(RabbitNames.DLX, true, false);
    }

    @Bean
    Queue accountDeletedQueue() {
        return QueueBuilder.durable(QUEUE).build();
    }

    @Bean
    Queue accountDeletedDlq() {
        return QueueBuilder.durable(DLQ).build();
    }

    @Bean
    Binding accountDeletedBinding(Queue accountDeletedQueue, TopicExchange eazybankEventsExchange) {
        return BindingBuilder.bind(accountDeletedQueue).to(eazybankEventsExchange).with("accounts.deleted");
    }

    @Bean
    Binding accountDeletedDlqBinding(Queue accountDeletedDlq, TopicExchange eazybankEventsDlx) {
        return BindingBuilder.bind(accountDeletedDlq).to(eazybankEventsDlx).with(QUEUE);
    }

    @Bean
    MessageConverter jacksonMessageConverter() {
        JacksonJsonMessageConverter converter = new JacksonJsonMessageConverter();
        converter.setTypePrecedence(JacksonJavaTypeMapper.TypePrecedence.INFERRED);
        converter.setAlwaysConvertToInferredType(true);
        return converter;
    }

    @Bean
    SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(
            ConnectionFactory connectionFactory,
            MessageConverter jacksonMessageConverter,
            RabbitTemplate rabbitTemplate) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setMessageConverter(jacksonMessageConverter);
        factory.setDefaultRequeueRejected(false);
        factory.setAdviceChain(RetryInterceptorBuilder.stateless()
                .maxRetries(3)
                .backOffOptions(2000, 1.0, 2000)
                .recoverer(new RepublishMessageRecoverer(rabbitTemplate, RabbitNames.DLX, QUEUE))
                .build());
        return factory;
    }
}
