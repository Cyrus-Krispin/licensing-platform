package com.licensing.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.licensing.platform.draft.DraftService;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

@SpringBootTest
class DraftIntegrationTest {
    @Autowired DraftService drafts;
    @Autowired JdbcTemplate database;
    @Autowired PasswordEncoder encoder;
    @Autowired DataSource dataSource;

    @BeforeEach
    void seed() {
        database.update("delete from draft_create_retry");
        database.update("delete from application_draft");
        database.update("delete from app_user");
        for (String name : new String[] {"owner-a", "owner-b"}) {
            database.update(
                    "insert into app_user values (?, ?, ?)",
                    name,
                    encoder.encode("password"),
                    "OPERATOR");
        }
    }

    @Test
    void equivalentReorderedCreatePayloadUsesOneReceipt() {
        Map<String, Object> firstOrder = new LinkedHashMap<>();
        firstOrder.put("legalName", "  Cafe  ");
        firstOrder.put("applicantRole", "OWNER");
        Map<String, Object> secondOrder = new LinkedHashMap<>();
        secondOrder.put("applicantRole", "OWNER");
        secondOrder.put("legalName", "Cafe");

        var first = drafts.create("owner-a", "retry-1", firstOrder);
        var repeated = drafts.create("owner-a", "retry-1", secondOrder);

        assertEquals(first.id(), repeated.id());
        assertEquals(1, drafts.list("owner-a").size());
        assertTrue(drafts.list("owner-b").isEmpty());
    }

    @Test
    void structuredCreateAndReorderedRetryShareCanonicalReceipt() {
        Map<String, Object> monday = new LinkedHashMap<>();
        monday.put("opens", "09:00");
        monday.put("closed", false);
        monday.put("closesNextDay", false);
        monday.put("closes", "17:00");
        var first = drafts.create("owner-a", "structured-create", Map.of(
                "preparationActivities", List.of("COOKING", "BAKING"),
                "serviceModes", List.of("TAKEAWAY", "DINE_IN"),
                "operatingHours", Map.of("MONDAY", monday)));
        var retry = drafts.create("owner-a", "structured-create", Map.of(
                "operatingHours", Map.of("MONDAY", Map.of("closed", false, "opens", "09:00", "closes", "17:00", "closesNextDay", false)),
                "serviceModes", List.of("DINE_IN", "TAKEAWAY"),
                "preparationActivities", List.of("BAKING", "COOKING")));

        assertEquals(first.id(), retry.id());
        assertEquals(List.of("BAKING", "COOKING"), retry.preparationActivities());
        assertEquals("09:00", retry.operatingHours().get("MONDAY").opens());
    }

    @Test
    void incompletePatchPersistsAndNullClearsOptionalValue() {
        var draft = drafts.create("owner-a", "retry-2", Map.of());
        var saved =
                drafts.save(
                        draft.id(),
                        "owner-a",
                        new DraftService.Patch(
                                0L,
                                Map.of(
                                        "tradingName",
                                        "  Counter Cafe  ",
                                        "applicantRole",
                                        "REPRESENTATIVE")));
        assertEquals("Counter Cafe", saved.tradingName());
        assertEquals(1, saved.revision());

        Map<String, Object> clear = new LinkedHashMap<>();
        clear.put("tradingName", null);
        var cleared =
                drafts.save(
                        draft.id(), "owner-a", new DraftService.Patch(1L, clear));
        assertNull(cleared.tradingName());
    }

    @Test
    void operationsNormalizePersistAndDriveSavedProgress() {
        var draft = drafts.create("owner-a", "operations", Map.of());
        assertEquals(0, draft.completion().completed());
        assertEquals(19, draft.completion().required());

        Map<String, Object> hours = new LinkedHashMap<>();
        hours.put("MONDAY", Map.of("closed", true));
        hours.put("TUESDAY", Map.of("closed", false, "opens", "09:00", "closes", "17:00", "closesNextDay", false));
        hours.put("WEDNESDAY", Map.of("closed", false, "opens", "18:00", "closes", "02:00", "closesNextDay", true));
        var saved = drafts.save(draft.id(), "owner-a", new DraftService.Patch(0L, Map.of(
                "businessType", "CAFE", "preparationActivities", List.of("COOKING", "BAKING"),
                "serviceModes", List.of("TAKEAWAY"), "operatingHours", hours,
                "proposedOpeningDate", "2020-02-29", "unitApplicable", false)));

        assertEquals(List.of("BAKING", "COOKING"), saved.preparationActivities());
        assertEquals("02:00", saved.operatingHours().get("WEDNESDAY").closes());
        assertEquals(5, saved.completion().completed());
        assertEquals(19, saved.completion().required());
        assertEquals(saved.operatingHours(), drafts.get(draft.id(), "owner-a").operatingHours());
    }

