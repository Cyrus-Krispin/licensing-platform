package com.licensing.platform.config;

import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.sql.init.dependency.DependsOnDatabaseInitialization;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@DependsOnDatabaseInitialization
public class DeploymentSafety implements ApplicationRunner {
    private static final String LOCAL_DATABASE_PASSWORD = "local-only-database-password";
    private static final List<String> SEEDED_USERNAMES = List.of("operator", "officer");
    private static final List<String> PUBLISHED_APPLICATION_PASSWORDS =
            List.of("local-operator-password", "local-officer-password");

    private final boolean development;
    private final String databasePassword;
    private final boolean secureCookies;
    private final JdbcTemplate database;
    private final PasswordEncoder passwordEncoder;

    public DeploymentSafety(
            Environment environment,
            @Value("${spring.datasource.password:}") String databasePassword,
            @Value("${server.servlet.session.cookie.secure:true}") boolean secureCookies,
            JdbcTemplate database,
            PasswordEncoder passwordEncoder) {
        this.development = Arrays.asList(environment.getActiveProfiles()).contains("dev");
        this.databasePassword = databasePassword;
        this.secureCookies = secureCookies;
        this.database = database;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        if (development) {
            return;
        }
        if (!secureCookies
                || databasePassword.isBlank()
                || LOCAL_DATABASE_PASSWORD.equals(databasePassword)) {
            throw new IllegalStateException(
                    "Non-development startup requires secure cookies and an external database password");
        }

        List<String> passwordHashes =
                database.queryForList(
                        "select password_hash from app_user where username in (?, ?)",
                        String.class,
                        SEEDED_USERNAMES.get(0),
                        SEEDED_USERNAMES.get(1));
        boolean publishedApplicationCredentialPresent =
                passwordHashes.stream()
                        .anyMatch(
                                hash ->
                                        PUBLISHED_APPLICATION_PASSWORDS.stream()
                                                .anyMatch(password -> passwordEncoder.matches(password, hash)));
        if (publishedApplicationCredentialPresent) {
            throw new IllegalStateException(
                    "Non-development startup refuses published development application credentials");
        }
    }
}
