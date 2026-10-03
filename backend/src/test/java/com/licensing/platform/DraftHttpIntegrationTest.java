package com.licensing.platform;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.mock.web.MockServletContext;

@SpringBootTest
@AutoConfigureMockMvc
class DraftHttpIntegrationTest {
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
        database.update(
                "insert into app_user values (?, ?, ?)",
                "other-owner",
                encoder.encode("password"),
                "OPERATOR");
    }

    @Test
    void createRetryConflictAndValidationUseStableEnvelopes() throws Exception {
        Client operator = new Client();
        operator.login("operator");
        String first = "{\"legalName\":\" Cafe \",\"applicantRole\":\"OWNER\"}";
        String reordered = "{\"applicantRole\":\"OWNER\",\"legalName\":\"Cafe\"}";

        MvcResult created =
                operator.perform(write(post("/api/applications"), first).header("Idempotency-Key", "key-1"))
                        .andExpect(status().isCreated())
                        .andExpect(jsonPath("$.legalName").value("Cafe"))
                        .andReturn();
        String id = objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asText();

        operator.perform(write(post("/api/applications"), reordered).header("Idempotency-Key", "key-1"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(id));
        operator.perform(
                        write(post("/api/applications"), "{\"legalName\":\"Different\"}")
                                .header("Idempotency-Key", "key-1"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("idempotency_conflict"))
                .andExpect(jsonPath("$.fieldErrors").isEmpty());
        operator.perform(
                        write(post("/api/applications"), "{\"applicantEmail\":\"invalid\"}")
                                .header("Idempotency-Key", "key-2"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("validation_failed"))
                .andExpect(jsonPath("$.fieldErrors.applicantEmail").exists());
    }

    @Test
    void staleNoOpPatchIsRejectedAndOfficerCannotReadDrafts() throws Exception {
        Client operator = new Client();
        operator.login("operator");
        MvcResult created =
                operator.perform(
                                write(post("/api/applications"), "{}")
                                        .header("Idempotency-Key", "key-3"))
                        .andExpect(status().isCreated())
                        .andReturn();
        JsonNode body = objectMapper.readTree(created.getResponse().getContentAsString());
        String id = body.get("id").asText();

        operator.perform(
                        write(
                                patch("/api/applications/{id}/draft", id),
                                "{\"expectedRevision\":0,\"fields\":{\"legalName\":\"First\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(1));
        operator.perform(
                        write(
                                patch("/api/applications/{id}/draft", id),
                                "{\"expectedRevision\":0,\"fields\":{}}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("stale_revision"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("Reload")));

        Client officer = new Client();
        officer.login("officer");
        officer.perform(get("/api/applications")).andExpect(status().isForbidden());

        Client otherOwner = new Client();
        otherOwner.login("other-owner");
        otherOwner
                .perform(get("/api/applications/{id}", id))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("not_found"));
    }

    private MockHttpServletRequestBuilder write(
            MockHttpServletRequestBuilder request, String content) {
        return request.contentType(MediaType.APPLICATION_JSON).content(content);
    }

    private final class Client {
        private final Map<String, Cookie> cookies = new LinkedHashMap<>();

        void login(String username) throws Exception {
            perform(
                            post("/api/auth/login")
                                    .param("username", username)
                                    .param("password", "password"))
                    .andExpect(status().isNoContent());
        }

        org.springframework.test.web.servlet.ResultActions perform(
                MockHttpServletRequestBuilder request) throws Exception {
            if (request.buildRequest(new MockServletContext()).getMethod().matches("POST|PATCH")) {
                request.header("X-XSRF-TOKEN", freshCsrf());
            }
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
            MockHttpServletRequestBuilder request = get("/api/auth/csrf");
            if (!cookies.isEmpty()) {
                request.cookie(cookies.values().toArray(Cookie[]::new));
            }
            MvcResult result = mvc.perform(request).andReturn();
            for (Cookie cookie : result.getResponse().getCookies()) {
                cookies.put(cookie.getName(), cookie);
            }
            return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
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
                org.springframework.test.web.servlet.ResultMatcher matcher) throws Exception {
            matcher.match(result);
            return this;
        }

        @Override
        public org.springframework.test.web.servlet.ResultActions andDo(
                org.springframework.test.web.servlet.ResultHandler handler) throws Exception {
            handler.handle(result);
            return this;
        }
    }
}
