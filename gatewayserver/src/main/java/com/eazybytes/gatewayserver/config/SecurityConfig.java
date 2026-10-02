package com.eazybytes.gatewayserver.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.ReactiveJwtAuthenticationConverterAdapter;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsConfigurationSource;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;
import reactor.core.publisher.Mono;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebFluxSecurity
public class SecurityConfig {

    @Bean
    public SecurityWebFilterChain springSecurityFilterChain(ServerHttpSecurity serverHttpSecurity,
            CorsConfigurationSource corsConfigurationSource) {
        serverHttpSecurity
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .authorizeExchange(exchanges -> exchanges.pathMatchers(HttpMethod.GET).permitAll()
                        .pathMatchers("/eazybank/accounts/**").hasRole("ACCOUNTS")
                        .pathMatchers("/eazybank/cards/**").hasRole("CARDS")
                        .pathMatchers("/eazybank/loans/**").hasRole("LOANS"))
                .oauth2ResourceServer(oAuth2ResourceServerSpec -> oAuth2ResourceServerSpec
                        .jwt(jwtSpec -> jwtSpec.jwtAuthenticationConverter(grantedAuthoritiesExtractor())));
        serverHttpSecurity.csrf(csrfSpec -> csrfSpec.disable());
        return serverHttpSecurity.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource(
            @Value("${eazybank.cors.allowed-origins:http://localhost:3000}") String allowedOrigins) {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList());
        configuration.setAllowedMethods(List.of(HttpMethod.GET.name(), HttpMethod.POST.name(), HttpMethod.PUT.name(),
                HttpMethod.DELETE.name(), HttpMethod.OPTIONS.name()));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "eazybank-correlation-id"));
        configuration.setExposedHeaders(List.of("X-Response-Time", "eazybank-correlation-id"));
        configuration.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    private Converter<Jwt, Mono<AbstractAuthenticationToken>> grantedAuthoritiesExtractor() {
        JwtAuthenticationConverter jwtAuthenticationConverter = new JwtAuthenticationConverter();
        jwtAuthenticationConverter.setJwtGrantedAuthoritiesConverter(new KeycloakRoleConverter());
        return new ReactiveJwtAuthenticationConverterAdapter(jwtAuthenticationConverter);
    }

}
