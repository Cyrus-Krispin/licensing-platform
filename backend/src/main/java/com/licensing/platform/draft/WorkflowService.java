package com.licensing.platform.draft;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Every workflow mutation serializes on the application row and commits its receipt and notices together. */
@Service
public class WorkflowService {
    private static final Set<String> FIELDS = Set.of("legalName", "tradingName", "registrationNumber", "structure", "applicantName", "applicantRole", "applicantEmail", "applicantPhone", "premisesAddress", "premisesName", "unitApplicable", "unitNumber", "tenure", "businessType", "preparationActivities", "serviceModes", "proposedOpeningDate");
    private final JdbcTemplate db;
    private final ObjectMapper mapper;
    private final DraftService drafts;

    WorkflowService(JdbcTemplate db, ObjectMapper mapper, DraftService drafts) {
        this.db = db; this.mapper = mapper; this.drafts = drafts;
    }

    public List<CaseSummary> list(String actor) {
        boolean officer = officer(actor);
        return db.query("select d.id,d.revision,d.status,coalesce(c.latest_version,0),d.legal_name,d.updated_at,s.snapshot from application_draft d left join case_state c on c.application_id=d.id left join submission s on s.application_id=d.id and s.version_number=c.latest_version where " + (officer ? "d.status<>'DRAFT'" : "d.owner_username=?") + " order by d.updated_at desc,d.id",
            (r,n) -> new CaseSummary(r.getObject(1, UUID.class),r.getLong(2),r.getString(3),r.getInt(4),officer ? read(r.getString(7),DraftService.Draft.class).legalName() : r.getString(5),r.getTimestamp(6).toInstant()), officer ? new Object[]{} : new Object[]{actor});
    }

    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public CaseDetail get(UUID app, String actor) {
        Access access = access(app, actor, false);
        boolean officer = officer(actor);
        int[] state = state(app);
        List<Version> versions = db.query("select version_number,snapshot,submitted_by,submitted_at,accuracy,authority from submission where application_id=? order by version_number",
            (r,n) -> new Version(r.getInt(1),read(r.getString(2),DraftService.Draft.class),r.getString(3),r.getTimestamp(4).toInstant(),r.getBoolean(5),r.getBoolean(6)),app);
        List<Issue> issues = db.query("select * from feedback_issue where application_id=?" + (officer ? "" : " and state<>'DRAFT'") + " order by round,created_at,id",
            (r,n) -> new Issue(r.getObject("id", UUID.class),r.getString("kind"),r.getString("target"),r.getString("text"),r.getString("title"),r.getString("state"),r.getInt("round"),r.getInt("reviewed_version"),r.getString("response"),r.getString("created_by"),r.getTimestamp("created_at").toInstant()),app);
        List<Event> events = db.query("select * from workflow_event where application_id=?" + (officer ? "" : " and operator_visible=true") + " order by created_at,id",
            (r,n) -> new Event(r.getObject("id",UUID.class),r.getInt("version_number"),r.getString("event_type"),r.getString("actor"),r.getTimestamp("created_at").toInstant(),read(r.getString("detail"),new TypeReference<Map<String,Object>>(){})),app);
        return new CaseDetail(app,access.revision(),access.status(),state[0],state[1],officer ? null : drafts.get(app,access.owner()),versions,issues,events);
    }

