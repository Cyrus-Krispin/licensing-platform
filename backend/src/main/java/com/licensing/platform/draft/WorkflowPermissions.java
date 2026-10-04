package com.licensing.platform.draft;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/** Shared server-side edit guards; a published round never grants a whole section. */
final class WorkflowPermissions {
 static void fields(JdbcTemplate db,ObjectMapper mapper,DraftService.Draft current,Map<String,Object> changes){
  if(current.status().equals("DRAFT"))return;
  if(!current.status().equals("PENDING_PRE_SITE_RESUBMISSION"))locked();
  Set<String> allowed=new HashSet<>(db.query("select target from feedback_issue where application_id=? and state='OPEN' and kind='FIELD'",(r,n)->r.getString(1),current.id()));
  Map<String,Object> prior=mapper.convertValue(current,new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>(){});
  for(var entry:changes.entrySet()){
   if(entry.getKey().equals("operatingHours")){
    Map<String,Object> oldHours=(Map<String,Object>)prior.get("operatingHours");
    Map<String,Object> newHours=(Map<String,Object>)entry.getValue();
    Set<String> days=new HashSet<>(oldHours.keySet());days.addAll(newHours.keySet());
    for(String day:days)if(!mapper.valueToTree(oldHours.get(day)).equals(mapper.valueToTree(newHours.get(day)))&&!allowed.contains("operatingHours."+day))locked();
   }else if(!mapper.valueToTree(prior.get(entry.getKey())).equals(mapper.valueToTree(entry.getValue()))&&!allowed.contains(entry.getKey()))locked();
  }
 }
 static void upload(JdbcTemplate db,UUID app,UUID request){
  String state=db.queryForObject("select status from application_draft where id=?",String.class,app);
  if("DRAFT".equals(state))return;
  if(!"PENDING_PRE_SITE_RESUBMISSION".equals(state)||db.query("select 1 from feedback_issue where application_id=? and state='OPEN' and kind in ('DOCUMENT','ADDITIONAL') and target=?",(r,n)->1,app,request.toString()).isEmpty())locked();
 }
 static void locked(){throw new ApiException(HttpStatus.CONFLICT,"edit_locked","Only explicitly requested fields and documents can be changed during this fixed correction round.");}
}
