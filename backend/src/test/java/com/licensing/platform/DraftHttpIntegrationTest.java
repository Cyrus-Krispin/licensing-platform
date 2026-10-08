package com.licensing.platform;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;

@SpringBootTest
@AutoConfigureMockMvc
class DraftHttpIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate database;
  @Autowired PasswordEncoder encoder;
  @Autowired ObjectMapper objectMapper;

  @BeforeEach
  void seed() {
    database.update("delete from evidence_upload_retry");
    database.update("update document_request set current_upload_id=null");
    database.update("delete from evidence_upload");
    database.update("delete from draft_create_retry");
    database.update("delete from application_draft");
    database.update("delete from app_user");
    database.update("insert into app_user values (?, ?, ?)", "operator",
                    encoder.encode("password"), "OPERATOR");
    database.update("insert into app_user values (?, ?, ?)", "officer",
                    encoder.encode("password"), "OFFICER");
    database.update("insert into app_user values (?, ?, ?)", "other-owner",
                    encoder.encode("password"), "OPERATOR");
  }

  @Test
  void createRetryConflictAndValidationUseStableEnvelopes() throws Exception {
    Client operator = new Client();
    operator.login("operator");
    String first = "{\"legalName\":\" Cafe \",\"applicantRole\":\"OWNER\"}";
    String reordered = "{\"applicantRole\":\"OWNER\",\"legalName\":\"Cafe\"}";

    MvcResult created = operator
                            .perform(write(post("/api/applications"), first)
                                         .header("Idempotency-Key", "key-1"))
                            .andExpect(status().isCreated())
                            .andExpect(jsonPath("$.legalName").value("Cafe"))
                            .andReturn();
    String id =
        objectMapper.readTree(created.getResponse().getContentAsString())
            .get("id")
            .asText();

    operator
        .perform(write(post("/api/applications"), reordered)
                     .header("Idempotency-Key", "key-1"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").value(id));
    operator
        .perform(
            write(post("/api/applications"), "{\"legalName\":\"Different\"}")
                .header("Idempotency-Key", "key-1"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error").value("idempotency_conflict"))
        .andExpect(jsonPath("$.fieldErrors").isEmpty());
    operator
        .perform(
            write(post("/api/applications"), "{\"applicantEmail\":\"invalid\"}")
                .header("Idempotency-Key", "key-2"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.error").value("validation_failed"))
        .andExpect(jsonPath("$.fieldErrors.applicantEmail").exists());
  }

  @Test
  void structuredCreateRoundTripsAndExtendedDatesFailAtomically()
      throws Exception {
    Client operator = new Client();
    operator.login("operator");
    String payload = "{\"businessType\":\"CAFE\",\"preparationActivities\":[" +
                     "\"COOKING\",\"BAKING\"],"
                     + "\"serviceModes\":[\"TAKEAWAY\"],\"operatingHours\":{" +
                       "\"MONDAY\":{\"closed\":true}},"
                     + "\"proposedOpeningDate\":\"2020-02-29\"}";
    MvcResult created =
        operator
            .perform(write(post("/api/applications"), payload)
                         .header("Idempotency-Key", "structured-http"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.preparationActivities[0]").value("BAKING"))
            .andExpect(jsonPath("$.operatingHours.MONDAY.closed").value(true))
            .andReturn();
    String id =
        objectMapper.readTree(created.getResponse().getContentAsString())
            .get("id")
            .asText();
    operator
        .perform(
            write(patch("/api/applications/{id}/draft", id),
                  "{\"expectedRevision\":1,\"fields\":{\"businessType\":" +
                  "\"RESTAURANT\",\"proposedOpeningDate\":\"+10000-01-01\"}}"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.fieldErrors.proposedOpeningDate").exists());
    operator.perform(get("/api/applications/{id}", id))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.businessType").value("CAFE"))
        .andExpect(jsonPath("$.revision").value(1));
  }

  @Test
  void staleNoOpPatchIsRejectedAndOfficerCannotReadDrafts() throws Exception {
    Client operator = new Client();
    operator.login("operator");
    MvcResult created = operator
                            .perform(write(post("/api/applications"), "{}")
                                         .header("Idempotency-Key", "key-3"))
                            .andExpect(status().isCreated())
                            .andReturn();
    JsonNode body =
        objectMapper.readTree(created.getResponse().getContentAsString());
    String id = body.get("id").asText();

    operator
        .perform(write(
            patch("/api/applications/{id}/draft", id),
            "{\"expectedRevision\":0,\"fields\":{\"legalName\":\"First\"}}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.revision").value(1));
    operator
        .perform(write(patch("/api/applications/{id}/draft", id),
                       "{\"expectedRevision\":0,\"fields\":{}}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error").value("stale_revision"))
        .andExpect(jsonPath("$.message")
                       .value(org.hamcrest.Matchers.containsString("Reload")));
    operator
        .perform(write(patch("/api/applications/{id}/draft", id),
                       "{\"expectedRevision\":0,\"fields\":null}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error").value("stale_revision"));

    Client officer = new Client();
    officer.login("officer");
    officer.perform(get("/api/applications")).andExpect(status().isForbidden());

    Client otherOwner = new Client();
    otherOwner.login("other-owner");
    otherOwner.perform(get("/api/applications/{id}", id))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error").value("not_found"));
    otherOwner
        .perform(
            write(patch("/api/applications/{id}/draft", id),
                  "{\"expectedRevision\":1,\"fields\":{\"legalName\":\"No\"}}"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error").value("not_found"));
  }

  @Test
  void validatesEveryDraftFieldAndStrictRequestShapeAtomically()
      throws Exception {
    Client operator = new Client();
    operator.login("operator");
    List<Map.Entry<String, String>> invalidFields = List.of(
        Map.entry("legalName", ""), Map.entry("legalName", "x".repeat(201)),
        Map.entry("applicantName", ""),
        Map.entry("applicantName", "x".repeat(121)),
        Map.entry("registrationNumber", "AB"),
        Map.entry("registrationNumber", "bad value!"),
        Map.entry("structure", "CHARITY"), Map.entry("applicantRole", "AGENT"),
        Map.entry("applicantEmail", "a@b..c"),
        Map.entry("applicantEmail", "x".repeat(249) + "@x.test"),
        Map.entry("applicantPhone", "+1 (23)-45"),
        Map.entry("applicantPhone", "+12 345 678 901 234 567"),
        Map.entry("premisesAddress", " "),
        Map.entry("premisesAddress", "x".repeat(501)),
        Map.entry("premisesName", "x".repeat(201)),
        Map.entry("unitNumber", " "), Map.entry("unitNumber", "x".repeat(41)),
        Map.entry("tenure", "BORROWED"));
    for (Map.Entry<String, String> invalid : invalidFields) {
      operator
          .perform(write(post("/api/applications"),
                         objectMapper.writeValueAsString(
                             Map.of(invalid.getKey(), invalid.getValue())))
                       .header("Idempotency-Key", UUID.randomUUID().toString()))
          .andExpect(status().isUnprocessableEntity())
          .andExpect(jsonPath("$.error").value("validation_failed"))
          .andExpect(jsonPath("$.fieldErrors." + invalid.getKey()).exists());
    }

    operator
        .perform(write(post("/api/applications"), "{\"legalName\":42}")
                     .header("Idempotency-Key", "invalid-type"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(
            jsonPath("$.fieldErrors.legalName").value("Must be text or null"));
    for (String invalidBoolean : List.of("\"true\"", "1", "{}")) {
      operator
          .perform(write(post("/api/applications"),
                         "{\"unitApplicable\":" + invalidBoolean + "}")
                       .header("Idempotency-Key", UUID.randomUUID().toString()))
          .andExpect(status().isUnprocessableEntity())
          .andExpect(jsonPath("$.fieldErrors.unitApplicable").exists());
    }
    operator
        .perform(write(post("/api/applications"), "{\"unknown\":\"value\"}")
                     .header("Idempotency-Key", "unknown-field"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.fieldErrors.unknown").value("Unknown field"));

    MvcResult created =
        operator
            .perform(write(post("/api/applications"),
                           "{\"legalName\":\"Original\",\"tradingName\":\" \","
                               + "\"applicantEmail\":\"name@example.test\","
                               + "\"applicantPhone\":\"+1 (234) 567-8901\"}")
                         .header("Idempotency-Key", "valid-boundaries"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.tradingName")
                           .value(org.hamcrest.Matchers.nullValue()))
            .andReturn();
    JsonNode draft =
        objectMapper.readTree(created.getResponse().getContentAsString());
    String id = draft.get("id").asText();
    String createdAt = draft.get("updatedAt").asText();

    operator
        .perform(write(patch("/api/applications/{id}/draft", id),
                       "{\"expectedRevision\":1,\"fields\":{"
                           + "\"legalName\":\"Must roll back\","
                           + "\"registrationNumber\":\"!\"}}"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.fieldErrors.registrationNumber").exists());
    operator.perform(get("/api/applications/{id}", id))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.legalName").value("Original"))
        .andExpect(jsonPath("$.revision").value(1));

    operator
        .perform(write(patch("/api/applications/{id}/draft", id),
                       "{\"expectedRevision\":1,\"fields\":{" +
                       "\"applicantName\":\"Owner\"}}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.legalName").value("Original"))
        .andExpect(jsonPath("$.applicantName").value("Owner"))
        .andExpect(jsonPath("$.updatedAt")
                       .value(org.hamcrest.Matchers.not(createdAt)));

    operator
        .perform(write(patch("/api/applications/{id}/draft", id),
                       "{\"expectedRevision\":\"1\",\"fields\":{}}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value("invalid_request"))
        .andExpect(
            jsonPath("$.message")
                .value("expectedRevision must be a non-negative integer"));
    operator
        .perform(write(patch("/api/applications/{id}/draft", id),
                       "{\"expectedRevision\":2,\"fields\":{},\"extra\":true}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value("invalid_request"))
        .andExpect(
            jsonPath("$.message").value("Unknown request properties: extra"));
  }

  @Test
  void
  multipartRejectsFreshInapplicableBeforeParsingButRecoversExistingReceipt()
      throws Exception {
    Client operator = new Client();
    operator.login("operator");
    MvcResult created =
        operator
            .perform(write(post("/api/applications"), "{\"tenure\":\"OWNED\"}")
                         .header("Idempotency-Key", "owned-http"))
            .andExpect(status().isCreated())
            .andReturn();
    JsonNode draft =
        objectMapper.readTree(created.getResponse().getContentAsString());
    String id = draft.get("id").asText();
    String request =
        java.util.stream.StreamSupport
            .stream(draft.get("documentRequests").spliterator(), false)
            .filter(
                node -> node.get("type").asText().equals("OWNERSHIP_EVIDENCE"))
            .findFirst()
            .orElseThrow()
            .get("id")
            .asText();
    byte[] png = java.util.Base64.getDecoder().decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+" +
        "A8AAQUBAScY42YAAAAASUVORK5CYII=");
    MockMultipartFile valid =
        new MockMultipartFile("file", "owned.png", "image/png", png);
    MvcResult uploaded =
        operator
            .perform(
                multipart("/api/applications/{id}/evidence/requests/{request}",
                          id, request)
                    .file(valid)
                    .param("expectedRevision", "1")
                    .header("Idempotency-Key", "owned-upload"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.revision").value(2))
            .andReturn();
    String uploadId =
        objectMapper.readTree(uploaded.getResponse().getContentAsString())
            .get("upload")
            .get("id")
            .asText();
    operator
        .perform(write(
            patch("/api/applications/{id}/draft", id),
            "{\"expectedRevision\":2,\"fields\":{\"tenure\":\"RENTED\"}}"))
        .andExpect(status().isOk());

    MockMultipartFile encrypted =
        new MockMultipartFile("file", "encrypted.pdf", "application/pdf",
                              "%PDF-1.7 encrypted".getBytes());
    operator
        .perform(multipart("/api/applications/{id}/evidence/requests/{request}",
                           id, request)
                     .file(encrypted)
                     .param("expectedRevision", "3")
                     .header("Idempotency-Key", "fresh-inapplicable"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error").value("request_not_applicable"));
    org.junit.jupiter.api.Assertions.assertEquals(
        1, database.queryForObject("select count(*) from evidence_upload",
                                   Integer.class));

    operator
        .perform(multipart("/api/applications/{id}/evidence/requests/{request}",
                           id, request)
                     .file(valid)
                     .param("expectedRevision", "1")
                     .header("Idempotency-Key", "owned-upload"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.upload.id").value(uploadId))
        .andExpect(jsonPath("$.revision").value(2))
        .andExpect(jsonPath("$.currentDraft.revision").value(3))
        .andExpect(jsonPath("$.currentDraft.documentRequests[?(@.id == '" +
                            request + "')].currentUpload.id")
                       .value(uploadId));
  }

  @Test
  void parallelExpectedRevisionSavesHaveOneWinnerAndOneConflict()
      throws Exception {
    Client operator = new Client();
    operator.login("operator");
    MvcResult created =
        operator
            .perform(write(post("/api/applications"), "{}")
                         .header("Idempotency-Key", "parallel-save"))
            .andExpect(status().isCreated())
            .andReturn();
    String id =
        objectMapper.readTree(created.getResponse().getContentAsString())
            .get("id")
            .asText();
    String csrf = operator.freshCsrf();
    Cookie[] cookies = operator.cookies.values().toArray(Cookie[] ::new);
    CountDownLatch ready = new CountDownLatch(2);
    CountDownLatch start = new CountDownLatch(1);

    try (var executor = Executors.newFixedThreadPool(2)) {
      var first = executor.submit(
          () -> concurrentSave(id, "First", csrf, cookies, ready, start));
      var second = executor.submit(
          () -> concurrentSave(id, "Second", csrf, cookies, ready, start));
      org.junit.jupiter.api.Assertions.assertTrue(
          ready.await(5, TimeUnit.SECONDS));
      start.countDown();
      MvcResult firstResult = first.get(10, TimeUnit.SECONDS);
      MvcResult secondResult = second.get(10, TimeUnit.SECONDS);
      List<Integer> statuses =
          java.util.stream.Stream.of(firstResult, secondResult)
              .map(result -> result.getResponse().getStatus())
              .sorted()
              .toList();
      org.junit.jupiter.api.Assertions.assertEquals(List.of(200, 409),
                                                    statuses);
      MvcResult conflict = firstResult.getResponse().getStatus() == 409
                               ? firstResult
                               : secondResult;
      org.junit.jupiter.api.Assertions.assertEquals(
          "stale_revision",
          objectMapper.readTree(conflict.getResponse().getContentAsString())
              .get("error")
              .asText());
    }
    operator.perform(get("/api/applications/{id}", id))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.revision").value(1));
  }

  private MvcResult concurrentSave(String id, String name, String csrf,
                                   Cookie[] cookies, CountDownLatch ready,
                                   CountDownLatch start) throws Exception {
    ready.countDown();
    start.await();
    return mvc
        .perform(patch("/api/applications/{id}/draft", id)
                     .cookie(cookies)
                     .header("X-XSRF-TOKEN", csrf)
                     .contentType(MediaType.APPLICATION_JSON)
                     .content(objectMapper.writeValueAsString(
                         Map.of("expectedRevision", 0, "fields",
                                Map.of("legalName", name)))))
        .andReturn();
  }

  private MockHttpServletRequestBuilder
  write(MockHttpServletRequestBuilder request, String content) {
    return request.contentType(MediaType.APPLICATION_JSON).content(content);
  }

  private final class Client {
    private final Map<String, Cookie> cookies = new LinkedHashMap<>();

    void login(String username) throws Exception {
      perform(post("/api/auth/login")
                  .param("username", username)
                  .param("password", "password"))
          .andExpect(status().isNoContent());
    }

    org.springframework.test.web.servlet.ResultActions
    perform(AbstractMockHttpServletRequestBuilder<?> request) throws Exception {
      if (request.buildRequest(new MockServletContext())
              .getMethod()
              .matches("POST|PATCH")) {
        request.header("X-XSRF-TOKEN", freshCsrf());
      }
      if (!cookies.isEmpty()) {
        request.cookie(cookies.values().toArray(Cookie[] ::new));
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
        request.cookie(cookies.values().toArray(Cookie[] ::new));
      }
      MvcResult result = mvc.perform(request).andReturn();
      for (Cookie cookie : result.getResponse().getCookies()) {
        cookies.put(cookie.getName(), cookie);
      }
      return objectMapper.readTree(result.getResponse().getContentAsString())
          .get("token")
          .asText();
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
