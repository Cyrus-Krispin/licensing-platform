package com.licensing.platform.config;

import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class DeploymentSafety {
    private static final String LOCAL_PASSWORD = "local-only-database-password";

    public DeploymentSafety(
            Environment environment,
            @Value("${spring.datasource.password:}") String databasePassword,
            @Value("${server.servlet.session.cookie.secure:true}") boolean secureCookies) {
        boolean development = Arrays.asList(environment.getActiveProfiles()).contains("dev");
        if (!development && (!secureCookies || databasePassword.isBlank() || LOCAL_PASSWORD.equals(databasePassword))) {
            throw new IllegalStateException(
                    "Non-development startup requires secure cookies and an external database password");
        }
    }
}
