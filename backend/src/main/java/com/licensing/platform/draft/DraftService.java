package com.licensing.platform.draft;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DraftService {
    private static final Set<String> FIELDS =
            Set.of(
                    "legalName",
                    "tradingName",
                    "registrationNumber",
                    "structure",
                    "applicantName",
                    "applicantRole",
                    "applicantEmail",
                    "applicantPhone");
    private static final Map<String, String> COLUMNS =
            Map.of(
                    "legalName", "legal_name",
                    "tradingName", "trading_name",
                    "registrationNumber", "registration_number",
                    "structure", "business_structure",
                    "applicantName", "applicant_name",
                    "applicantRole", "applicant_role",
                    "applicantEmail", "applicant_email",
                    "applicantPhone", "applicant_phone");
    private static final Pattern REGISTRATION = Pattern.compile("[A-Za-z0-9/-]{3,40}");
    private static final Pattern EMAIL =
            Pattern.compile(
                    "^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
                            + "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
                            + "(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$");
    private static final Pattern PHONE = Pattern.compile("^\\+?[0-9 ()-]*$");
    private static final String BASE_SELECT =
            """
            select id, revision, status, legal_name, trading_name, registration_number,
                   business_structure, applicant_name, applicant_role, applicant_email,
                   applicant_phone, updated_at
              from application_draft
            """;

    private final JdbcTemplate database;
    private final ObjectMapper objectMapper;
    private final boolean postgres;

    DraftService(JdbcTemplate database, ObjectMapper objectMapper, DataSource dataSource)
            throws SQLException {
        this.database = database;
        this.objectMapper = objectMapper;
        try (var connection = dataSource.getConnection()) {
            postgres = "PostgreSQL".equals(connection.getMetaData().getDatabaseProductName());
        }
    }

    public List<Draft> list(String owner) {
        return database.query(
                BASE_SELECT + " where owner_username=? order by updated_at desc, id",
                mapper(),
                owner);
    }

    public Draft get(UUID id, String owner) {
        return database.query(
                        BASE_SELECT + " where id=? and owner_username=?", mapper(), id, owner)
                .stream()
                .findFirst()
                .orElseThrow(
                        () ->
                                new ApiException(
                                        HttpStatus.NOT_FOUND, "not_found", "Draft not found"));
    }

    public Patch parsePatch(Map<String, Object> body) {
        Set<String> unknown = new java.util.TreeSet<>(body.keySet());
        unknown.removeAll(Set.of("expectedRevision", "fields"));
        if (!unknown.isEmpty()) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "invalid_request",
                    "Unknown request properties: " + String.join(", ", unknown));
        }
        Object revisionValue = body.get("expectedRevision");
        if (!(revisionValue instanceof Number number)
                || number.longValue() < 0
                || number.doubleValue() != number.longValue()) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "invalid_request",
                    "expectedRevision must be a non-negative integer");
        }
        Object fieldsValue = body.get("fields");
        if (fieldsValue == null) {
            return new Patch(number.longValue(), Map.of());
        }
        if (!(fieldsValue instanceof Map<?, ?> suppliedFields)) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "invalid_request", "fields must be an object");
        }
        Map<String, Object> fields = new LinkedHashMap<>();
        suppliedFields.forEach(
                (key, value) -> {
                    if (!(key instanceof String field)) {
                        throw new ApiException(
                                HttpStatus.BAD_REQUEST,
                                "invalid_request",
                                "field identifiers must be text");
                    }
                    fields.put(field, value);
                });
        return new Patch(number.longValue(), fields);
    }

    @Transactional
    public Draft create(String owner, String key, Map<String, Object> suppliedPayload) {
        if (key.isBlank() || key.length() > 100) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "invalid_request",
                    "Idempotency-Key must contain 1–100 characters");
        }

        Map<String, Object> payload = canonicalPayload(suppliedPayload);
        String fingerprint = fingerprint(payload);
        lockCreateReceipt(owner, key);

        Optional<CreateReceipt> existing = findReceipt(owner, key);
        if (existing.isPresent()) {
            CreateReceipt receipt = existing.get();
            if (!fingerprint.equals(receipt.payloadHash())) {
                throw new ApiException(
                        HttpStatus.CONFLICT,
                        "idempotency_conflict",
                        "That retry key was already used with a different request");
            }
            return get(receipt.applicationId(), owner);
        }

        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        database.update(
                """
                insert into application_draft(
                    id, owner_username, status, revision, created_at, updated_at
                ) values (?, ?, 'DRAFT', 0, ?, ?)
                """,
                id,
                owner,
                Timestamp.from(now),
                Timestamp.from(now));
        database.update(
                """
                insert into draft_create_retry(
                    owner_username, idempotency_key, payload_hash, application_id
                ) values (?, ?, ?, ?)
                """,
                owner,
                key,
                fingerprint,
                id);
        return payload.isEmpty() ? get(id, owner) : save(id, owner, new Patch(0L, payload));
    }

    @Transactional
    public Draft save(UUID id, String owner, Patch patch) {
        if (patch.expectedRevision() == null) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "invalid_request", "expectedRevision is required");
        }
        Map<String, Object> values = canonicalPayload(patch.fields() == null ? Map.of() : patch.fields());
        List<String> assignments = new ArrayList<>();
        List<Object> arguments = new ArrayList<>();
        values.forEach(
                (field, value) -> {
                    assignments.add(COLUMNS.get(field) + "=?");
                    arguments.add(value);
                });

        if (assignments.isEmpty()) {
            assignments.add("revision=revision");
        } else {
            assignments.add("revision=revision+1");
            assignments.add("updated_at=?");
            arguments.add(Timestamp.from(Instant.now()));
        }
        arguments.add(id);
        arguments.add(owner);
        arguments.add(patch.expectedRevision());

        int changed =
                database.update(
                        "update application_draft set "
                                + String.join(", ", assignments)
                                + " where id=? and owner_username=? and status='DRAFT' and revision=?",
                        arguments.toArray());
        if (changed == 0) {
            boolean owned =
                    database.queryForObject(
                                    "select count(*) from application_draft where id=? and owner_username=?",
                                    Integer.class,
                                    id,
                                    owner)
                            > 0;
            if (!owned) {
                throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "Draft not found");
            }
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "stale_revision",
                    "This draft changed elsewhere. Reload the saved draft; your unsaved values have been retained.");
        }
        return get(id, owner);
    }

    private void lockCreateReceipt(String owner, String key) {
        if (!postgres) {
            return;
        }
        long lockId =
                ByteBuffer.wrap(sha256((owner + "\0" + key).getBytes(StandardCharsets.UTF_8)))
                        .getLong();
        database.query("select pg_advisory_xact_lock(?)", resultSet -> null, lockId);
    }

    private Optional<CreateReceipt> findReceipt(String owner, String key) {
        return database.query(
                        """
                        select payload_hash, application_id
                          from draft_create_retry
                         where owner_username=? and idempotency_key=?
                        """,
                        (resultSet, row) ->
                                new CreateReceipt(
                                        resultSet.getString("payload_hash"),
                                        resultSet.getObject("application_id", UUID.class)),
                        owner,
                        key)
                .stream()
                .findFirst();
    }

    private Map<String, Object> canonicalPayload(Map<String, Object> values) {
        Map<String, String> errors = validate(values);
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        Map<String, Object> canonical = new TreeMap<>();
        values.forEach((field, value) -> canonical.put(field, normalize(field, value)));
        return canonical;
    }

    private Map<String, String> validate(Map<String, Object> values) {
        Map<String, String> errors = new LinkedHashMap<>();
        values.forEach(
                (field, value) -> {
                    if (!FIELDS.contains(field)) {
                        errors.put(field, "Unknown field");
                    } else if (value != null && !(value instanceof String)) {
                        errors.put(field, "Must be text or null");
                    }
                });
        checkLength(values, errors, "legalName", 1, 200);
        checkLength(values, errors, "tradingName", 0, 200);
        checkLength(values, errors, "applicantName", 1, 120);
        checkLength(values, errors, "applicantEmail", 1, 254);
        checkLength(values, errors, "applicantPhone", 1, 32);
        string(values, "registrationNumber")
                .filter(value -> !REGISTRATION.matcher(value).matches())
                .ifPresent(
                        ignored ->
                                errors.put(
                                        "registrationNumber",
                                        "Use 3–40 letters, digits, hyphens, or slashes"));
        enumValue(
                values,
                errors,
                "structure",
                Set.of("SOLE_PROPRIETOR", "PARTNERSHIP", "COMPANY", "OTHER"));
        enumValue(
                values,
                errors,
                "applicantRole",
                Set.of("OWNER", "DIRECTOR", "EMPLOYEE", "REPRESENTATIVE"));
        string(values, "applicantEmail")
                .filter(value -> !EMAIL.matcher(value).matches())
                .ifPresent(ignored -> errors.put("applicantEmail", "Enter a valid email address"));
        string(values, "applicantPhone")
                .filter(
                        value -> {
                            int digits = value.replaceAll("\\D", "").length();
                            return !PHONE.matcher(value).matches() || digits < 7 || digits > 15;
                        })
                .ifPresent(
                        ignored ->
                                errors.put(
                                        "applicantPhone",
                                        "Use 7–15 digits with +, spaces, parentheses, or hyphens"));
        return errors;
    }

    private void checkLength(
            Map<String, Object> values,
            Map<String, String> errors,
            String field,
            int minimum,
            int maximum) {
        string(values, field)
                .filter(value -> value.length() < minimum || value.length() > maximum)
                .ifPresent(
                        ignored ->
                                errors.put(
                                        field,
                                        "Must be " + minimum + "–" + maximum + " characters"));
    }

    private void enumValue(
            Map<String, Object> values,
            Map<String, String> errors,
            String field,
            Set<String> allowed) {
        string(values, field)
                .filter(value -> !allowed.contains(value))
                .ifPresent(ignored -> errors.put(field, "Choose a valid value"));
    }

    private Optional<String> string(Map<String, Object> values, String field) {
        if (!values.containsKey(field)
                || values.get(field) == null
                || !(values.get(field) instanceof String value)) {
            return Optional.empty();
        }
        return Optional.of(value.trim());
    }

    private Object normalize(String field, Object value) {
        if (value == null) {
            return null;
        }
        String normalized = ((String) value).trim();
        return field.equals("tradingName") && normalized.isBlank() ? null : normalized;
    }

    private String fingerprint(Map<String, Object> canonicalPayload) {
        try {
            byte[] serialized = objectMapper.writeValueAsBytes(canonicalPayload);
            return HexFormat.of().formatHex(sha256(serialized));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Unable to fingerprint draft creation", exception);
        }
    }

    private byte[] sha256(byte[] value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private RowMapper<Draft> mapper() {
        return (resultSet, row) ->
                new Draft(
                        resultSet.getObject("id", UUID.class),
                        resultSet.getLong("revision"),
                        resultSet.getString("status"),
                        resultSet.getString("legal_name"),
                        resultSet.getString("trading_name"),
                        resultSet.getString("registration_number"),
                        resultSet.getString("business_structure"),
                        resultSet.getString("applicant_name"),
                        resultSet.getString("applicant_role"),
                        resultSet.getString("applicant_email"),
                        resultSet.getString("applicant_phone"),
                        resultSet.getTimestamp("updated_at").toInstant());
    }

    private record CreateReceipt(String payloadHash, UUID applicationId) {}

    public record Patch(Long expectedRevision, Map<String, Object> fields) {}

    public record Draft(
            UUID id,
            long revision,
            String status,
            String legalName,
            String tradingName,
            String registrationNumber,
            String structure,
            String applicantName,
            String applicantRole,
            String applicantEmail,
            String applicantPhone,
            Instant updatedAt) {}
}
