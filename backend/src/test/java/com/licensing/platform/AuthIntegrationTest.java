package com.licensing.platform;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest
@AutoConfigureMockMvc
class AuthIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate database;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper objectMapper;

    @BeforeEach
    void seed() {
        database.update("delete from draft_create_retry");
        database.update("delete from application_draft");
        database.update("delete from app_user");
        database.update(
                "insert into app_user values (?, ?, ?)",
                "operator",
                encoder.encode("password"),
                "OPERATOR");
        database.update(
                "insert into app_user values (?, ?, ?)",
                "officer",
                encoder.encode("password"),
                "OFFICER");
    }

    @Test
    void csrfEndpointIsPublicAndMissingCsrfIsRejected() throws Exception {
        Client client = new Client();
        client.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty());
        client.perform(
                        post("/api/auth/login")
                                .param("username", "operator")
                                .param("password", "password"))
                .andExpect(status().isForbidden());
    }

    @Test
    void invalidCredentialsWithRealCsrfAreRejected() throws Exception {
        new Client().login("operator", "wrong").andExpect(status().isUnauthorized());
    }

    @Test
    void anonymousCannotReadWorkspace() throws Exception {
        mvc.perform(get("/api/workspaces/operator")).andExpect(status().isUnauthorized());
    }

    @Test
    void operatorCanOnlyReadOperatorWorkspace() throws Exception {
        assertWorkspaceAccess("operator", "/api/workspaces/operator", "/api/workspaces/officer");
    }

    @Test
    void officerCanOnlyReadOfficerWorkspace() throws Exception {
        assertWorkspaceAccess("officer", "/api/workspaces/officer", "/api/workspaces/operator");
    }

    @Test
    void clearingNotificationsRequiresAuthenticationAndCsrf() throws Exception {
        Client anonymous = new Client();
        anonymous.perform(delete("/api/notifications").header("X-XSRF-TOKEN", anonymous.freshCsrf()))
                .andExpect(status().isUnauthorized());
        Client client = new Client();
        client.login("operator", "password").andExpect(status().isNoContent());
        client.perform(delete("/api/notifications")).andExpect(status().isForbidden());
        client.perform(delete("/api/notifications").header("X-XSRF-TOKEN", client.freshCsrf()))
                .andExpect(status().isNoContent());
    }

    @Test
    void freshCsrfAfterLoginAllowsLogoutAndRevokesSession() throws Exception {
        Client client = new Client();
        client.login("operator", "password").andExpect(status().isNoContent());
        client.perform(get("/api/auth/me")).andExpect(status().isOk());
        client.logout().andExpect(status().isNoContent());
        client.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    private void assertWorkspaceAccess(String username, String allowed, String denied) throws Exception {
        Client client = new Client();
        client.login(username, "password").andExpect(status().isNoContent());
        client.perform(get(allowed)).andExpect(status().isOk());
        client.perform(get(denied)).andExpect(status().isForbidden());
    }

    private final class Client {
        private final Map<String, Cookie> cookies = new LinkedHashMap<>();

        org.springframework.test.web.servlet.ResultActions login(String username, String password)
                throws Exception {
            String token = freshCsrf();
            return perform(
                    post("/api/auth/login")
                            .header("X-XSRF-TOKEN", token)
                            .param("username", username)
                            .param("password", password));
        }

        org.springframework.test.web.servlet.ResultActions logout() throws Exception {
            String token = freshCsrf();
            return perform(post("/api/auth/logout").header("X-XSRF-TOKEN", token));
        }

        org.springframework.test.web.servlet.ResultActions perform(MockHttpServletRequestBuilder request)
                throws Exception {
            if (!cookies.isEmpty()) {
                request.cookie(cookies.values().toArray(Cookie[]::new));
            }
            MvcResult result = mvc.perform(request).andReturn();
            for (Cookie cookie : result.getResponse().getCookies()) {
                if (cookie.getMaxAge() == 0) {
                    cookies.remove(cookie.getName());
                } else {
                    cookies.put(cookie.getName(), cookie);
                }
            }
            return new ResultActionsAdapter(result);
        }

        private String freshCsrf() throws Exception {
            MvcResult result = perform(get("/api/auth/csrf")).andReturn();
            JsonNode json = objectMapper.readTree(result.getResponse().getContentAsString());
            String token = json.get("token").asText();
            assertNotNull(cookies.get("XSRF-TOKEN"));
            return token;
        }
    }

    private record ResultActionsAdapter(MvcResult result)
            implements org.springframework.test.web.servlet.ResultActions {
        @Override
        public MvcResult andReturn() {
            return result;
        }

        @Override
        public org.springframework.test.web.servlet.ResultActions andExpect(
                org.springframework.test.web.servlet.ResultMatcher matcher)
                throws Exception {
            matcher.match(result);
            return this;
        }

        @Override
        public org.springframework.test.web.servlet.ResultActions andDo(
                org.springframework.test.web.servlet.ResultHandler handler)
                throws Exception {
            handler.handle(result);
            return this;
        }
    }
}
