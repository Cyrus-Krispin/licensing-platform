package com.licensing.platform;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.licensing.platform.config.DeploymentSafety;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.mock.env.MockEnvironment;

class DeploymentSafetyTest {
    private EmbeddedDatabase dataSource;
    private JdbcTemplate database;
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void createDatabase() {
        dataSource =
                new EmbeddedDatabaseBuilder()
                        .setType(EmbeddedDatabaseType.H2)
                        .generateUniqueName(true)
                        .build();
        database = new JdbcTemplate(dataSource);
        passwordEncoder = new BCryptPasswordEncoder();
        database.execute(
                """
                create table app_user (
                    username varchar(100) primary key,
                    password_hash varchar(100) not null,
                    role varchar(20) not null
                )
                """);
    }

    @AfterEach
    void closeDatabase() {
        dataSource.shutdown();
    }

    @Test
    void nonDevelopmentRejectsInsecureCookies() {
        DeploymentSafety safety = safety(new MockEnvironment(), "external-password", false);
        assertThrows(IllegalStateException.class, () -> safety.run(null));
    }

    @Test
    void nonDevelopmentRejectsMissingOrKnownDatabasePassword() {
        assertThrows(
                IllegalStateException.class,
                () -> safety(new MockEnvironment(), "", true).run(null));
        assertThrows(
                IllegalStateException.class,
                () ->
                        safety(
                                        new MockEnvironment(),
                                        "local-only-database-password",
                                        true)
                                .run(null));
    }

    @Test
    void nonDevelopmentRejectsPersistedPublishedApplicationPassword() {
        insert("operator", "local-operator-password", "OPERATOR");
        insert("officer", "replacement-officer-password", "OFFICER");

        DeploymentSafety safety = safety(new MockEnvironment(), "external-password", true);

        assertThrows(IllegalStateException.class, () -> safety.run(null));
    }

    @Test
    void nonDevelopmentAllowsExplicitlyReplacedApplicationPasswords() {
        insert("operator", "replacement-operator-password", "OPERATOR");
        insert("officer", "replacement-officer-password", "OFFICER");

        DeploymentSafety safety = safety(new MockEnvironment(), "external-password", true);

        assertDoesNotThrow(() -> safety.run(null));
    }

    @Test
    void developmentAllowsPublishedDefaults() {
        insert("operator", "local-operator-password", "OPERATOR");
        insert("officer", "local-officer-password", "OFFICER");
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("dev");

        DeploymentSafety safety = safety(environment, "local-only-database-password", false);

        assertDoesNotThrow(() -> safety.run(null));
    }

    private DeploymentSafety safety(
            MockEnvironment environment, String databasePassword, boolean secureCookies) {
        return new DeploymentSafety(
                environment, databasePassword, secureCookies, database, passwordEncoder);
    }

    private void insert(String username, String password, String role) {
        database.update(
                "insert into app_user(username, password_hash, role) values (?, ?, ?)",
                username,
                passwordEncoder.encode(password),
                role);
    }
}
