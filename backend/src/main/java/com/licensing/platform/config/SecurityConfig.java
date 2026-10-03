package com.licensing.platform.config;

import jakarta.servlet.DispatcherType;
import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.JdbcUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.HttpStatusAccessDeniedHandler;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;

@Configuration
public class SecurityConfig {
    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    UserDetailsService users(DataSource dataSource) {
        JdbcUserDetailsManager users = new JdbcUserDetailsManager(dataSource);
        users.setUsersByUsernameQuery(
                "select username, password_hash, true from app_user where username = ?");
        users.setAuthoritiesByUsernameQuery(
                "select username, concat('ROLE_', role) from app_user where username = ?");
        return users;
    }

    @Bean
    SecurityFilterChain security(HttpSecurity http) throws Exception {
        CookieCsrfTokenRepository csrf = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrf.setCookiePath("/");
        http.csrf(configuration -> configuration.csrfTokenRepository(csrf))
                .authorizeHttpRequests(
                        authorization ->
                                authorization
                                        .dispatcherTypeMatchers(DispatcherType.ERROR)
                                        .permitAll()
                                        .requestMatchers("/error", "/api/auth/csrf", "/actuator/health/**")
                                        .permitAll()
                                        .requestMatchers("/api/workspaces/operator")
                                        .hasRole("OPERATOR")
                                        .requestMatchers("/api/workspaces/officer")
                                        .hasRole("OFFICER")
                                        .anyRequest()
                                        .authenticated())
                .exceptionHandling(
                        exceptions ->
                                exceptions
                                        .authenticationEntryPoint(
                                                (request, response, exception) ->
                                                        response.sendError(401))
                                        .accessDeniedHandler(
                                                new HttpStatusAccessDeniedHandler(
                                                        HttpStatus.FORBIDDEN)))
                .formLogin(
                        form ->
                                form.loginProcessingUrl("/api/auth/login")
                                        .successHandler(
                                                (request, response, authentication) ->
                                                        response.setStatus(204))
                                        .failureHandler(
                                                (request, response, exception) ->
                                                        response.sendError(401, "Invalid credentials")))
                .logout(
                        logout ->
                                logout.logoutUrl("/api/auth/logout")
                                        .logoutSuccessHandler(
                                                (request, response, authentication) ->
                                                        response.setStatus(204)));
        return http.build();
    }
}
