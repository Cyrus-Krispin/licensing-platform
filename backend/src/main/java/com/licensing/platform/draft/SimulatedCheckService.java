package com.licensing.platform.draft;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Durable, status-only simulation: bytes and application data are never changed. */
@Service
public class SimulatedCheckService {
  private static final Duration VISIBLE_CHECKING = Duration.ofMillis(1200);
  private static final Duration INTERRUPTED_AFTER = Duration.ofSeconds(10);
  private final JdbcTemplate db;
  private final TransactionTemplate tx;
  private final SimulatedCheckFaults faults;
  private final boolean enabled;

  SimulatedCheckService(JdbcTemplate db, TransactionTemplate tx, SimulatedCheckFaults faults,
      @Value("${licensing.simulation.enabled:true}") boolean enabled) {
    this.db = db;
    this.tx = tx;
    this.faults = faults;
    this.enabled = enabled;
  }

  public List<Status> statuses(UUID application, String actor) {
    authorizeViewer(application, actor);
    return db.query(
        "select c.upload_id,u.request_id,c.state,c.attempt,c.queued_at,c.checking_at,c.completed_at,c.updated_at "
            + "from simulated_check c join evidence_upload u on u.id=c.upload_id "
            + "where u.application_id=? and (exists(select 1 from application_draft d where d.id=u.application_id and d.owner_username=?) or exists(select 1 from submission_upload s where s.application_id=u.application_id and s.upload_id=u.id)) order by u.created_at,u.id",
        (rs, n) -> new Status(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
            rs.getString(3), rs.getInt(4), instant(rs.getTimestamp(5)),
            instant(rs.getTimestamp(6)), instant(rs.getTimestamp(7)), instant(rs.getTimestamp(8))),
        application, actor);
  }

