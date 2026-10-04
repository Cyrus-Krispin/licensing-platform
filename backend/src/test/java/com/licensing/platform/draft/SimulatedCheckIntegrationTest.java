package com.licensing.platform.draft;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

@SpringBootTest(properties = {"licensing.simulation.enabled=false"})
class SimulatedCheckIntegrationTest {
  @Autowired JdbcTemplate db;
  @Autowired DraftService drafts;
  @Autowired SimulatedCheckService checks;
  @Autowired SimulatedCheckFaults faults;
  @Autowired PasswordEncoder encoder;
  private String owner;
  private UUID application;
  private UUID upload;

  @BeforeEach
  void seed() {
    owner = "simulation-" + UUID.randomUUID();
    db.update("insert into app_user values(?,?,?)", owner, encoder.encode("password"), "OPERATOR");
    var draft = drafts.create(owner, UUID.randomUUID().toString(), Map.of());
    application = draft.id();
    upload = UUID.randomUUID();
    UUID request = draft.documentRequests().getFirst().id();
    Timestamp now = Timestamp.from(Instant.now());
    db.update("insert into evidence_upload(id,application_id,request_id,storage_key,original_filename,content_type,byte_size,sha256,created_by,created_at) values(?,?,?,?,?,?,?,?,?,?)", upload, application,
        request, upload.toString(), "proof.png", "image/png", 1, "0".repeat(64), owner, now);
    db.update("insert into simulated_check(upload_id,state,attempt,queued_at,updated_at) values(?,'QUEUED',1,?,?)",
        upload, now, now);
  }

  @AfterEach
  void clean() {
    faults.clear();
    db.update("delete from simulated_check_retry where application_id=?", application);
    db.update("delete from evidence_upload where application_id=?", application);
    db.update("delete from draft_create_retry where application_id=?", application);
    db.update("delete from application_draft where id=?", application);
    db.update("delete from app_user where username=?", owner);
  }

  @Test
  void retryAllocatesAttemptBeforeClaimAndRecoversReceiptAfterCompletion() {
    db.update("update simulated_check set state='ERROR' where upload_id=?", upload);
    var retry = checks.retry(application, upload, owner, "retry");
    assertEquals(2, retry.resultingAttempt());
    assertEquals(2, retry.status().attempt());
    checks.work();
    assertEquals(2, status().attempt());
    assertEquals("CHECKING", status().state());
    db.update("update simulated_check set checking_at=? where upload_id=?",
        Timestamp.from(Instant.now().minusSeconds(3)), upload);
    checks.work();
    assertEquals("COMPLETE", status().state());
    assertEquals(2, checks.retry(application, upload, owner, "retry").resultingAttempt());
    assertEquals(0L, db.queryForObject("select revision from application_draft where id=?", Long.class, application));
    ApiException rejected = assertThrows(ApiException.class,
        () -> checks.retry(application, upload, owner, "fresh"));
    assertEquals(HttpStatus.CONFLICT, rejected.status);
  }

  @Test
  void durableErrorIsExplicitAndOwnerScoped() {
    checks.work();
    faults.failOnce(upload);
    db.update("update simulated_check set checking_at=? where upload_id=?",
        Timestamp.from(Instant.now().minusSeconds(3)), upload);
    checks.work();
    assertEquals("ERROR", status().state());
    checks.work();
    assertEquals("ERROR", status().state());
    ApiException denied = assertThrows(ApiException.class,
        () -> checks.statuses(application, "someone-else"));
    assertEquals(HttpStatus.NOT_FOUND, denied.status);
    assertEquals(1, status().attempt());
  }

  @Test
  void concurrentPostgresSimulationRetriesConverge() throws Exception {
    postgres();
    db.update("update simulated_check set state='ERROR' where upload_id=?", upload);
    var results = race(false);
    assertEquals(8, results.size());
    assertTrue(results.stream().allMatch(r -> r.resultingAttempt() == 2));
    assertEquals(1, db.queryForObject("select count(*) from simulated_check_retry where upload_id=?", Integer.class, upload));
    assertEquals(2, status().attempt());
  }

  @Test
  void competingPostgresSimulationRetriesHaveOneWinner() throws Exception {
    postgres();
    db.update("update simulated_check set state='ERROR' where upload_id=?", upload);
    var results = race(true);
    assertEquals(1, results.size());
    assertEquals(2, status().attempt());
    assertEquals(1, db.queryForObject("select count(*) from simulated_check_retry where upload_id=?", Integer.class, upload));
  }

  @Test
  void postgresLeaseRecoveryFencesActualStaleCompletion() throws Exception {
    postgres();
    checks.work();
    UUID oldClaim = db.queryForObject("select claim_id from simulated_check where upload_id=?", UUID.class, upload);
    db.update("update simulated_check set updated_at=? where upload_id=?",
        Timestamp.from(Instant.now().minusSeconds(20)), upload);
    checks.work();
    UUID newClaim = db.queryForObject("select claim_id from simulated_check where upload_id=?", UUID.class, upload);
    assertNotEquals(oldClaim, newClaim);
    assertEquals(1, status().attempt());
    assertEquals(0, checks.finish(upload, 1, oldClaim));
    assertEquals("CHECKING", status().state());
    assertEquals(1, checks.finish(upload, 1, newClaim));
    assertEquals("COMPLETE", status().state());
    assertEquals(0, checks.finish(upload, 1, newClaim));
  }

  private List<SimulatedCheckService.RetryResult> race(boolean competing) throws Exception {
    var pool = Executors.newFixedThreadPool(8);
    var ready = new CountDownLatch(8);
    var start = new CountDownLatch(1);
    var futures = new ArrayList<java.util.concurrent.Future<SimulatedCheckService.RetryResult>>();
    try {
      for (int index = 0; index < 8; index++) {
        String key = competing ? "retry-" + index : "retry";
        futures.add(pool.submit(() -> {
          ready.countDown();
          assertTrue(start.await(10, TimeUnit.SECONDS));
          try { return checks.retry(application, upload, owner, key); }
          catch (ApiException failure) {
            if (!competing) throw failure;
            assertEquals(HttpStatus.CONFLICT, failure.status);
            assertEquals("retry_not_allowed", failure.code);
            return null;
          }
        }));
      }
      assertTrue(ready.await(10, TimeUnit.SECONDS));
      start.countDown();
      var results = new ArrayList<SimulatedCheckService.RetryResult>();
      for (var future : futures) {
        var result = future.get(15, TimeUnit.SECONDS);
        if (result != null) results.add(result);
      }
      return results;
    } finally {
      pool.shutdownNow();
      assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS));
    }
  }

  private void postgres() throws Exception {
    try (var connection = db.getDataSource().getConnection()) {
      assumeTrue("PostgreSQL".equals(connection.getMetaData().getDatabaseProductName()));
    }
  }

  private SimulatedCheckService.Status status() {
    return checks.statuses(application, owner).getFirst();
  }
}