    @Test
    void invalidOperationsAreAtomic() {
        var draft = drafts.create("owner-a", "invalid-operations", Map.of());
        for (Map<String, Object> invalid : List.of(
                Map.<String, Object>of("preparationActivities", List.of("COOKING", "COOKING")),
                Map.<String, Object>of("serviceModes", List.of("CURBSIDE")),
                Map.<String, Object>of("proposedOpeningDate", "2023-02-29"),
                Map.<String, Object>of("proposedOpeningDate", "+10000-01-01"),
                Map.<String, Object>of("proposedOpeningDate", "-0001-01-01"),
                Map.<String, Object>of("operatingHours", Map.of("MONDAY", Map.of("closed", false, "opens", "09:00", "closes", "09:00", "closesNextDay", false))),
                Map.<String, Object>of("operatingHours", Map.of("FUNDAY", Map.of("closed", true))),
                Map.<String, Object>of("operatingHours", Map.of("MONDAY", Map.of("closed", true, "opens", "09:00"))))) {
            assertThrows(RuntimeException.class, () -> drafts.save(draft.id(), "owner-a", new DraftService.Patch(0L, invalid)));
        }
        assertEquals(0, drafts.get(draft.id(), "owner-a").revision());
    }

    @Test
    void premisesConditionsChangeWithoutReplacingRequestIdentities() {
        var draft = drafts.create("owner-a", "premises", Map.of());
        Map<String, UUID> initial = draft.documentRequests().stream().collect(
                java.util.stream.Collectors.toMap(DraftService.DocumentRequest::type, DraftService.DocumentRequest::id));

        var rented = drafts.save(draft.id(), "owner-a", new DraftService.Patch(0L,
                Map.of("premisesAddress", "  10 Market Street  ", "premisesName", "  ",
                        "unitApplicable", true, "unitNumber", " Suite 2 ", "tenure", "RENTED",
                        "applicantRole", "REPRESENTATIVE")));
        assertEquals("10 Market Street", rented.premisesAddress());
        assertNull(rented.premisesName());
        assertEquals("Suite 2", rented.unitNumber());
        assertEquals("APPLICABLE", request(rented, "LEASE_EVIDENCE").applicability());
        assertEquals("NOT_APPLICABLE", request(rented, "OWNERSHIP_EVIDENCE").applicability());
        assertEquals("APPLICABLE", request(rented, "REPRESENTATIVE_AUTHORIZATION").applicability());

        var owned = drafts.save(draft.id(), "owner-a", new DraftService.Patch(1L,
                Map.of("tenure", "OWNED", "applicantRole", "OWNER")));
        assertEquals("NOT_APPLICABLE", request(owned, "LEASE_EVIDENCE").applicability());
        assertEquals("APPLICABLE", request(owned, "OWNERSHIP_EVIDENCE").applicability());
        assertEquals("NOT_APPLICABLE", request(owned, "REPRESENTATIVE_AUTHORIZATION").applicability());
        owned.documentRequests().forEach(item -> assertEquals(initial.get(item.type()), item.id()));
        assertEquals(6, database.queryForObject("select count(*) from document_request where application_id=?", Integer.class, draft.id()));
    }

    @Test
    void inconsistentUnitUpdateRollsBackFieldsRequestsAndRevision() {
        var draft = drafts.create("owner-a", "unit-rollback", Map.of("tenure", "RENTED"));
        UUID leaseId = request(draft, "LEASE_EVIDENCE").id();
        assertThrows(RuntimeException.class, () -> drafts.save(draft.id(), "owner-a",
                new DraftService.Patch(1L, Map.of("premisesAddress", "Changed", "unitApplicable", false, "unitNumber", "4"))));
        var unchanged = drafts.get(draft.id(), "owner-a");
        assertNull(unchanged.premisesAddress());
        assertEquals(1, unchanged.revision());
        assertEquals(leaseId, request(unchanged, "LEASE_EVIDENCE").id());
    }

