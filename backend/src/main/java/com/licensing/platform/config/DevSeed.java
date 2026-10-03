package com.licensing.platform.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@Profile("dev")
public class DevSeed {
    @Bean
    CommandLineRunner seed(JdbcTemplate database, PasswordEncoder encoder) {
        return ignored -> {
            insert(database, encoder, "operator", "local-operator-password", "OPERATOR");
            insert(database, encoder, "officer", "local-officer-password", "OFFICER");
        };
    }

    private void insert(
            JdbcTemplate database, PasswordEncoder encoder, String username, String password, String role) {
        database.update(
                """
                insert into app_user(username, password_hash, role)
                values (?, ?, ?)
                on conflict (username) do nothing
                """,
                username,
                encoder.encode(password),
                role);
    }
}
