package com.licensing.platform.draft;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;

@SpringBootTest(properties="licensing.file-storage-path=target/test-workflow")
class WorkflowIntegrationTest {
 @Autowired DraftService drafts; @Autowired EvidenceService evidence;
 @Autowired SimulatedCheckService checks; @Autowired WorkflowService workflow; @Autowired JdbcTemplate db;
 String owner,officer;
 @BeforeEach void seed(){owner="flow-owner-"+UUID.randomUUID();officer="flow-officer-"+UUID.randomUUID();db.update("insert into app_user values(?,?,?)",owner,"test-hash","OPERATOR");db.update("insert into app_user values(?,?,?)",officer,"test-hash","OFFICER");}
 @AfterEach void cleanup(){db.update("delete from evidence_upload_retry where actor_username=?",owner);db.update("update document_request set current_upload_id=null where application_id in (select id from application_draft where owner_username=?)",owner);db.update("delete from evidence_upload where created_by=?",owner);db.update("delete from draft_create_retry where owner_username=?",owner);db.update("delete from application_draft where owner_username=?",owner);db.update("delete from app_user where username in (?,?)",owner,officer);}
 DraftService.Draft complete(){
  Map<String,Object> fields=new HashMap<>(Map.of("legalName","Review Cafe","registrationNumber","REG-100","structure","COMPANY","applicantName","Owner","applicantRole","OWNER","applicantEmail","owner@example.test","applicantPhone","+65 6123 4567","premisesAddress","10 Test Street","unitApplicable",false,"tenure","OWNED"));
  fields.put("businessType","CAFE");fields.put("proposedOpeningDate","2026-10-04");fields.put("preparationActivities",List.of("COOKING"));fields.put("serviceModes",List.of("DINE_IN"));
  Map<String,Object> hours=new HashMap<>();for(String day:List.of("MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"))hours.put(day,Map.of("closed",true));fields.put("operatingHours",hours);
  var d=drafts.create(owner,UUID.randomUUID().toString(),fields);
  byte[] png=Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
  for(var r:d.documentRequests())if(r.applicability().equals("APPLICABLE")){evidence.upload(d.id(),r.id(),owner,d.revision(),UUID.randomUUID().toString(),new MockMultipartFile("file","proof.png","image/png",png));d=drafts.get(d.id(),owner);}return d;
 }
 WorkflowService.CaseDetail command(UUID app,String actor,String op,Map<String,Object> extra){var c=workflow.get(app,actor);var body=new HashMap<String,Object>(extra);body.put("expectedRevision",c.revision());body.put("expectedVersion",c.latestVersion());return workflow.command(app,actor,op,UUID.randomUUID().toString(),body);}
 WorkflowService.CaseDetail submit(DraftService.Draft d){return command(d.id(),owner,"submit",Map.of("accuracy",true,"authority",true));}
 @Test void incompleteAndFreshDeclarationsCannotSubmit(){var d=drafts.create(owner,"draft",Map.of());assertThrows(ApiException.class,()->submit(d));var full=complete();assertThrows(ApiException.class,()->command(full.id(),owner,"submit",Map.of("accuracy",true,"authority",false)));assertEquals("DRAFT",drafts.get(full.id(),owner).status());}
 @Test void submissionSnapshotLocksAndApprovalNotification(){var d=complete();final UUID id=d.id();var c=submit(d);assertEquals("APPLICATION_RECEIVED",c.status());assertEquals(1,c.versions().size());assertNull(workflow.get(d.id(),officer).working());assertThrows(ApiException.class,()->drafts.save(id,owner,new DraftService.Patch(workflow.get(id,owner).revision(),Map.of("legalName","bad"))));command(d.id(),officer,"start-review",Map.of());c=command(d.id(),officer,"decision",Map.of("outcome","APPROVED","explanation","All required evidence reviewed."));assertEquals("APPROVED",c.status());assertEquals("Review Cafe",c.versions().getFirst().snapshot().legalName());assertTrue(workflow.notifications(owner).size()>=3);assertThrows(ApiException.class,()->command(id,owner,"resubmit",Map.of("accuracy",true,"authority",true)));}
 @Test void privateFixedFieldRoundResponseResubmitResolution(){var d=complete();final UUID id=d.id();submit(d);command(d.id(),officer,"start-review",Map.of());var c=command(d.id(),officer,"save-issue",Map.of("kind","FIELD","target","legalName","text","Correct the registered legal name."));assertTrue(workflow.get(d.id(),owner).issues().isEmpty());c=command(d.id(),officer,"publish-corrections",Map.of());var issue=c.issues().getFirst();assertThrows(ApiException.class,()->command(id,officer,"save-issue",Map.of("kind","FIELD","target","applicantName","text","Late addition")));assertThrows(ApiException.class,()->drafts.save(id,owner,new DraftService.Patch(workflow.get(id,owner).revision(),Map.of("applicantName","Unauthorized"))));d=drafts.save(d.id(),owner,new DraftService.Patch(c.revision(),Map.of("legalName","Correct Cafe")));assertEquals("Review Cafe",workflow.list(officer).stream().filter(item->item.id().equals(id)).findFirst().orElseThrow().legalName());command(d.id(),owner,"response",Map.of("issueId",issue.id().toString(),"response","Updated the legal name."));c=command(d.id(),owner,"resubmit",Map.of("accuracy",true,"authority",true));assertEquals(2,c.versions().size());assertEquals("Correct Cafe",workflow.list(officer).stream().filter(item->item.id().equals(id)).findFirst().orElseThrow().legalName());assertEquals("Review Cafe",c.versions().getFirst().snapshot().legalName());assertEquals("Correct Cafe",c.versions().getLast().snapshot().legalName());command(d.id(),officer,"start-review",Map.of());assertThrows(ApiException.class,()->command(id,officer,"decision",Map.of("outcome","APPROVED","explanation","Reviewed")));command(d.id(),officer,"resolve",Map.of("issueId",issue.id().toString()));assertEquals("APPROVED",command(d.id(),officer,"decision",Map.of("outcome","APPROVED","explanation","Correction verified.")).status());assertFalse(workflow.notifications(officer).isEmpty());}
 @Test void rejectionIsFinalAndReceiptRecoversWithoutDuplicate(){var d=complete();final UUID id=d.id();submit(d);command(d.id(),officer,"start-review",Map.of());var c=workflow.get(d.id(),officer);var body=Map.<String,Object>of("expectedRevision",c.revision(),"expectedVersion",c.latestVersion(),"outcome","REJECTED","explanation","Required premises use evidence is insufficient.");var a=workflow.command(d.id(),officer,"decision","stable-decision",body);var b=workflow.command(d.id(),officer,"decision","stable-decision",body);assertEquals(a,b);assertEquals("REJECTED",a.status());assertThrows(ApiException.class,()->command(id,officer,"start-review",Map.of()));assertThrows(ApiException.class,()->workflow.get(d.id(),"other"));var notice=workflow.notifications(owner).getFirst();assertThrows(ApiException.class,()->workflow.markRead(notice.id(),officer));workflow.markRead(notice.id(),owner);assertNotNull(workflow.notifications(owner).stream().filter(n->n.id().equals(notice.id())).findFirst().orElseThrow().readAt());}
 @Test void repeatedDocumentAndAdditionalRoundsPreserveFilesAndNeedOfficerConfirmation(){
  var d=complete();UUID id=d.id();submit(d);command(id,officer,"start-review",Map.of());
  var request=d.documentRequests().stream().filter(r->r.type().equals("PREMISES_LAYOUT")).findFirst().orElseThrow();
  var original=request.currentUpload().id();
  command(id,officer,"save-issue",Map.of("kind","DOCUMENT","target",request.id().toString(),"text","Replace the illegible layout."));
  command(id,officer,"save-issue",Map.of("kind","ADDITIONAL","title","Kitchen equipment list","text","Provide the equipment list."));
  var c=command(id,officer,"publish-corrections",Map.of());
  assertThrows(ApiException.class,()->command(id,officer,"publish-corrections",Map.of()));
  var unrelated=d.documentRequests().stream().filter(r->r.type().equals("BUSINESS_REGISTRATION")).findFirst().orElseThrow();
  byte[] png=Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
  assertThrows(ApiException.class,()->evidence.upload(id,unrelated.id(),owner,workflow.get(id,owner).revision(),"unrequested",new MockMultipartFile("file","proof.png","image/png",png)));
  for(var issue:c.issues()){
   evidence.upload(id,UUID.fromString(issue.target()),owner,workflow.get(id,owner).revision(),UUID.randomUUID().toString(),new MockMultipartFile("file","proof.png","image/png",png));
   command(id,owner,"response",Map.of("issueId",issue.id().toString(),"response","Provided requested evidence."));
  }
  var submitted=command(id,owner,"resubmit",Map.of("accuracy",true,"authority",true));
  assertEquals(2,submitted.latestVersion());
  assertEquals(original,submitted.versions().getFirst().snapshot().documentRequests().stream().filter(r->r.id().equals(request.id())).findFirst().orElseThrow().currentUpload().id());
  assertNotEquals(original,submitted.versions().getLast().snapshot().documentRequests().stream().filter(r->r.id().equals(request.id())).findFirst().orElseThrow().currentUpload().id());
  assertEquals(unrelated.currentUpload().id(),submitted.versions().getLast().snapshot().documentRequests().stream().filter(r->r.id().equals(unrelated.id())).findFirst().orElseThrow().currentUpload().id());
  assertNotNull(evidence.download(id,original,officer));
  command(id,officer,"start-review",Map.of());
  var first=c.issues().getFirst();var second=c.issues().getLast();
  command(id,officer,"resolve",Map.of("issueId",second.id().toString(),"explanation","Equipment list confirmed."));
  command(id,officer,"reissue",Map.of("issueId",first.id().toString(),"text","Supply a clearer image."));
  command(id,officer,"publish-corrections",Map.of());
  var newIssue=workflow.get(id,owner).issues().stream().filter(i->i.state().equals("OPEN")).findFirst().orElseThrow();
  command(id,owner,"response",Map.of("issueId",newIssue.id().toString(),"response","Clarification: the existing drawing is the complete layout."));
  command(id,owner,"resubmit",Map.of("accuracy",true,"authority",true));
  command(id,officer,"start-review",Map.of());
  command(id,officer,"resolve",Map.of("issueId",newIssue.id().toString()));
  assertEquals("APPROVED",command(id,officer,"decision",Map.of("outcome","APPROVED","explanation","All evidence confirmed.")).status());
  assertEquals(3,workflow.get(id,owner).versions().size());
 }
 @Test void malformedTargetsRolesStalenessAndPrivateDraftDeletion(){
  var d=complete();UUID id=d.id();submit(d);
  assertThrows(ApiException.class,()->command(id,owner,"start-review",Map.of()));
  command(id,officer,"start-review",Map.of());
  assertThrows(ApiException.class,()->command(id,officer,"save-issue",Map.of("kind","FIELD","target","unknown","text","Invalid")));
  assertThrows(ApiException.class,()->command(id,officer,"save-issue",Map.of("kind","DOCUMENT","target",UUID.randomUUID().toString(),"text","Invalid")));
  assertThrows(ApiException.class,()->command(id,officer,"save-issue",Map.of("kind","ADDITIONAL","text","Missing title")));
  assertThrows(ApiException.class,()->command(id,officer,"publish-corrections",Map.of()));
  var c=command(id,officer,"save-issue",Map.of("kind","FIELD","target","operatingHours.MONDAY","text","Clarify Monday opening hours."));
  assertTrue(workflow.get(id,owner).issues().isEmpty());
  command(id,officer,"delete-issue",Map.of("issueId",c.issues().getFirst().id().toString()));
  assertTrue(workflow.get(id,officer).issues().isEmpty());
  assertThrows(ApiException.class,()->workflow.command(id,officer,"decision","stale",Map.of("expectedRevision",0,"expectedVersion",1,"outcome","APPROVED","explanation","stale")));
  assertThrows(ApiException.class,()->workflow.command(id,officer,"decision","bad",Map.of("expectedRevision",c.revision(),"expectedVersion",1,"unexpected",true)));
 }
 @Test void concurrentPostgresSubmissionsRecoverSingleSnapshotAndNotice()throws Exception{
  try(var connection=db.getDataSource().getConnection()){org.junit.jupiter.api.Assumptions.assumeTrue(connection.getMetaData().getDatabaseProductName().equals("PostgreSQL"));}
  var d=complete();UUID id=d.id();var body=Map.<String,Object>of("expectedRevision",d.revision(),"expectedVersion",0,"accuracy",true,"authority",true);
  var pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
  try{Callable<WorkflowService.CaseDetail> action=()->{start.await();return workflow.command(id,owner,"submit","shared-submit",body);};var a=pool.submit(action);var b=pool.submit(action);start.countDown();assertEquals(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS));assertEquals(1,workflow.get(id,owner).versions().size());assertEquals(1,workflow.notifications(owner).size());assertThrows(ApiException.class,()->workflow.command(id,owner,"submit","shared-submit",Map.of("expectedRevision",d.revision(),"expectedVersion",0,"accuracy",false,"authority",true)));}finally{pool.shutdownNow();}
 }
 @Test void concurrentPostgresFinalDecisionsHaveOnlyOneWinner()throws Exception{
  try(var connection=db.getDataSource().getConnection()){org.junit.jupiter.api.Assumptions.assumeTrue(connection.getMetaData().getDatabaseProductName().equals("PostgreSQL"));}
  var d=complete();UUID id=d.id();submit(d);var c=command(id,officer,"start-review",Map.of());
  var pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
  try{List<Future<Boolean>> actions=new ArrayList<>();for(String outcome:List.of("APPROVED","REJECTED"))actions.add(pool.submit(()->{start.await();try{workflow.command(id,officer,"decision",outcome,Map.of("expectedRevision",c.revision(),"expectedVersion",c.latestVersion(),"outcome",outcome,"explanation","Reviewed evidence"));return true;}catch(ApiException e){assertEquals("stale_revision",e.code);return false;}}));start.countDown();int winners=0;for(var action:actions)if(action.get(15,TimeUnit.SECONDS))winners++;assertEquals(1,winners);assertEquals(1,workflow.get(id,owner).events().stream().filter(e->e.type().equals("decision")).count());}finally{pool.shutdownNow();}
 }
 @Test void deletingReissuedDraftRestoresUnresolvedPredecessor(){
  var d=complete();UUID id=d.id();submit(d);command(id,officer,"start-review",Map.of());
  command(id,officer,"save-issue",Map.of("kind","FIELD","target","legalName","text","Clarify registered name."));
  var published=command(id,officer,"publish-corrections",Map.of());var original=published.issues().getFirst();
  command(id,owner,"response",Map.of("issueId",original.id().toString(),"response","The saved legal name is correct."));
  command(id,owner,"resubmit",Map.of("accuracy",true,"authority",true));command(id,officer,"start-review",Map.of());
  var reissued=command(id,officer,"reissue",Map.of("issueId",original.id().toString(),"text","Please explain again."));
  var successor=reissued.issues().stream().filter(issue->issue.state().equals("DRAFT")).findFirst().orElseThrow();
  command(id,officer,"delete-issue",Map.of("issueId",successor.id().toString()));
  assertEquals("AWAITING_REVIEW",workflow.get(id,officer).issues().getFirst().state());
  assertThrows(ApiException.class,()->command(id,officer,"decision",Map.of("outcome","APPROVED","explanation","Cannot bypass unresolved request")));
  command(id,officer,"resolve",Map.of("issueId",original.id().toString(),"explanation","Original response confirmed."));
  assertEquals("APPROVED",command(id,officer,"decision",Map.of("outcome","APPROVED","explanation","Original issue properly resolved.")).status());
 }
 @Test void failedSimulationRetryRequiresOpenRequestedCorrectionTarget(){
  var d=complete();UUID id=d.id();submit(d);command(id,officer,"start-review",Map.of());
  var target=d.documentRequests().stream().filter(r->r.type().equals("PREMISES_LAYOUT")).findFirst().orElseThrow();
  command(id,officer,"save-issue",Map.of("kind","DOCUMENT","target",target.id().toString(),"text","Clarify layout."));
  command(id,officer,"publish-corrections",Map.of());
  db.update("update simulated_check set state='ERROR',claim_id=null where upload_id=?",target.currentUpload().id());
  assertEquals(2,checks.retry(id,target.currentUpload().id(),owner,"correction-retry").resultingAttempt());
  var locked=d.documentRequests().stream().filter(r->r.type().equals("BUSINESS_REGISTRATION")).findFirst().orElseThrow();
  db.update("update simulated_check set state='ERROR',claim_id=null where upload_id=?",locked.currentUpload().id());
  assertThrows(ApiException.class,()->checks.retry(id,locked.currentUpload().id(),owner,"locked-retry"));
  assertThrows(ApiException.class,()->checks.retry(id,target.currentUpload().id(),officer,"officer-retry"));
 }
 @Test void postgresNotificationFailureRollsBackSnapshotStateEventAndReceipt(){
  try(var connection=db.getDataSource().getConnection()){org.junit.jupiter.api.Assumptions.assumeTrue(connection.getMetaData().getDatabaseProductName().equals("PostgreSQL"));}catch(java.sql.SQLException e){throw new IllegalStateException(e);}
  var d=complete();UUID id=d.id();
  db.execute("create function reject_test_notice() returns trigger language plpgsql as $$ begin if NEW.application_id='"+id+"'::uuid then raise exception 'test notification failure'; end if; return NEW; end $$");
  db.execute("create trigger workflow_test_notification_failure before insert on notification for each row execute function reject_test_notice()");
  try{
   assertThrows(org.springframework.dao.DataAccessException.class,()->submit(d));
   var current=workflow.get(id,owner);assertEquals("DRAFT",current.status());assertEquals(d.revision(),current.revision());assertEquals(0,current.latestVersion());assertTrue(current.versions().isEmpty());assertTrue(current.events().isEmpty());assertTrue(workflow.notifications(owner).isEmpty());
   assertEquals(0,db.queryForObject("select count(*) from workflow_receipt where application_id=?",Integer.class,id));
  }finally{db.execute("drop trigger workflow_test_notification_failure on notification");db.execute("drop function reject_test_notice()");}
  assertEquals(1,submit(d).latestVersion());
 }
} 