    private DraftService.DocumentRequest request(DraftService.Draft draft, String type) {
        return draft.documentRequests().stream().filter(item -> item.type().equals(type)).findFirst().orElseThrow();
    }

    @Test
    void simultaneousPostgresRetriesConvergeOnOneCommittedDraft() throws Exception {
        assumeTrue(isPostgres(), "H2 verifies portable behavior; CI PostgreSQL verifies locking");
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first =
                    executor.submit(
                            () -> {
                                ready.countDown();
                                start.await();
                                return drafts.create(
                                        "owner-a", "concurrent-key", Map.of("legalName", "Cafe", "preparationActivities", List.of("COOKING", "BAKING"), "operatingHours", Map.of("MONDAY", Map.of("closed", true))));
                            });
            var second =
                    executor.submit(
                            () -> {
                                ready.countDown();
                                start.await();
                                return drafts.create(
                                        "owner-a", "concurrent-key", Map.of("operatingHours", Map.of("MONDAY", Map.of("closed", true)), "preparationActivities", List.of("BAKING", "COOKING"), "legalName", "Cafe"));
                            });
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();

            assertEquals(first.get(10, TimeUnit.SECONDS).id(), second.get(10, TimeUnit.SECONDS).id());
        }
        assertEquals(1, drafts.list("owner-a").size());
    }

    @Test
    void concurrentPostgresReadsNeverMixDraftAndRequirementRevisions() throws Exception {
        assumeTrue(
                isPostgres(),
                "H2 verifies portable reads; CI PostgreSQL verifies read/write snapshots");
        var initial = drafts.create("owner-a", "read-consistency", Map.of("tenure", "RENTED"));
        Map<String, UUID> requestIds =
                initial.documentRequests().stream()
                        .collect(
                                java.util.stream.Collectors.toMap(
                                        DraftService.DocumentRequest::type,
                                        DraftService.DocumentRequest::id));
        AtomicBoolean writing = new AtomicBoolean(true);
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            var writer =
                    executor.submit(
                            () -> {
                                start.await();
                                var current = initial;
                                try {
                                    for (int index = 0; index < 100; index++) {
                                        String tenure = index % 2 == 0 ? "OWNED" : "RENTED";
                                        current =
                                                drafts.save(
                                                        current.id(),
                                                        "owner-a",
                                                        new DraftService.Patch(
                                                                current.revision(),
                                                                Map.of("tenure", tenure)));
                                    }
                                    return current;
                                } finally {
                                    writing.set(false);
                                }
                            });
            var reader =
                    executor.submit(
                            () -> {
                                start.await();
                                int reads = 0;
                                do {
                                    assertCoherent(drafts.get(initial.id(), "owner-a"), requestIds);
                                    assertCoherent(drafts.list("owner-a").getFirst(), requestIds);
                                    reads++;
                                } while (writing.get() || reads < 100);
                                return reads;
                            });

            start.countDown();
            assertCoherent(writer.get(20, TimeUnit.SECONDS), requestIds);
            assertTrue(reader.get(20, TimeUnit.SECONDS) >= 100);
        }
    }

    private void assertCoherent(DraftService.Draft draft, Map<String, UUID> requestIds) {
        String lease = request(draft, "LEASE_EVIDENCE").applicability();
        String ownership = request(draft, "OWNERSHIP_EVIDENCE").applicability();
        if (draft.tenure().equals("RENTED")) {
            assertEquals("APPLICABLE", lease);
            assertEquals("NOT_APPLICABLE", ownership);
        } else {
            assertEquals("NOT_APPLICABLE", lease);
            assertEquals("APPLICABLE", ownership);
        }
        draft.documentRequests()
                .forEach(request -> assertEquals(requestIds.get(request.type()), request.id()));
    }

    private boolean isPostgres() throws SQLException {
        try (var connection = dataSource.getConnection()) {
            return "PostgreSQL".equals(connection.getMetaData().getDatabaseProductName());
        }
    }
}
