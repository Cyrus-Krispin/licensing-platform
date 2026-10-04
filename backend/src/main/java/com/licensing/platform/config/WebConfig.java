package com.licensing.platform.config;

import com.licensing.platform.draft.EvidenceAuthorizationInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
class WebConfig implements WebMvcConfigurer {
  private final EvidenceAuthorizationInterceptor evidenceAuthorization;

  WebConfig(EvidenceAuthorizationInterceptor evidenceAuthorization) {
    this.evidenceAuthorization = evidenceAuthorization;
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry.addInterceptor(evidenceAuthorization)
        .addPathPatterns("/api/applications/*/evidence/requests/*");
  }
}
