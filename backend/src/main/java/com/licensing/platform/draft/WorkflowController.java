package com.licensing.platform.draft;

import java.security.Principal;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
public class WorkflowController {
    private final WorkflowService workflow;
    private final EvidenceController evidence;
    private final SimulatedCheckService checks;
    WorkflowController(WorkflowService workflow, EvidenceController evidence, SimulatedCheckService checks) {
        this.workflow=workflow; this.evidence=evidence; this.checks=checks;
    }
    @GetMapping("/api/cases") public List<WorkflowService.CaseSummary> list(Principal actor) {return workflow.list(actor.getName());}
    @GetMapping("/api/cases/{id}") public WorkflowService.CaseDetail get(@PathVariable UUID id,Principal actor) {return workflow.get(id,actor.getName());}
    @PostMapping("/api/cases/{id}/{operation}") public WorkflowService.CaseDetail command(@PathVariable UUID id,@PathVariable String operation,@RequestHeader("Idempotency-Key") String key,@RequestBody Map<String,Object> body,Principal actor) {return workflow.command(id,actor.getName(),operation,key,body);}
    @GetMapping("/api/cases/{id}/evidence/uploads/{uploadId}") public ResponseEntity<?> download(@PathVariable UUID id,@PathVariable UUID uploadId,Principal actor) {return evidence.download(id,uploadId,actor);}
    @GetMapping("/api/cases/{id}/checks") public List<SimulatedCheckService.Status> checks(@PathVariable UUID id,Principal actor) {return checks.statuses(id,actor.getName());}
    @GetMapping("/api/notifications") public List<WorkflowService.Notification> notifications(Principal actor) {return workflow.notifications(actor.getName());}
    @PostMapping("/api/notifications/{id}/read") @ResponseStatus(HttpStatus.NO_CONTENT) public void read(@PathVariable UUID id,Principal actor) {workflow.markRead(id,actor.getName());}
}
