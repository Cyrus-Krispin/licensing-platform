package com.licensing.platform.draft;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DraftService {
    private static final Set<String> FIELDS = Set.of("legalName", "tradingName", "registrationNumber", "structure", "applicantName", "applicantRole", "applicantEmail", "applicantPhone");
    private static final Map<String,String> COLUMNS = Map.of("legalName","legal_name","tradingName","trading_name","registrationNumber","registration_number","structure","business_structure","applicantName","applicant_name","applicantRole","applicant_role","applicantEmail","applicant_email","applicantPhone","applicant_phone");
    private static final Pattern REGISTRATION = Pattern.compile("[A-Za-z0-9/-]{3,40}");
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final Pattern PHONE = Pattern.compile("^\\+?[0-9 ()-]*$");
    private final JdbcTemplate db; private final ObjectMapper json;
    DraftService(JdbcTemplate db, ObjectMapper json) { this.db=db; this.json=json; }

    public List<Draft> list(String owner) { return db.query(BASE + " where owner_username=? order by updated_at desc, id", mapper(), owner); }
    public Draft get(UUID id, String owner) { return db.query(BASE + " where id=? and owner_username=?", mapper(), id, owner).stream().findFirst().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"not_found","Draft not found")); }

    @Transactional
    public synchronized Draft create(String owner, String key, Map<String,Object> payload) {
        if (key.isBlank() || key.length()>100) throw new ApiException(HttpStatus.BAD_REQUEST,"invalid_request","Idempotency-Key must contain 1–100 characters");
        String hash=hash(payload);
        var existing=db.query("select payload_hash,application_id from draft_create_retry where owner_username=? and idempotency_key=?",(r,n)->Map.of("hash",r.getString(1),"id",(UUID)r.getObject(2)),owner,key);
        if (!existing.isEmpty()) {
            if (!hash.equals(existing.getFirst().get("hash"))) throw new ApiException(HttpStatus.CONFLICT,"idempotency_conflict","That retry key was already used with a different request");
            return get((UUID)existing.getFirst().get("id"),owner);
        }
        UUID id=UUID.randomUUID(); Instant now=Instant.now();
        db.update("insert into application_draft(id,owner_username,status,revision,created_at,updated_at) values (?,?,'DRAFT',0,?,?)",id,owner,now,now);
        db.update("insert into draft_create_retry(owner_username,idempotency_key,payload_hash,application_id) values (?,?,?,?)",owner,key,hash,id);
        return payload.isEmpty() ? get(id,owner) : save(id,owner,new Patch(0L,payload));
    }

    @Transactional
    public Draft save(UUID id,String owner,Patch patch) {
        if (patch.expectedRevision()==null) throw new ApiException(HttpStatus.BAD_REQUEST,"invalid_request","expectedRevision is required");
        Map<String,Object> values=patch.fields()==null?Map.of():patch.fields();
        Map<String,String> errors=validate(values);
        if (!errors.isEmpty()) throw new ValidationException(errors);
        if (values.isEmpty()) return get(id,owner);
        List<String> assignments=new ArrayList<>(); List<Object> args=new ArrayList<>();
        values.forEach((field,value)-> { assignments.add(COLUMNS.get(field)+"=?"); args.add(normalize(field,value)); });
        assignments.add("revision=revision+1"); assignments.add("updated_at=?"); args.add(Instant.now());
        args.add(id); args.add(owner); args.add(patch.expectedRevision());
        int changed=db.update("update application_draft set "+String.join(",",assignments)+" where id=? and owner_username=? and status='DRAFT' and revision=?",args.toArray());
        if (changed==0) {
            if (db.queryForObject("select count(*) from application_draft where id=? and owner_username=?",Integer.class,id,owner)==0) throw new ApiException(HttpStatus.NOT_FOUND,"not_found","Draft not found");
            throw new ApiException(HttpStatus.CONFLICT,"stale_revision","This draft changed elsewhere. Reload the saved draft; your unsaved values have been retained.");
        }
        return get(id,owner);
    }

    private Map<String,String> validate(Map<String,Object> v) {
        Map<String,String> e=new LinkedHashMap<>();
        v.forEach((k,value)-> { if (!FIELDS.contains(k)) e.put(k,"Unknown field"); else if (value!=null && !(value instanceof String)) e.put(k,"Must be text or null"); });
        checkLength(v,e,"legalName",1,200); checkLength(v,e,"tradingName",0,200); checkLength(v,e,"applicantName",1,120); checkLength(v,e,"applicantEmail",1,254); checkLength(v,e,"applicantPhone",1,32);
        string(v,"registrationNumber").filter(s->!REGISTRATION.matcher(s).matches()).ifPresent(x->e.put("registrationNumber","Use 3–40 letters, digits, hyphens, or slashes"));
        enumValue(v,e,"structure",Set.of("SOLE_PROPRIETOR","PARTNERSHIP","COMPANY","OTHER")); enumValue(v,e,"applicantRole",Set.of("OWNER","DIRECTOR","EMPLOYEE","REPRESENTATIVE"));
        string(v,"applicantEmail").filter(s->!EMAIL.matcher(s).matches()).ifPresent(x->e.put("applicantEmail","Enter a valid email address"));
        string(v,"applicantPhone").filter(s->!PHONE.matcher(s).matches() || s.replaceAll("\\D","").length()<7 || s.replaceAll("\\D","").length()>15).ifPresent(x->e.put("applicantPhone","Use 7–15 digits with +, spaces, parentheses, or hyphens"));
        return e;
    }
    private void checkLength(Map<String,Object> v,Map<String,String> e,String k,int min,int max) { string(v,k).filter(s->s.length()<min||s.length()>max).ifPresent(x->e.put(k,"Must be "+min+"–"+max+" characters")); }
    private void enumValue(Map<String,Object> v,Map<String,String> e,String k,Set<String> allowed) { string(v,k).filter(s->!allowed.contains(s)).ifPresent(x->e.put(k,"Choose a valid value")); }
    private Optional<String> string(Map<String,Object> v,String k) { return !v.containsKey(k)||v.get(k)==null||!(v.get(k) instanceof String) ? Optional.empty() : Optional.of(((String)v.get(k)).trim()); }
    private Object normalize(String field,Object value) { if(value==null)return null; String s=((String)value).trim(); return field.equals("tradingName")&&s.isBlank()?null:s; }
    private String hash(Map<String,Object> payload) { try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsString(payload).getBytes(StandardCharsets.UTF_8))); } catch (Exception e) { throw new IllegalStateException(e); } }
    private org.springframework.jdbc.core.RowMapper<Draft> mapper(){ return (r,n)->new Draft((UUID)r.getObject("id"),r.getLong("revision"),r.getString("status"),r.getString("legal_name"),r.getString("trading_name"),r.getString("registration_number"),r.getString("business_structure"),r.getString("applicant_name"),r.getString("applicant_role"),r.getString("applicant_email"),r.getString("applicant_phone"),r.getTimestamp("updated_at").toInstant()); }
    private static final String BASE="select id,revision,status,legal_name,trading_name,registration_number,business_structure,applicant_name,applicant_role,applicant_email,applicant_phone,updated_at from application_draft";
    public record Patch(Long expectedRevision,Map<String,Object> fields){}
    public record Draft(UUID id,long revision,String status,String legalName,String tradingName,String registrationNumber,String structure,String applicantName,String applicantRole,String applicantEmail,String applicantPhone,Instant updatedAt){}
}
