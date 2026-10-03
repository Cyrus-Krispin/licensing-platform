package com.licensing.platform;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.licensing.platform.config.DeploymentSafety;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class DeploymentSafetyTest {
    @Test
    void nonDevelopmentRejectsInsecureCookies() {
        assertThrows(
                IllegalStateException.class,
                () -> new DeploymentSafety(new MockEnvironment(), "external-password", false));
    }

    @Test
    void nonDevelopmentRejectsMissingOrKnownPassword() {
        assertThrows(
                IllegalStateException.class,
                () -> new DeploymentSafety(new MockEnvironment(), "", true));
        assertThrows(
                IllegalStateException.class,
                () ->
                        new DeploymentSafety(
                                new MockEnvironment(), "local-only-database-password", true));
    }

    @Test
    void developmentAllowsExplicitLocalDefaults() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("dev");
        assertDoesNotThrow(
                () ->
                        new DeploymentSafety(
                                environment, "local-only-database-password", false));
    }
}
