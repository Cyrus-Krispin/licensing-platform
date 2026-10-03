package com.licensing.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.licensing.platform.draft.DraftService;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
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
                                        "owner-a", "concurrent-key", Map.of("legalName", "Cafe"));
                            });
            var second =
                    executor.submit(
                            () -> {
                                ready.countDown();
                                start.await();
                                return drafts.create(
                                        "owner-a", "concurrent-key", Map.of("legalName", "Cafe"));
                            });
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();

            assertEquals(first.get(10, TimeUnit.SECONDS).id(), second.get(10, TimeUnit.SECONDS).id());
        }
        assertEquals(1, drafts.list("owner-a").size());
    }

    private boolean isPostgres() throws SQLException {
        try (var connection = dataSource.getConnection()) {
            return "PostgreSQL".equals(connection.getMetaData().getDatabaseProductName());
        }
    }
}
