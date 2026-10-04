package com.licensing.platform;

import static org.junit.jupiter.api.Assertions.*;

import com.licensing.platform.draft.DraftService;
import com.licensing.platform.draft.EvidenceService;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;

@SpringBootTest(properties = "licensing.file-storage-path=target/test-evidence")
class EvidenceIntegrationTest {
  @Autowired EvidenceService evidence;
  @Autowired DraftService drafts;
  @Autowired JdbcTemplate db;
  @Autowired PasswordEncoder encoder;
  @Autowired DataSource dataSource;
  private static final byte[] PNG = Base64.getDecoder().decode(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+"
      + "A8AAQUBAScY42YAAAAASUVORK5CYII=");
  @BeforeEach
  void seed() throws Exception {
    db.update("delete from evidence_upload_retry");
    db.update("update document_request set current_upload_id=null");
    db.update("delete from evidence_upload");
    db.update("delete from draft_create_retry");
    db.update("delete from application_draft");
    db.update("delete from app_user");
    db.update("insert into app_user values(?,?,?)", "owner",
              encoder.encode("password"), "OPERATOR");
    db.update("insert into app_user values(?,?,?)", "other",
              encoder.encode("password"), "OPERATOR");
  }
  @AfterEach
  void cleanup() {
    db.update("delete from evidence_upload_retry");
    db.update("update document_request set current_upload_id=null");
    db.update("delete from evidence_upload");
    db.update("delete from draft_create_retry");
    db.update("delete from application_draft");
    db.update("delete from app_user");
  }
  private DraftService.Draft draft() {
    return drafts.create("owner", UUID.randomUUID().toString(), Map.of());
  }
  private UUID request(DraftService.Draft d) {
    return d.documentRequests()
        .stream()
        .filter(r -> r.applicability().equals("APPLICABLE"))
        .findFirst()
        .orElseThrow()
        .id();
  }
  private MockMultipartFile file(String name, byte[] content) {
    return new MockMultipartFile("file", name, "image/png", content);
  }
  @Test
  void uploadsReplacesRetainsAndRecoversOriginalRetry() {
    var d = draft();
    var r = request(d);
    var first = evidence.upload(d.id(), r, "owner", 0, "first",
                                file("../proof.png", PNG));
    assertEquals("proof.png", first.upload().filename());
    assertEquals(1, first.revision());
    var changed =
        Arrays.copyOf(PNG, 20); // invalid image replacement must retain current
    assertThrows(RuntimeException.class,
                 ()
                     -> evidence.upload(d.id(), r, "owner", 1, "bad",
                                        file("bad.png", changed)));
    assertEquals(first.upload().id(), drafts.get(d.id(), "owner")
                                          .documentRequests()
                                          .stream()
                                          .filter(x -> x.id().equals(r))
                                          .findFirst()
                                          .orElseThrow()
                                          .currentUpload()
                                          .id());
    var second =
        evidence.upload(d.id(), r, "owner", 1, "second", file("new.png", PNG));
    assertNotEquals(first.upload().id(), second.upload().id());
    assertEquals(2, db.queryForObject("select count(*) from evidence_upload",
                                      Integer.class));
    var retry = evidence.upload(d.id(), r, "owner", 0, "first",
                                file("../proof.png", PNG));
    assertEquals(first.upload().id(), retry.upload().id());
    assertEquals(2, drafts.get(d.id(), "owner").revision());
    assertDoesNotThrow(
        () -> evidence.download(d.id(), first.upload().id(), "owner"));
  }
  @Test
  void rejectsEmptyMismatchedAndUnauthorizedWithoutMutation() {
    var d = draft();
    var r = request(d);
    assertThrows(RuntimeException.class,
                 ()
                     -> evidence.upload(d.id(), r, "owner", 0, "empty",
                                        file("x.png", new byte[0])));
    assertThrows(RuntimeException.class,
                 ()
                     -> evidence.upload(d.id(), r, "owner", 0, "wrong",
                                        file("x.pdf", PNG)));
    assertThrows(RuntimeException.class,
                 ()
                     -> evidence.upload(d.id(), r, "other", 0, "foreign",
                                        file("x.png", PNG)));
    assertEquals(0, db.queryForObject("select count(*) from evidence_upload",
                                      Integer.class));
  }
  @Test
  void staleRevisionAndChangedPayloadKeyConflict() {
    var d = draft();
    var r = request(d);
    evidence.upload(d.id(), r, "owner", 0, "same", file("one.png", PNG));
    assertThrows(RuntimeException.class,
                 ()
                     -> evidence.upload(d.id(), r, "owner", 0, "stale",
                                        file("two.png", PNG)));
    assertThrows(RuntimeException.class,
                 ()
                     -> evidence.upload(d.id(), r, "owner", 1, "same",
                                        file("different.png", PNG)));
    assertEquals(1, db.queryForObject("select count(*) from evidence_upload",
                                      Integer.class));
  }
  @Test
  void exactByteLimitSucceedsAndOverLimitFails() {
    var exactDraft = draft();
    byte[] exact = Arrays.copyOf(PNG, 10_000_000);
    assertEquals(10_000_000,
                 evidence
                     .upload(exactDraft.id(), request(exactDraft), "owner", 0,
                             "exact", file("exact.png", exact))
                     .upload()
                     .byteSize());
    var overDraft = draft();
    assertThrows(RuntimeException.class,
                 ()
                     -> evidence.upload(
                         overDraft.id(), request(overDraft), "owner", 0, "over",
                         file("over.png", Arrays.copyOf(PNG, 10_000_001))));
  }

