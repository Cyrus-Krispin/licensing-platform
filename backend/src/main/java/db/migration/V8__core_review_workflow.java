package db.migration;

import java.sql.*;
import java.util.*;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/** Extend the retained draft schema without rewriting historical migrations. */
public class V8__core_review_workflow extends BaseJavaMigration {
 public void migrate(Context context) throws Exception {
  Connection c=context.getConnection();
  for(String table:List.of("application_draft","document_request")){
   List<String> drop=new ArrayList<>();
   try(var s=c.prepareStatement("select t.constraint_name,t.constraint_type,coalesce(k.check_clause,'') from information_schema.table_constraints t left join information_schema.check_constraints k on k.constraint_name=t.constraint_name and k.constraint_schema=t.constraint_schema where lower(t.table_name)=?")){
    s.setString(1,table);try(var r=s.executeQuery()){while(r.next()){
     String clause=r.getString(3).toUpperCase(Locale.ROOT);
     if(r.getString(2).equals("CHECK") && !clause.contains("NOT NULL") && ((table.equals("application_draft")&&clause.contains("STATUS"))||(table.equals("document_request")&&clause.contains("REQUEST_TYPE"))))drop.add(r.getString(1));
     if(table.equals("document_request")&&r.getString(2).equals("UNIQUE"))drop.add(r.getString(1));
    }}
   }
   for(String name:drop) execute(c,"alter table "+table+" drop constraint \""+name.replace("\"","\"\"")+"\"");
  }
  execute(c,"alter table application_draft alter column status type varchar(40)");
  execute(c,"alter table application_draft add constraint application_workflow_status check(status in ('DRAFT','APPLICATION_RECEIVED','UNDER_REVIEW','PENDING_PRE_SITE_RESUBMISSION','PRE_SITE_RESUBMITTED','APPROVED','REJECTED'))");
  execute(c,"alter table document_request add column request_instance UUID default '00000000-0000-0000-0000-000000000000' not null");
  execute(c,"alter table document_request add constraint request_instance_unique unique(application_id,request_type,request_instance)");
  execute(c,"alter table document_request add constraint evidence_request_type check(request_type in ('BUSINESS_REGISTRATION','PREMISES_LAYOUT','FOOD_USE_PERMISSION','LEASE_EVIDENCE','OWNERSHIP_EVIDENCE','REPRESENTATIVE_AUTHORIZATION','ADDITIONAL_EVIDENCE'))");
  execute(c,"create table case_state(application_id UUID primary key references application_draft(id) on delete cascade, latest_version integer not null default 0, round integer not null default 0)");
  execute(c,"create table submission(application_id UUID references application_draft(id) on delete cascade, version_number integer not null, snapshot text not null, submitted_by varchar(100) not null, submitted_at timestamp with time zone not null, accuracy boolean not null, authority boolean not null, primary key(application_id,version_number))");
  execute(c,"create table submission_upload(application_id UUID not null, version_number integer not null, upload_id UUID references evidence_upload(id) on delete cascade, primary key(application_id,version_number,upload_id), foreign key(application_id,version_number) references submission(application_id,version_number) on delete cascade)");
  execute(c,"create table feedback_issue(id UUID primary key, application_id UUID references application_draft(id) on delete cascade, kind varchar(12) not null check(kind in ('FIELD','DOCUMENT','ADDITIONAL')), target varchar(100) not null, text varchar(2000) not null, title varchar(200), state varchar(20) not null check(state in ('DRAFT','OPEN','AWAITING_REVIEW','RESOLVED','REISSUED')), round integer not null, reviewed_version integer not null, response varchar(2000), created_by varchar(100) not null, created_at timestamp with time zone not null)");
  execute(c,"create table workflow_event(id UUID primary key, application_id UUID references application_draft(id) on delete cascade, version_number integer not null, event_type varchar(40) not null, actor varchar(100) not null, created_at timestamp with time zone not null, detail text not null, operator_visible boolean not null)");
  execute(c,"create table workflow_receipt(application_id UUID references application_draft(id) on delete cascade, actor varchar(100) not null, operation varchar(40) not null, idempotency_key varchar(100) not null, payload_hash char(64) not null, result text not null, primary key(application_id,actor,operation,idempotency_key))");
  execute(c,"create table notification(id UUID primary key, recipient varchar(100) references app_user(username) on delete cascade, application_id UUID references application_draft(id) on delete cascade, event_id UUID not null, message varchar(500) not null, created_at timestamp with time zone not null, read_at timestamp with time zone, unique(recipient,event_id))");
  execute(c,"create index feedback_case_idx on feedback_issue(application_id,state)");
  execute(c,"create index notification_recipient_idx on notification(recipient,created_at)");
 }
 private void execute(Connection c,String sql)throws SQLException{try(var s=c.createStatement()){s.execute(sql);}}
}
