package com.licensing.platform.draft;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.security.Principal;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class EvidenceAuthorizationInterceptor implements HandlerInterceptor {
  private final EvidenceService evidence;

  public EvidenceAuthorizationInterceptor(EvidenceService evidence) {
    this.evidence = evidence;
  }

  @Override
  public boolean preHandle(HttpServletRequest request,
                           HttpServletResponse response, Object handler) {
    if (!"POST".equals(request.getMethod())) {
      return true;
    }
    String[] segments = request.getRequestURI().split("/");
    if (segments.length == 7 && "api".equals(segments[1]) &&
        "applications".equals(segments[2]) &&
        "evidence".equals(segments[4]) && "requests".equals(segments[5])) {
      Principal principal = request.getUserPrincipal();
      evidence.authorizeBeforeMultipart(
          UUID.fromString(segments[3]), UUID.fromString(segments[6]),
          principal.getName(), request.getHeader("Idempotency-Key"));
    }
    return true;
  }
}
