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
                    "applicantPhone",
                    "premisesAddress",
                    "premisesName",
                    "unitApplicable",
                    "unitNumber",
                    "tenure");
    private static final Map<String, String> COLUMNS =
            Map.ofEntries(
                    Map.entry("legalName", "legal_name"),
                    Map.entry("tradingName", "trading_name"),
                    Map.entry("registrationNumber", "registration_number"),
                    Map.entry("structure", "business_structure"),
                    Map.entry("applicantName", "applicant_name"),
                    Map.entry("applicantRole", "applicant_role"),
                    Map.entry("applicantEmail", "applicant_email"),
                    Map.entry("applicantPhone", "applicant_phone"),
                    Map.entry("premisesAddress", "premises_address"),
                    Map.entry("premisesName", "premises_name"),
                    Map.entry("unitApplicable", "unit_applicable"),
                    Map.entry("unitNumber", "unit_number"),
                    Map.entry("tenure", "tenure"));
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
                   applicant_phone, premises_address, premises_name, unit_applicable,
                   unit_number, tenure, updated_at
              from application_draft
            """;
    private static final String JOINED_SELECT =
            """
            select d.id, d.revision, d.status, d.legal_name, d.trading_name,
                   d.registration_number, d.business_structure, d.applicant_name,
                   d.applicant_role, d.applicant_email, d.applicant_phone,
                   d.premises_address, d.premises_name, d.unit_applicable,
                   d.unit_number, d.tenure, d.updated_at,
                   r.id as request_id, r.request_type, r.applicability, r.reason
              from application_draft d
              join document_request r on r.application_id=d.id
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
        return queryDrafts(
                JOINED_SELECT
                        + " where d.owner_username=?"
                        + " order by d.updated_at desc, d.id, r.request_type",
                owner);
    }

    public Draft get(UUID id, String owner) {
        return queryDrafts(
                        JOINED_SELECT
                                + " where d.id=? and d.owner_username=?"
                                + " order by r.request_type",
                        id,
                        owner)
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
        insertRequests(id, null, null);
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
        Map<String, Object> values =
                canonicalPayload(patch.fields() == null ? Map.of() : patch.fields());
        Draft current =
                database.query(
                                BASE_SELECT
                                        + " where id=? and owner_username=?"
                                        + " and status='DRAFT' for update",
                                draftRowMapper(),
                                id,
                                owner)
                        .stream()
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        new ApiException(
                                                HttpStatus.NOT_FOUND,
                                                "not_found",
                                                "Draft not found"));
        if (current.revision() != patch.expectedRevision()) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "stale_revision",
                    "This draft changed elsewhere. Reload the saved draft; your unsaved values have been retained.");
        }
        validateConsistency(current, values);
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
            throw new IllegalStateException("Locked draft disappeared during save");
        }
        String tenure =
                values.containsKey("tenure") ? (String) values.get("tenure") : current.tenure();
        String role =
                values.containsKey("applicantRole")
                        ? (String) values.get("applicantRole")
                        : current.applicantRole();
        updateRequests(id, tenure, role);
        return get(id, owner);
    }

    private void validateConsistency(Draft current, Map<String, Object> values) {
        Boolean applicable =
                values.containsKey("unitApplicable")
                        ? (Boolean) values.get("unitApplicable")
                        : current.unitApplicable();
        String number =
                values.containsKey("unitNumber")
                        ? (String) values.get("unitNumber")
                        : current.unitNumber();
        if (Boolean.FALSE.equals(applicable) && number != null) {
            throw new ValidationException(
                    Map.of("unitNumber", "Clear the unit number before choosing no unit"));
        }
    }

    private void insertRequests(UUID id, String tenure, String role) {
        for (String type : requestTypes()) {
            RequestState state = requestState(type, tenure, role);
            database.update(
                    """
                    insert into document_request(
                        id, application_id, request_type, applicability, reason
                    ) values (?, ?, ?, ?, ?)
                    """,
                    UUID.randomUUID(),
                    id,
                    type,
                    state.applicability(),
                    state.reason());
        }
    }

    private void updateRequests(UUID id, String tenure, String role) {
        for (String type : requestTypes()) {
            RequestState state = requestState(type, tenure, role);
            database.update(
                    """
                    update document_request
                       set applicability=?, reason=?
                     where application_id=? and request_type=?
                    """,
                    state.applicability(),
                    state.reason(),
                    id,
                    type);
        }
    }

    private List<String> requestTypes() {
        return List.of(
                "BUSINESS_REGISTRATION",
                "PREMISES_LAYOUT",
                "FOOD_USE_PERMISSION",
                "LEASE_EVIDENCE",
                "OWNERSHIP_EVIDENCE",
                "REPRESENTATIVE_AUTHORIZATION");
    }

    private RequestState requestState(String type, String tenure, String role) {
        if (Set.of("BUSINESS_REGISTRATION", "PREMISES_LAYOUT", "FOOD_USE_PERMISSION")
                .contains(type)) {
            return new RequestState("APPLICABLE", "Required for every application.");
        }
        if (type.equals("LEASE_EVIDENCE")) {
            if (tenure == null) {
                return new RequestState(
                        "NEEDS_INPUT",
                        "Set the premises tenure to determine whether lease evidence is required.");
            }
            return tenure.equals("RENTED")
                    ? new RequestState("APPLICABLE", "Required because the premises are rented.")
                    : new RequestState(
                            "NOT_APPLICABLE", "Not required because the premises are owned.");
        }
        if (type.equals("OWNERSHIP_EVIDENCE")) {
            if (tenure == null) {
                return new RequestState(
                        "NEEDS_INPUT",
                        "Set the premises tenure to determine whether ownership evidence is required.");
            }
            return tenure.equals("OWNED")
                    ? new RequestState("APPLICABLE", "Required because the premises are owned.")
                    : new RequestState(
                            "NOT_APPLICABLE", "Not required because the premises are rented.");
        }
        if (role == null) {
            return new RequestState(
                    "NEEDS_INPUT",
                    "Set the applicant role to determine whether representative authorization is required.");
        }
        return role.equals("REPRESENTATIVE")
                ? new RequestState(
                        "APPLICABLE", "Required because the applicant is a representative.")
                : new RequestState(
                        "NOT_APPLICABLE",
                        "Not required because the applicant is not a representative.");
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
                    } else if (field.equals("unitApplicable") && value != null && !(value instanceof Boolean)) {
                        errors.put(field, "Must be true, false, or null");
                    } else if (!field.equals("unitApplicable") && value != null && !(value instanceof String)) {
                        errors.put(field, "Must be text or null");
                    }
                });
        checkLength(values, errors, "legalName", 1, 200);
        checkLength(values, errors, "tradingName", 0, 200);
        checkLength(values, errors, "applicantName", 1, 120);
        checkLength(values, errors, "applicantEmail", 1, 254);
        checkLength(values, errors, "applicantPhone", 1, 32);
        checkLength(values, errors, "premisesAddress", 1, 500);
        checkLength(values, errors, "premisesName", 0, 200);
        checkLength(values, errors, "unitNumber", 1, 40);
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
        enumValue(values, errors, "tenure", Set.of("OWNED", "RENTED"));
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
        if (field.equals("unitApplicable")) {
            return value;
        }
        String normalized = ((String) value).trim();
        return (field.equals("tradingName") || field.equals("premisesName"))
                        && normalized.isBlank()
                ? null
                : normalized;
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

    private List<Draft> queryDrafts(String sql, Object... arguments) {
        return database.query(
                sql,
                resultSet -> {
                    Map<UUID, DraftRows> rows = new LinkedHashMap<>();
                    while (resultSet.next()) {
                        UUID id = resultSet.getObject("id", UUID.class);
                        DraftRows draftRows = rows.get(id);
                        if (draftRows == null) {
                            draftRows =
                                    new DraftRows(
                                            draftRowMapper().mapRow(resultSet, rows.size()),
                                            new ArrayList<>());
                            rows.put(id, draftRows);
                        }
                        draftRows.requests().add(
                                new DocumentRequest(
                                        resultSet.getObject("request_id", UUID.class),
                                        resultSet.getString("request_type"),
                                        resultSet.getString("applicability"),
                                        resultSet.getString("reason")));
                    }
                    return rows.values().stream().map(DraftRows::toDraft).toList();
                },
                arguments);
    }

    private RowMapper<Draft> draftRowMapper() {
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
                        resultSet.getString("premises_address"),
                        resultSet.getString("premises_name"),
                        (Boolean) resultSet.getObject("unit_applicable"),
                        resultSet.getString("unit_number"),
                        resultSet.getString("tenure"),
                        List.of(),
                        resultSet.getTimestamp("updated_at").toInstant());
    }

    private record CreateReceipt(String payloadHash, UUID applicationId) {}
    private record RequestState(String applicability, String reason) {}

    private record DraftRows(Draft draft, List<DocumentRequest> requests) {
        Draft toDraft() {
            return new Draft(
                    draft.id(),
                    draft.revision(),
                    draft.status(),
                    draft.legalName(),
                    draft.tradingName(),
                    draft.registrationNumber(),
                    draft.structure(),
                    draft.applicantName(),
                    draft.applicantRole(),
                    draft.applicantEmail(),
                    draft.applicantPhone(),
                    draft.premisesAddress(),
                    draft.premisesName(),
                    draft.unitApplicable(),
                    draft.unitNumber(),
                    draft.tenure(),
                    List.copyOf(requests),
                    draft.updatedAt());
        }
    }

    public record DocumentRequest(UUID id, String type, String applicability, String reason) {}

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
            String premisesAddress,
            String premisesName,
            Boolean unitApplicable,
            String unitNumber,
            String tenure,
            List<DocumentRequest> documentRequests,
            Instant updatedAt) {}
}