    @Transactional
    public CaseDetail command(UUID app, String actor, String operation, String key, Map<String,Object> body) {
        if (key == null || key.isBlank() || key.length()>100) bad("Idempotency-Key must contain 1–100 characters");
        Access access = access(app,actor,true);
        boolean officer = officer(actor);
        String hash = hash(body);
        var receipt = db.query("select payload_hash,result from workflow_receipt where application_id=? and actor=? and operation=? and idempotency_key=?", (r,n)->new Receipt(r.getString(1),r.getString(2)),app,actor,operation,key).stream().findFirst();
        if (receipt.isPresent()) {
            if (!receipt.get().hash().equals(hash)) conflict("idempotency_conflict","That retry key was already used with a different request");
            return read(receipt.get().result(),CaseDetail.class);
        }
        int[] state = state(app);
        if (integer(body,"expectedRevision") != access.revision() || integer(body,"expectedVersion") != state[0]) conflict("stale_revision","This application changed elsewhere. Reload before repeating the action.");
        validateBody(operation,body);
        Map<String,Object> detail = new LinkedHashMap<>();
        String next = access.status();
        boolean visible = true;
        String notice = null;
        switch(operation) {
            case "submit", "resubmit" -> {
                requireRole(!officer);
                requireState(access.status(),operation.equals("submit") ? "DRAFT" : "PENDING_PRE_SITE_RESUBMISSION");
                if (!Boolean.TRUE.equals(body.get("accuracy")) || !Boolean.TRUE.equals(body.get("authority"))) throw new ValidationException(Map.of("declaration.accuracy","Confirm accuracy for this submission", "declaration.authority","Confirm authority for this submission"));
                DraftService.Draft draft = drafts.get(app,actor);
                requireComplete(draft);
                if (operation.equals("resubmit")) {
                    if (count("select count(*) from feedback_issue where application_id=? and state='OPEN' and (response is null or trim(response)='')",app)>0) throw new ValidationException(Map.of("responses","Respond to every correction request before resubmitting"));
                    db.update("update feedback_issue set state='AWAITING_REVIEW' where application_id=? and state='OPEN'",app);
                }
                int version = state[0]+1;
                db.update("insert into submission(application_id,version_number,snapshot,submitted_by,submitted_at,accuracy,authority) values(?,?,?,?,?,true,true)",app,version,json(draft),actor,now());
                for (var request : draft.documentRequests()) if (request.applicability().equals("APPLICABLE") && request.currentUpload()!=null) db.update("insert into submission_upload values(?,?,?)",app,version,request.currentUpload().id());
                if (state[0]==0) db.update("insert into case_state(application_id,latest_version,round) values(?,?,0)",app,version);
                else db.update("update case_state set latest_version=? where application_id=?",version,app);
                state[0]=version;
                next = operation.equals("submit") ? "APPLICATION_RECEIVED" : "PRE_SITE_RESUBMITTED";
                notice = operation.equals("submit") ? "Application submitted" : "Corrections resubmitted";
                detail.put("version",version);
            }
            case "start-review" -> {
                requireRole(officer);
                requireState(access.status(),"APPLICATION_RECEIVED","PRE_SITE_RESUBMITTED");
                next="UNDER_REVIEW"; notice="Officer started reviewing your application";
            }
            case "save-issue" -> {
                requireRole(officer); requireState(access.status(),"UNDER_REVIEW");
                String kind = text(body,"kind",12), target;
                String title = null;
                if (kind.equals("FIELD")) {
                    target=text(body,"target",100);
                    if (!FIELDS.contains(target)) bad("Unknown field target");
                } else if (kind.equals("DOCUMENT")) {
                    target=uuid(body,"target").toString();
                    if (count("select count(*) from document_request where application_id=? and id=?",app,UUID.fromString(target))!=1) bad("Document request does not belong to this application");
                } else if (kind.equals("ADDITIONAL")) {
                    title=text(body,"title",200); target=UUID.randomUUID().toString();
                } else { bad("kind must be FIELD, DOCUMENT, or ADDITIONAL"); return null; }
                if (count("select count(*) from feedback_issue where application_id=? and target=? and state in ('DRAFT','AWAITING_REVIEW')",app,target)>0) conflict("issue_exists","Resolve or reissue the existing request for this target first");
                UUID issue = UUID.randomUUID();
                db.update("insert into feedback_issue(id,application_id,kind,target,text,title,state,round,reviewed_version,created_by,created_at) values(?,?,?,?,?,?,'DRAFT',?,?,?,?)",issue,app,kind,target,text(body,"text",2000),title,state[1]+1,state[0],actor,now());
                detail.put("issueId",issue.toString()); visible=false;
            }
            case "delete-issue" -> {
                requireRole(officer); requireState(access.status(),"UNDER_REVIEW");
                UUID issue=uuid(body,"issueId");
                var predecessors = db.query("select predecessor_id from feedback_issue where id=? and application_id=? and state='DRAFT'",(r,n)->r.getObject(1,UUID.class),issue,app);
                if(db.update("delete from feedback_issue where id=? and application_id=? and state='DRAFT'",issue,app)!=1) conflict("issue_locked","Only unpublished feedback can be deleted");
                for(UUID predecessor:predecessors) if(predecessor!=null) db.update("update feedback_issue set state='AWAITING_REVIEW' where id=? and application_id=? and state='REISSUED'",predecessor,app);
                detail.put("issueId",issue.toString()); visible=false;
            }
            case "publish-corrections" -> {
                requireRole(officer); requireState(access.status(),"UNDER_REVIEW");
                if (count("select count(*) from feedback_issue where application_id=? and state='AWAITING_REVIEW'",app)>0) conflict("unreviewed_issues","Resolve or reissue each previous correction before publishing another round");
                if (count("select count(*) from feedback_issue where application_id=? and state='DRAFT'",app)==0) bad("Add at least one correction request");
                var additional = db.query("select target,title,text from feedback_issue where application_id=? and state='DRAFT' and kind='ADDITIONAL'",(r,n)->new String[]{r.getString(1),r.getString(2),r.getString(3)},app);
                for (var request : additional) db.update("insert into document_request(id,application_id,request_type,applicability,reason,request_instance) values(?,?,'ADDITIONAL_EVIDENCE','APPLICABLE',?,?)",UUID.fromString(request[0]),app,request[1],UUID.fromString(request[0]));
                db.update("update feedback_issue set state='OPEN' where application_id=? and state='DRAFT'",app);
                db.update("update case_state set round=round+1 where application_id=?",app);
                next="PENDING_PRE_SITE_RESUBMISSION"; notice="Officer requested corrections to your application";
                detail.put("round",state[1]+1);
            }
            case "response" -> {
                requireRole(!officer); requireState(access.status(),"PENDING_PRE_SITE_RESUBMISSION");
                UUID issue=uuid(body,"issueId"); String response=text(body,"response",2000);
                if(db.update("update feedback_issue set response=? where id=? and application_id=? and state='OPEN'",response,issue,app)!=1) conflict("issue_locked","This correction is not open for a response");
                detail.put("issueId",issue.toString()); detail.put("response",response);
            }
            case "resolve", "reissue" -> {
                requireRole(officer); requireState(access.status(),"UNDER_REVIEW");
                UUID issue=uuid(body,"issueId");
                var previous=db.query("select kind,target,title from feedback_issue where id=? and application_id=? and state='AWAITING_REVIEW'",(r,n)->new String[]{r.getString(1),r.getString(2),r.getString(3)},issue,app).stream().findFirst().orElseThrow(()->error(HttpStatus.CONFLICT,"issue_locked","Only a resubmitted correction can be reviewed"));
                db.update("update feedback_issue set state=? where id=?",operation.equals("resolve")?"RESOLVED":"REISSUED",issue);
                if(operation.equals("reissue")) db.update("insert into feedback_issue(id,application_id,kind,target,text,title,state,round,reviewed_version,created_by,created_at) values(?,?,?,?,?,?,'DRAFT',?,?,?,?)",UUID.randomUUID(),app,previous[0].equals("ADDITIONAL")?"DOCUMENT":previous[0],previous[1],text(body,"text",2000),previous[2],state[1]+1,state[0],actor,now());
                if(operation.equals("reissue")) db.update("update feedback_issue set predecessor_id=? where application_id=? and target=? and state='DRAFT'",issue,app,previous[1]);
                detail.put("issueId",issue.toString());
                if(body.containsKey("explanation")) detail.put("explanation",text(body,"explanation",2000));
                visible=operation.equals("resolve");
            }
            case "decision" -> {
                requireRole(officer); requireState(access.status(),"UNDER_REVIEW");
                String outcome=text(body,"outcome",20), explanation=text(body,"explanation",2000);
                if(!Set.of("APPROVED","REJECTED").contains(outcome)) bad("outcome must be APPROVED or REJECTED");
                if(outcome.equals("APPROVED")) {
                    if(count("select count(*) from feedback_issue where application_id=? and state in ('DRAFT','OPEN','AWAITING_REVIEW')",app)>0) conflict("unresolved_issues","All correction requests must be confirmed resolved before approval");
                    requireComplete(drafts.get(app,access.owner()));
                }
                next=outcome; detail.put("explanation",explanation); detail.put("outcome",outcome);
                notice="Application " + outcome.toLowerCase(Locale.ROOT) + ": " + explanation.substring(0,Math.min(explanation.length(),350));
            }
            default -> bad("Unknown workflow operation");
        }
        db.update("update application_draft set status=?,revision=revision+1,updated_at=? where id=?",next,now(),app);
        UUID event=UUID.randomUUID();
        db.update("insert into workflow_event values(?,?,?,?,?,?,?,?)",event,app,state[0],operation,actor,now(),json(detail),visible);
        if(notice!=null) {
            notify(access.owner(),app,event,notice);
            if(operation.equals("submit") || operation.equals("resubmit")) for(String recipient: db.query("select username from app_user where role='OFFICER'",(r,n)->r.getString(1))) notify(recipient,app,event,notice);
        }
        CaseDetail result=get(app,actor);
        db.update("insert into workflow_receipt values(?,?,?,?,?,?)",app,actor,operation,key,hash,json(result));
        return result;
    }

