package com.licensing.platform;

import static org.junit.jupiter.api.Assertions.*;

import com.licensing.platform.draft.DraftService;
import java.util.Map;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

@SpringBootTest
class DraftIntegrationTest {
 @Autowired DraftService drafts; @Autowired JdbcTemplate db; @Autowired PasswordEncoder encoder;
 @BeforeEach void seed(){ db.update("delete from draft_create_retry");db.update("delete from application_draft");db.update("delete from app_user"); for(String name:new String[]{"owner-a","owner-b"}) db.update("insert into app_user values (?,?,?)",name,encoder.encode("password"),"OPERATOR"); }
 @Test void retryIsIdempotentAndOwnerScoped(){ var first=drafts.create("owner-a","retry-1",Map.of("legalName","Cafe")); var repeated=drafts.create("owner-a","retry-1",Map.of("legalName","Cafe")); assertEquals(first.id(),repeated.id()); assertEquals(1,drafts.list("owner-a").size()); assertTrue(drafts.list("owner-b").isEmpty()); assertThrows(RuntimeException.class,()->drafts.get(first.id(),"owner-b")); assertThrows(RuntimeException.class,()->drafts.create("owner-a","retry-1",Map.of("legalName","Different"))); }
 @Test void incompletePatchPersistsAndNullClearsOptionalValue(){ var d=drafts.create("owner-a","retry-2",Map.of()); var saved=drafts.save(d.id(),"owner-a",new DraftService.Patch(0L,Map.of("tradingName","  Counter Cafe  ","applicantRole","REPRESENTATIVE"))); assertEquals("Counter Cafe",saved.tradingName()); assertEquals(1,saved.revision()); var cleared=drafts.save(d.id(),"owner-a",new DraftService.Patch(1L,new java.util.HashMap<>(){{put("tradingName",null);}})); assertNull(cleared.tradingName()); }
 @Test void validationAndCompetingSaveNeverOverwrite(){ var d=drafts.create("owner-a","retry-3",Map.of()); assertThrows(RuntimeException.class,()->drafts.save(d.id(),"owner-a",new DraftService.Patch(0L,Map.of("applicantEmail","not-email")))); assertEquals(0,drafts.get(d.id(),"owner-a").revision()); drafts.save(d.id(),"owner-a",new DraftService.Patch(0L,Map.of("legalName","First"))); assertThrows(RuntimeException.class,()->drafts.save(d.id(),"owner-a",new DraftService.Patch(0L,Map.of("legalName","Stale")))); assertEquals("First",drafts.get(d.id(),"owner-a").legalName()); }
}
