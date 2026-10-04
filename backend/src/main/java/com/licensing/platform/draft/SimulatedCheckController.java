package com.licensing.platform.draft;

import java.security.Principal;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/applications/{applicationId}/evidence/processing")
public class SimulatedCheckController {
  private final SimulatedCheckService checks;

  SimulatedCheckController(SimulatedCheckService checks) {
    this.checks = checks;
  }

  @GetMapping
  public List<SimulatedCheckService.Status> list(
      @PathVariable UUID applicationId, Principal actor) {
    return checks.statuses(applicationId, actor.getName());
  }

  @PostMapping("/{uploadId}/retry")
  public SimulatedCheckService.RetryResult retry(@PathVariable UUID applicationId,
      @PathVariable UUID uploadId, @RequestHeader("Idempotency-Key") String key, Principal actor) {
    return checks.retry(applicationId, uploadId, actor.getName(), key);
  }
}