    private void validateBody(String operation,Map<String,Object> body) {
        Set<String> allowed=new HashSet<>(Set.of("expectedRevision","expectedVersion"));
        allowed.addAll(switch(operation) {
            case "submit","resubmit" -> Set.of("accuracy","authority");
            case "save-issue" -> Set.of("kind","target","text","title");
            case "response" -> Set.of("issueId","response");
            case "resolve" -> Set.of("issueId","explanation");
            case "reissue" -> Set.of("issueId","text","explanation");
            case "delete-issue" -> Set.of("issueId");
            case "decision" -> Set.of("outcome","explanation");
            default -> Set.of();
        });
        if(!allowed.containsAll(body.keySet())) bad("Unknown workflow request properties");
    }
    private Access access(UUID app,String actor,boolean lock) {
        Access a=db.query("select owner_username,status,revision from application_draft where id=?"+(lock?" for update":""),(r,n)->new Access(r.getString(1),r.getString(2),r.getLong(3)),app).stream().findFirst().orElseThrow(()->error(HttpStatus.NOT_FOUND,"not_found","Application not found"));
        if(!a.owner().equals(actor) && !(officer(actor) && !a.status().equals("DRAFT"))) throw error(HttpStatus.NOT_FOUND,"not_found","Application not found");
        return a;
    }
    private boolean officer(String actor) { return db.query("select role from app_user where username=?",(r,n)->r.getString(1),actor).stream().anyMatch("OFFICER"::equals); }
    private int[] state(UUID app) { return db.query("select latest_version,round from case_state where application_id=?",(r,n)->new int[]{r.getInt(1),r.getInt(2)},app).stream().findFirst().orElse(new int[]{0,0}); }
    private int count(String sql,Object...args) { return Objects.requireNonNull(db.queryForObject(sql,Integer.class,args)); }
    private void requireComplete(DraftService.Draft d) {
        Map<String,String> errors=new TreeMap<>();
        for(String item:d.completion().unmetItemIds()) if(!item.startsWith("declaration.")) errors.put(item,"Complete this required item before submission");
        if(!errors.isEmpty()) throw new ValidationException(errors);
    }
    private void requireRole(boolean permitted) { if(!permitted) throw error(HttpStatus.FORBIDDEN,"forbidden","This action is not available for your role"); }
    private void requireState(String current,String...allowed) { if(!Arrays.asList(allowed).contains(current)) conflict("invalid_state","This action is not available in the current application state"); }
    private long integer(Map<String,Object> body,String name) { Object v=body.get(name); if(!(v instanceof Number n)||n.longValue()<0||n.doubleValue()!=n.longValue()) {bad(name+" must be a non-negative integer");return 0;} return n.longValue(); }
    private String text(Map<String,Object> body,String name,int max) { Object value=body.get(name); if(!(value instanceof String s)||s.isBlank()||s.trim().length()>max) {bad(name+" must contain 1–"+max+" characters");return null;} return ((String)value).trim(); }
    private UUID uuid(Map<String,Object> body,String name) { try{return UUID.fromString(text(body,name,100));}catch(IllegalArgumentException e){bad(name+" must be a UUID");return null;} }
    private Timestamp now() { return Timestamp.from(Instant.now()); }
    private void notify(String recipient,UUID app,UUID event,String message) { db.update("insert into notification(id,recipient,application_id,event_id,message,created_at) values(?,?,?,?,?,?)",UUID.randomUUID(),recipient,app,event,message,now()); }
    @Transactional public void clearNotifications(String actor) { db.update("delete from notification where recipient=?",actor); }
    public List<Notification> notifications(String actor) { return db.query("select id,application_id,message,created_at,read_at from notification where recipient=? order by created_at desc,id",(r,n)->new Notification(r.getObject(1,UUID.class),r.getObject(2,UUID.class),r.getString(3),r.getTimestamp(4).toInstant(),r.getTimestamp(5)==null?null:r.getTimestamp(5).toInstant()),actor); }
    @Transactional public void markRead(UUID id,String actor) { if(db.update("update notification set read_at=coalesce(read_at,?) where id=? and recipient=?",now(),id,actor)!=1) throw error(HttpStatus.NOT_FOUND,"not_found","Notification not found"); }
    private String json(Object value) { try{return mapper.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException("Unable to serialize workflow record",e);} }
    private <T>T read(String json,Class<T> type) {try{return mapper.readValue(json,type);}catch(Exception e){throw new IllegalStateException("Invalid workflow record",e);} }
    private <T>T read(String json,TypeReference<T> type) {try{return mapper.readValue(json,type);}catch(Exception e){throw new IllegalStateException("Invalid workflow record",e);} }
    private String hash(Map<String,Object> body) {try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json(new TreeMap<>(body)).getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);} }
    private void bad(String message) {throw error(HttpStatus.BAD_REQUEST,"invalid_request",message);}
    private void conflict(String code,String message) {throw error(HttpStatus.CONFLICT,code,message);}
    private ApiException error(HttpStatus status,String code,String message) {return new ApiException(status,code,message);}
    private record Access(String owner,String status,long revision) {}
    private record Receipt(String hash,String result) {}
    public record CaseSummary(UUID id,long revision,String status,int latestVersion,String legalName,Instant updatedAt) {}
    public record CaseDetail(UUID id,long revision,String status,int latestVersion,int round,DraftService.Draft working,List<Version> versions,List<Issue> issues,List<Event> events) {}
    public record Version(int number,DraftService.Draft snapshot,String submittedBy,Instant submittedAt,boolean accuracy,boolean authority) {}
    public record Issue(UUID id,String kind,String target,String text,String title,String state,int round,int reviewedVersion,String response,String createdBy,Instant createdAt) {}
    public record Event(UUID id,int versionNumber,String type,String actor,Instant createdAt,Map<String,Object> detail) {}
    public record Notification(UUID id,UUID applicationId,String message,Instant createdAt,Instant readAt) {}
}
