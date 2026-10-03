package com.licensing.platform.draft;

import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/applications")
public class DraftController {
    private final DraftService drafts;
    DraftController(DraftService drafts) { this.drafts = drafts; }

    @GetMapping public List<DraftService.Draft> list(Principal actor) { return drafts.list(actor.getName()); }
    @GetMapping("/{id}") public DraftService.Draft get(@PathVariable UUID id, Principal actor) { return drafts.get(id, actor.getName()); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DraftService.Draft create(@RequestHeader("Idempotency-Key") String key,
            @RequestBody(required = false) Map<String,Object> body, Principal actor) {
        return drafts.create(actor.getName(), key, body == null ? Map.of() : body);
    }

    @PatchMapping("/{id}/draft")
    public DraftService.Draft save(@PathVariable UUID id, @RequestBody DraftService.Patch patch, Principal actor) {
        return drafts.save(id, actor.getName(), patch);
    }
}
