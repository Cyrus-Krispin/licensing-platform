package com.licensing.platform.draft;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
@RestController
@RequestMapping("/api/applications/{applicationId}/evidence")
public class EvidenceController {
  private final EvidenceService evidence;
  EvidenceController(EvidenceService e) { evidence = e; }
  @PostMapping(path = "/requests/{requestId}",
               consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public EvidenceService.UploadResult
  upload(@PathVariable UUID applicationId, @PathVariable UUID requestId,
         @RequestHeader("Idempotency-Key") String key,
         @RequestParam long expectedRevision,
         @RequestPart("file") MultipartFile file, Principal actor) {
    return evidence.upload(applicationId, requestId, actor.getName(),
                           expectedRevision, key, file);
  }
  @GetMapping("/uploads/{uploadId}")
  public ResponseEntity<?> download(@PathVariable UUID applicationId,
                                    @PathVariable UUID uploadId,
                                    Principal actor) {
    var d = evidence.download(applicationId, uploadId, actor.getName());
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(d.upload().contentType()))
        .contentLength(d.upload().byteSize())
        .header(HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.inline()
                    .filename(d.upload().filename().replace("\"", ""),
                              StandardCharsets.UTF_8)
                    .build()
                    .toString())
        .header("X-Content-Type-Options", "nosniff")
        .body(d.resource());
  }
}
