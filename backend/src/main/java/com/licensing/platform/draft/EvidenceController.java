package com.licensing.platform.draft;

import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.util.UUID;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/applications/{applicationId}/evidence")
public class EvidenceController {
  private final EvidenceService evidence;
  private final DraftService drafts;

  EvidenceController(EvidenceService evidence, DraftService drafts) {
    this.evidence = evidence;
    this.drafts = drafts;
  }

  @PostMapping(path = "/requests/{requestId}",
               consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public UploadResponse
  upload(@PathVariable UUID applicationId, @PathVariable UUID requestId,
         @RequestHeader("Idempotency-Key") String key,
         @RequestParam long expectedRevision,
         @RequestPart("file") MultipartFile file, Principal actor) {
    EvidenceService.UploadResult result = evidence.upload(
        applicationId, requestId, actor.getName(), expectedRevision, key, file);
    // This read may be at the receipt revision or newer. Returning both
    // prevents a historical receipt from being mistaken for current application
    // state.
    DraftService.Draft current = drafts.get(applicationId, actor.getName());
    return new UploadResponse(result.upload(), result.revision(), current);
  }

  @GetMapping("/uploads/{uploadId}")
  public ResponseEntity<?> download(@PathVariable UUID applicationId,
                                    @PathVariable UUID uploadId,
                                    Principal actor) {
    var download = evidence.download(applicationId, uploadId, actor.getName());
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(download.upload().contentType()))
        .contentLength(download.upload().byteSize())
        .header(HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.inline()
                    .filename(download.upload().filename().replace("\"", ""),
                              StandardCharsets.UTF_8)
                    .build()
                    .toString())
        .header("X-Content-Type-Options", "nosniff")
        .body(download.resource());
  }

  public record UploadResponse(EvidenceService.Upload upload, long revision,
                               DraftService.Draft currentDraft) {}
}
