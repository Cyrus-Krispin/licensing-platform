package com.licensing.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "spring.datasource.url=jdbc:h2:mem:http-test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
            "spring.datasource.username=sa",
            "spring.datasource.password=test-external-password"
        })
class HttpAuthIntegrationTest {
    @LocalServerPort private int port;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate database;
    @Autowired private PasswordEncoder passwordEncoder;

    @BeforeEach
    void seedOperator() {
        database.update("delete from app_user");
        database.update(
                "insert into app_user(username, password_hash, role) values (?, ?, ?)",
                "operator",
                passwordEncoder.encode("local-operator-password"),
                "OPERATOR");
    }

    @Test
    void realServletHttpPreservesCsrfAuthenticationAndAuthorizationStatuses() throws Exception {
        CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();

        HttpResponse<String> missingCsrf =
                sendForm(client, "/api/auth/login", "username=operator&password=password", null);
        assertEquals(403, missingCsrf.statusCode());
        assertSafeError(missingCsrf.body());

        String invalidLoginToken = csrf(client);
        HttpResponse<String> invalidCredentials =
                sendForm(
                        client,
                        "/api/auth/login",
                        "username=operator&password=wrong",
                        invalidLoginToken);
        assertEquals(401, invalidCredentials.statusCode());
        assertSafeError(invalidCredentials.body());

        HttpResponse<String> anonymousWorkspace = get(client, "/api/workspaces/operator");
        assertEquals(401, anonymousWorkspace.statusCode());
        assertSafeError(anonymousWorkspace.body());

        String loginToken = csrf(client);
        HttpResponse<String> login =
                sendForm(
                        client,
                        "/api/auth/login",
                        "username=operator&password=local-operator-password",
                        loginToken);
        assertEquals(204, login.statusCode());
        assertEquals(200, get(client, "/api/workspaces/operator").statusCode());

        HttpResponse<String> crossRole = get(client, "/api/workspaces/officer");
        assertEquals(403, crossRole.statusCode());
        assertSafeError(crossRole.body());

        String logoutToken = csrf(client);
        HttpResponse<String> logout = sendPost(client, "/api/auth/logout", logoutToken);
        assertEquals(204, logout.statusCode());
        assertEquals(401, get(client, "/api/auth/me").statusCode());
    }

    private String csrf(HttpClient client) throws Exception {
        HttpResponse<String> response = get(client, "/api/auth/csrf");
        assertEquals(200, response.statusCode());
        JsonNode json = objectMapper.readTree(response.body());
        assertEquals("X-XSRF-TOKEN", json.get("headerName").asText());
        return json.get("token").asText();
    }

    private HttpResponse<String> get(HttpClient client, String path) throws Exception {
        return send(client, HttpRequest.newBuilder(uri(path)).GET().build());
    }

    private HttpResponse<String> sendForm(
            HttpClient client, String path, String body, String csrfToken) throws Exception {
        HttpRequest.Builder request =
                HttpRequest.newBuilder(uri(path))
                        .header("Content-Type", "application/x-www-form-urlencoded")
                        .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        if (csrfToken != null) {
            request.header("X-XSRF-TOKEN", csrfToken);
        }
        return send(client, request.build());
    }

    private HttpResponse<String> sendPost(HttpClient client, String path, String csrfToken)
            throws Exception {
        return send(
                client,
                HttpRequest.newBuilder(uri(path))
                        .header("X-XSRF-TOKEN", csrfToken)
                        .POST(HttpRequest.BodyPublishers.noBody())
                        .build());
    }

    private HttpResponse<String> send(HttpClient client, HttpRequest request) throws Exception {
        HttpResponse<String> response =
                client.send(request, HttpResponse.BodyHandlers.ofString());
        ((CookieManager) client.cookieHandler().orElseThrow())
                .getCookieStore()
                .getCookies()
                .forEach(cookie -> cookie.setSecure(false));
        return response;
    }

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }

    private void assertSafeError(String body) {
        String normalized = body.toLowerCase();
        assertFalse(normalized.contains("exception"));
        assertFalse(normalized.contains("stack"));
        assertFalse(normalized.contains("sql"));
        assertTrue(body.length() < 2_000);
    }
}
