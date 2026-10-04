package com.licensing.platform.draft;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

@Service
public class EvidenceService {
  static final long MAX_BYTES = 10_000_000;
  private static final Semaphore PARSERS = new Semaphore(2, true);
  private final JdbcTemplate db;
  private final TransactionTemplate tx;
  private final EvidenceFaults faults;
  private final Path root;
  private final boolean postgres;
  EvidenceService(JdbcTemplate db, TransactionTemplate tx,
                  EvidenceFaults faults, DataSource ds,
                  @Value("${licensing.file-storage-path:./data/private-files}")
                  String path) throws Exception {
    this.db = db;
    this.tx = tx;
    this.faults = faults;
    root = Path.of(path).toAbsolutePath().normalize();
    Files.createDirectories(root.resolve("staging"));
    Files.createDirectories(root.resolve("objects"));
    try (var c = ds.getConnection()) {
      postgres = "PostgreSQL".equals(c.getMetaData().getDatabaseProductName());
    }
  }
  public UploadResult upload(UUID app, UUID request, String actor,
                             long expected, String key, MultipartFile part) {
    if (key == null || key.isBlank() || key.length() > 100)
      bad("Idempotency-Key must contain 1–100 characters");
    authorizeBeforeMultipart(app, request, actor, key);
    byte[] bytes = read(part);
    String filename = sanitize(part.getOriginalFilename());
    String type = validate(bytes, filename, part.getContentType());
    String hash = hex(bytes);
    String fingerprint = hex((hash + "\0" + filename + "\0" + type)
                                 .getBytes(StandardCharsets.UTF_8));
    UUID id = UUID.randomUUID();
    String storage = UUID.randomUUID().toString();
    Path staging = root.resolve("staging").resolve(storage + ".part"),
         target = root.resolve("objects").resolve(storage);
    try {
      faults.beforeDiskWrite();
      Files.write(staging, bytes);
      try {
        Files.move(staging, target, StandardCopyOption.ATOMIC_MOVE);
      } catch (AtomicMoveNotSupportedException e) {
        Files.move(staging, target);
      }
      try {
        UploadResult result = tx.execute(
            s
            -> commit(app, request, actor, expected, key, fingerprint, id,
                      storage, filename, type, bytes.length, hash));
        faults.afterCommittedTransaction();
        if (!result.upload.id.equals(id))
          quiet(target);
        return result;
      } catch (RuntimeException e) {
        // Cleanup is driven only by an explicit ROLLED_BACK completion
        // callback. UNKNOWN or commit-then-throw outcomes retain bytes for
        // reconciliation.
        throw e;
      }
    } catch (IOException e) {
      quiet(staging);
      quiet(target);
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "storage_failure",
                             "The file could not be stored. Your previous "
                                 +
                                 "file is unchanged; retry with the same key.");
    }
  }
  private UploadResult commit(UUID app, UUID request, String actor,
                              long expected, String key, String fingerprint,
                              UUID id, String storage, String filename,
                              String type, long size, String hash) {
    lock(actor, app, request, key);
    var old = receipt(actor, app, request, key);
    if (old.isPresent()) {
      if (!old.get().hash.equals(fingerprint))
        throw new ApiException(HttpStatus.CONFLICT, "idempotency_conflict",
                               "That retry key was already used with a "
                                   + "different file or filename");
      return new UploadResult(load(old.get().upload, app, actor),
                              old.get().revision);
    }
    registerRollbackCleanup(storage);
    var access = access(app, request, actor, true);
    if (access.revision != expected)
      throw new ApiException(HttpStatus.CONFLICT, "stale_revision",
                             "This draft changed elsewhere. Reload it; your "
                                 + "local form values have been retained.");
    db.update("insert into "
                  + "evidence_upload(id,application_id,request_id,storage_key,"
                  +
                  "original_filename,content_type,byte_size,sha256,created_by,"
                  + "created_at) values(?,?,?,?,?,?,?,?,?,?)",
              id, app, request, storage, filename, type, size, hash, actor,
              Timestamp.from(Instant.now()));
    db.update("update document_request set current_upload_id=? where id=? "
                  + "and application_id=?",
              id, request, app);
    db.update("update application_draft set revision=revision+1,updated_at=? "
                  + "where id=? and revision=?",
              Timestamp.from(Instant.now()), app, expected);
    long revision = expected + 1;
    faults.beforeReceiptInsert();
    db.update(
        "insert into "
            + "evidence_upload_retry(actor_username,application_id,request_"
            + "id,idempotency_key,payload_hash,upload_id,resulting_revision) "
            + "values(?,?,?,?,?,?,?)",
        actor, app, request, key, fingerprint, id, revision);
    return new UploadResult(load(id, app, actor), revision);
  }
  public Download download(UUID app, UUID upload, String actor) {
    Upload u = load(upload, app, actor);
    Path p = root.resolve("objects").resolve(u.storageKey).normalize();
    if (!p.startsWith(root.resolve("objects")) || !Files.isRegularFile(p))
      throw integrity();
    try {
      return new Download(u, new InputStreamResource(Files.newInputStream(p)));
    } catch (IOException e) {
      throw integrity();
    }
  }
  public void authorizeBeforeMultipart(UUID app, UUID request, String actor,
                                       String key) {
    if (key == null || key.isBlank() || key.length() > 100) {
      bad("Idempotency-Key must contain 1–100 characters");
    }
    authorizeTarget(app, request, actor);
    boolean receiptExists =
        !db.query("select 1 from evidence_upload_retry where actor_username=? "
                      + "and application_id=? and request_id=? and "
                      + "idempotency_key=?",
                  (rs, n) -> 1, actor, app, request, key)
             .isEmpty();
    if (!receiptExists) {
      access(app, request, actor, false);
    }
  }

  public void authorizeTarget(UUID app, UUID request, String actor) {
    boolean owned =
        !db.query("select 1 from application_draft d join "
                      + "document_request r on r.application_id=d.id "
                      + "where d.id=? and r.id=? and d.owner_username=?",
                  (rs, n) -> 1, app, request, actor)
             .isEmpty();
    if (!owned)
      throw new ApiException(HttpStatus.NOT_FOUND, "not_found",
                             "Draft evidence request not found");
  }
  private void registerRollbackCleanup(String storage) {
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void afterCompletion(int status) {
            if (status == STATUS_ROLLED_BACK) {
              quiet(root.resolve("objects").resolve(storage));
            }
          }
        });
  }
  private Access access(UUID app, UUID request, String actor, boolean lock) {
    String suffix =
        lock ? (postgres ? " for update of d, r" : " for update") : "";
    var found =
        db.query("select d.revision,r.applicability from application_draft d "
                     + "join document_request r on r.application_id=d.id "
                     + "where d.id=? "
                     +
                     "and r.id=? and d.owner_username=? and d.status='DRAFT'" +
                     suffix,
                 (rs, n)
                     -> new Access(rs.getLong(1), rs.getString(2)),
                 app, request, actor)
            .stream()
            .findFirst()
            .orElseThrow(
                ()
                    -> new ApiException(HttpStatus.NOT_FOUND, "not_found",
                                        "Draft evidence request not found"));
    if (!found.applicability.equals("APPLICABLE"))
      throw new ApiException(
          HttpStatus.CONFLICT, "request_not_applicable",
          "Evidence is not currently required for this request");
    return found;
  }
  private Upload load(UUID id, UUID app, String actor) {
    return db
        .query(
            "select "
                +
                "u.id,u.request_id,u.storage_key,u.original_filename,u.content_"
                +
                "type,u.byte_size,u.sha256,u.created_at from evidence_upload u "
                + "join application_draft d on d.id=u.application_id where "
                + "u.id=? "
                + "and u.application_id=? and d.owner_username=?",
            (rs, n)
                -> new Upload(rs.getObject(1, UUID.class),
                              rs.getObject(2, UUID.class), rs.getString(3),
                              rs.getString(4), rs.getString(5), rs.getLong(6),
                              rs.getString(7), rs.getTimestamp(8).toInstant(),
                              true),
            id, app, actor)
        .stream()
        .findFirst()
        .orElseThrow(()
                         -> new ApiException(HttpStatus.NOT_FOUND, "not_found",
                                             "File not found"));
  }
  private byte[] read(MultipartFile p) {
    if (p == null || p.isEmpty())
      bad("Choose a nonempty PDF, JPEG, or PNG file");
    if (p.getSize() > MAX_BYTES)
      tooLarge();
    try (var in = p.getInputStream()) {
      byte[] b = in.readNBytes((int)MAX_BYTES + 1);
      if (b.length == 0)
        bad("Choose a nonempty PDF, JPEG, or PNG file");
      if (b.length > MAX_BYTES)
        tooLarge();
      return b;
    } catch (IOException e) {
      throw invalid("The uploaded file could not be read");
    }
  }
  private String validate(byte[] b, String name, String supplied) {
    String ext =
        name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
    String type;
    if (starts(b, "%PDF-".getBytes(StandardCharsets.US_ASCII)))
      type = "application/pdf";
    else if (starts(b, new byte[] {-119, 80, 78, 71, 13, 10, 26, 10}))
      type = "image/png";
    else if (starts(b, new byte[] {-1, -40, -1}))
      type = "image/jpeg";
    else
      throw invalid("File contents are not a supported PDF, JPEG, or PNG");
    String expected = switch (ext) {
      case "pdf" -> "application/pdf";
      case "jpg", "jpeg" -> "image/jpeg";
      case "png" -> "image/png";
      default -> null;
    };
    if (!type.equals(expected))
      throw invalid(
          "The filename extension does not match the detected file format");
    if (supplied != null && !supplied.isBlank() &&
        !Set.of(type, "application/octet-stream")
             .contains(supplied.toLowerCase(Locale.ROOT)))
      throw invalid(
          "The supplied content type does not match the detected file format");
    validateInWorker(b, type);
    return type;
  }
  private void validateInWorker(byte[] bytes, String type) {
    boolean acquired = false;
    boolean interrupted = false;
    Path work = null;
    Process process = null;
    try {
      acquired = PARSERS.tryAcquire(5, TimeUnit.SECONDS);
      if (!acquired) {
        throw new ApiException(
            HttpStatus.SERVICE_UNAVAILABLE, "parser_busy",
            "File validation is busy; retry with the same key");
      }
      work = Files.createTempDirectory(root.resolve("staging"), "validate-");
      Path input = work.resolve("input");
      Files.write(input, bytes);
      process =
          new ProcessBuilder(
              validationCommand(input, type, faults.consumeParserTimeout()))
              .redirectOutput(ProcessBuilder.Redirect.DISCARD)
              .redirectError(ProcessBuilder.Redirect.DISCARD)
              .start();
      if (!process.waitFor(5, TimeUnit.SECONDS)) {
        throw invalid("The file exceeded the structural validation time limit");
      }
      if (process.exitValue() != 0) {
        throw invalid("The file is damaged, encrypted, unsupported, or "
                      + "exceeds structural limits");
      }
    } catch (ApiException exception) {
      throw exception;
    } catch (InterruptedException exception) {
      interrupted = true;
      throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE, "parser_interrupted",
          "File validation was interrupted; retry with the same key");
    } catch (IOException exception) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                             "parser_unavailable",
                             "File validation is temporarily unavailable; "
                                 + "retry with the same key");
    } finally {
      interrupted |= terminateAndAwait(process);
      deleteTree(work);
      if (acquired) {
        PARSERS.release();
      }
      if (interrupted) {
        Thread.currentThread().interrupt();
      }
    }
  }

  private static boolean terminateAndAwait(Process process) {
    if (process == null || !process.isAlive())
      return false;
    process.destroyForcibly();
    boolean interrupted = false;
    while (process.isAlive()) {
      try {
        process.waitFor();
      } catch (InterruptedException exception) {
        interrupted = true;
      }
    }
    return interrupted;
  }

  private List<String> validationCommand(Path input, String type,
                                         boolean forceTimeout) {
    String java =
        Path.of(System.getProperty("java.home"), "bin", "java").toString();
    String classPath = System.getProperty("java.class.path");
    List<String> command = new ArrayList<>();
    command.add(java);
    command.add("-Xms16m");
    command.add("-Xmx96m");
    command.add("-Djava.io.tmpdir=" + input.getParent());
    command.add("-cp");
    command.add(classPath);
    if (!classPath.contains(System.getProperty("path.separator")) &&
        classPath.endsWith(".jar")) {
      command.add("-Dloader.main=" + EvidenceValidationWorker.class.getName());
      command.add("org.springframework.boot.loader.launch.PropertiesLauncher");
    } else {
      command.add(EvidenceValidationWorker.class.getName());
    }
    command.add(input.toString());
    command.add(type);
    if (forceTimeout) {
      command.add("--sleep");
    }
    return command;
  }

  private static void deleteTree(Path directory) {
    if (directory == null)
      return;
    try (var paths = Files.walk(directory)) {
      paths.sorted(Comparator.reverseOrder()).forEach(EvidenceService::quiet);
    } catch (IOException ignored) {
      // A validation directory is uncommitted and reconciliation also removes
      // staging.
    }
  }
  private String sanitize(String raw) {
    String n = Optional.ofNullable(raw).orElse("upload").replace('\\', '/');
    n = n.substring(n.lastIndexOf('/') + 1)
            .replaceAll("[\\p{Cntrl}]", "")
            .trim();
    if (n.isBlank())
      n = "upload";
    return n.length() > 255 ? n.substring(n.length() - 255) : n;
  }
  private void lock(String actor, UUID app, UUID req, String key) {
    if (postgres) {
      long value =
          ByteBuffer
              .wrap(digest(
                  (actor + app + req + key).getBytes(StandardCharsets.UTF_8)))
              .getLong();
      db.query("select pg_advisory_xact_lock(?)", rs -> null, value);
    }
  }
  private Optional<Receipt> receipt(String actor, UUID app, UUID req,
                                    String key) {
    return db
        .query("select payload_hash,upload_id,resulting_revision from "
                   + "evidence_upload_retry where actor_username=? and "
                   + "application_id=? and request_id=? and idempotency_key=?",
               (rs, n)
                   -> new Receipt(rs.getString(1), rs.getObject(2, UUID.class),
                                  rs.getLong(3)),
               actor, app, req, key)
        .stream()
        .findFirst();
  }
  private static boolean starts(byte[] v, byte[] p) {
    if (v.length < p.length)
      return false;
    for (int i = 0; i < p.length; i++)
      if (v[i] != p[i])
        return false;
    return true;
  }
  private static byte[] digest(byte[] b) {
    try {
      return MessageDigest.getInstance("SHA-256").digest(b);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
  private static String hex(byte[] b) {
    return HexFormat.of().formatHex(digest(b));
  }
  private static void quiet(Path p) {
    try {
      Files.deleteIfExists(p);
    } catch (IOException ignored) {
    }
  }
  private static void bad(String m) {
    throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_file", m);
  }
  private static void tooLarge() {
    throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "file_too_large",
                           "Files must be no larger than 10,000,000 bytes");
  }
  private static ApiException invalid(String m) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_file", m);
  }
  private static ApiException integrity() {
    return new ApiException(HttpStatus.CONFLICT, "file_integrity_failure",
                            "The retained file is temporarily unavailable. "
                                + "No replacement was made.");
  }
  private record Access(long revision, String applicability) {}
  private record Receipt(String hash, UUID upload, long revision) {}
  public record Upload(UUID id, UUID requestId, @JsonIgnore String storageKey,
                       String filename, String contentType, long byteSize,
                       String sha256, Instant createdAt, boolean ready) {}
  public record UploadResult(Upload upload, long revision) {}
  public record Download(Upload upload, InputStreamResource resource) {}
}