  @Test
  void originalReceiptRecoversAfterRequestBecomesInapplicable() {
    var draft =
        drafts.create("owner", "owned-draft", Map.of("tenure", "OWNED"));
    UUID ownership = draft.documentRequests()
                         .stream()
                         .filter(r -> r.type().equals("OWNERSHIP_EVIDENCE"))
                         .findFirst()
                         .orElseThrow()
                         .id();
    var uploaded =
        evidence.upload(draft.id(), ownership, "owner", draft.revision(),
                        "ownership", file("ownership.png", PNG));
    drafts.save(draft.id(), "owner",
                new DraftService.Patch(uploaded.revision(),
                                       Map.of("tenure", "RENTED")));
    var recovered =
        evidence.upload(draft.id(), ownership, "owner", draft.revision(),
                        "ownership", file("ownership.png", PNG));
    assertEquals(uploaded.upload().id(), recovered.upload().id());
    assertEquals(uploaded.revision(), recovered.revision());
  }

  @Test
  void missingCurrentBytesAreReportedAndDoNotCountAsReady() throws Exception {
    var draft = draft();
    UUID request = request(draft);
    var uploaded = evidence.upload(draft.id(), request, "owner", 0, "missing",
                                   file("proof.png", PNG));
    String key =
        db.queryForObject("select storage_key from evidence_upload where id=?",
                          String.class, uploaded.upload().id());
    Files.delete(Path.of("target/test-evidence/objects").resolve(key));
    var recovered = drafts.get(draft.id(), "owner");
    var current = recovered.documentRequests()
                      .stream()
                      .filter(r -> r.id().equals(request))
                      .findFirst()
                      .orElseThrow()
                      .currentUpload();
    assertFalse(current.ready());
    assertTrue(recovered.completion().unmetItemIds().contains(
        "documentRequest." + request));
    assertThrows(
        RuntimeException.class,
        () -> evidence.download(draft.id(), uploaded.upload().id(), "owner"));
  }
  @Test
  void concurrentPostgresEvidenceRetriesConverge() throws Exception {
    try (var connection = dataSource.getConnection()) {
      Assumptions.assumeTrue("PostgreSQL".equals(
          connection.getMetaData().getDatabaseProductName()));
    }
    var draft = draft();
    UUID request = request(draft);
    int count = 8;
    var start = new CountDownLatch(1);
    var pool = Executors.newFixedThreadPool(count);
    try {
      List<Future<EvidenceService.UploadResult>> futures = new ArrayList<>();
      for (int i = 0; i < count; i++) {
        futures.add(pool.submit(() -> {
          start.await();
          return evidence.upload(draft.id(), request, "owner", 0, "parallel",
                                 file("same.png", PNG));
        }));
      }
      start.countDown();
      Set<UUID> ids = new HashSet<>();
      for (var future : futures)
        ids.add(future.get(30, TimeUnit.SECONDS).upload().id());
      assertEquals(1, ids.size());
      assertEquals(1, drafts.get(draft.id(), "owner").revision());
      assertEquals(1, db.queryForObject("select count(*) from evidence_upload",
                                        Integer.class));
    } finally {
      pool.shutdownNow();
    }
  }
}