  public RetryResult retry(UUID application, UUID upload, String actor, String key) {
    if (key == null || key.isBlank() || key.length() > 100) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_idempotency_key",
          "Idempotency-Key must contain 1–100 characters");
    }
    authorizeUpload(application, upload, actor);
    String fingerprint = sha256("retry\0" + upload);
    return tx.execute(ignored -> {
      // The application row lock lasts through transaction commit and serializes retry receipts.
      db.query("select id from application_draft where id=? and owner_username=? for update",
          (rs, n) -> rs.getObject(1, UUID.class), application, actor);
      var receipt = db.query(
          "select payload_hash,resulting_attempt from simulated_check_retry "
              + "where actor_username=? and application_id=? and upload_id=? and idempotency_key=?",
          (rs, n) -> new RetryReceipt(rs.getString(1), rs.getInt(2)),
          actor, application, upload, key).stream().findFirst();
      if (receipt.isPresent()) {
        if (!receipt.get().payloadHash().equals(fingerprint)) {
          throw new ApiException(HttpStatus.CONFLICT, "idempotency_conflict",
              "That retry key was used for a different request");
        }
        // Receipt identity is immutable; its current status can legitimately be newer.
        return new RetryResult(status(upload), receipt.get().attempt());
      }
      Instant now = Instant.now();
      int changed = db.update(
          "update simulated_check set state='QUEUED',attempt=attempt+1,claim_id=null,"
              + "queued_at=?,checking_at=null,completed_at=null,updated_at=? "
              + "where upload_id=? and state='ERROR' and exists("
              + "select 1 from evidence_upload u join application_draft d on d.id=u.application_id "
              + "where u.id=? and d.id=? and d.owner_username=? and (d.status='DRAFT' or (d.status='PENDING_PRE_SITE_RESUBMISSION' and exists(select 1 from feedback_issue f where f.application_id=d.id and f.target=cast(u.request_id as varchar) and f.kind in ('DOCUMENT','ADDITIONAL') and f.state='OPEN'))))",
          Timestamp.from(now), Timestamp.from(now), upload, upload, application, actor);
      if (changed != 1) {
        throw new ApiException(HttpStatus.CONFLICT, "retry_not_allowed",
            "Only a failed check on an editable owned draft can be retried");
      }
      int attempt = status(upload).attempt();
      db.update("insert into simulated_check_retry("
              + "actor_username,application_id,upload_id,idempotency_key,payload_hash,resulting_attempt) "
              + "values(?,?,?,?,?,?)", actor, application, upload, key, fingerprint, attempt);
      return new RetryResult(status(upload), attempt);
    });
  }

  @Scheduled(fixedDelayString = "${licensing.simulation.poll-ms:300}")
  public void scheduledWork() {
    if (enabled) work();
  }

  void work() {
    Instant now = Instant.now();
    // Reclaim the same logical attempt with a new fencing token after an interrupted lease.
    db.update("update simulated_check set state='QUEUED',claim_id=null,checking_at=null,updated_at=? "
            + "where state='CHECKING' and updated_at<?",
        Timestamp.from(now), Timestamp.from(now.minus(INTERRUPTED_AFTER)));
    List<UUID> queued = db.query(
        "select upload_id from simulated_check where state='QUEUED' order by queued_at fetch first 8 rows only",
        (rs, n) -> rs.getObject(1, UUID.class));
    for (UUID upload : queued) claim(upload);
    List<Claim> checking = db.query(
        "select upload_id,attempt,claim_id from simulated_check "
            + "where state='CHECKING' and checking_at<=? order by checking_at fetch first 8 rows only",
        (rs, n) -> new Claim(rs.getObject(1, UUID.class), rs.getInt(2), rs.getObject(3, UUID.class)),
        Timestamp.from(now.minus(VISIBLE_CHECKING)));
    for (Claim claim : checking) finish(claim.upload(), claim.attempt(), claim.claim());
  }

  private void claim(UUID upload) {
    Instant now = Instant.now();
    db.update("update simulated_check set state='CHECKING',claim_id=?,checking_at=?,updated_at=? "
            + "where upload_id=? and state='QUEUED'",
        UUID.randomUUID(), Timestamp.from(now), Timestamp.from(now), upload);
  }

  /** Package seam exercises the actual completion fence, without exposing mutation over HTTP. */
  int finish(UUID upload, int attempt, UUID claimId) {
    String state = faults.fail(upload) ? "ERROR" : "COMPLETE";
    Instant now = Instant.now();
    return db.update("update simulated_check set state=?,claim_id=null,completed_at=?,updated_at=? "
            + "where upload_id=? and state='CHECKING' and attempt=? and claim_id=?",
        state, Timestamp.from(now), Timestamp.from(now), upload, attempt, claimId);
  }

  private Status status(UUID upload) {
    return db.query("select c.upload_id,u.request_id,c.state,c.attempt,c.queued_at,"
            + "c.checking_at,c.completed_at,c.updated_at from simulated_check c "
            + "join evidence_upload u on u.id=c.upload_id where c.upload_id=?",
        (rs, n) -> new Status(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
            rs.getString(3), rs.getInt(4), instant(rs.getTimestamp(5)), instant(rs.getTimestamp(6)),
            instant(rs.getTimestamp(7)), instant(rs.getTimestamp(8))), upload)
        .stream().findFirst().orElseThrow();
  }

  private void authorizeViewer(UUID application, String actor) {
    if (db.query("select 1 from application_draft where id=? and (owner_username=? or (status<>'DRAFT' and exists(select 1 from app_user where username=? and role='OFFICER')) )",
        (rs, n) -> 1, application, actor, actor).isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Application not found");
    }
  }

  private void authorizeUpload(UUID application, UUID upload, String actor) {
    if (db.query("select 1 from evidence_upload u join application_draft d on d.id=u.application_id "
            + "where u.id=? and d.id=? and d.owner_username=?",
        (rs, n) -> 1, upload, application, actor).isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Upload not found");
    }
  }

  private static Instant instant(Timestamp value) {
    return value == null ? null : value.toInstant();
  }

  private static String sha256(String value) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
          .digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (java.security.NoSuchAlgorithmException failure) {
      throw new IllegalStateException(failure);
    }
  }

  private record Claim(UUID upload, int attempt, UUID claim) {}
  private record RetryReceipt(String payloadHash, int attempt) {}
  public record Status(UUID uploadId, UUID requestId, String state, int attempt, Instant queuedAt,
      Instant checkingAt, Instant completedAt, Instant updatedAt) {}
  public record RetryResult(Status status, int resultingAttempt) {}
}
