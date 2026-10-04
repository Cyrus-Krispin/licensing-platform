package com.licensing.platform.auth;

import java.security.Principal;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {
    @GetMapping("/auth/csrf")
    Map<String, String> csrf(CsrfToken token) {
        return Map.of("token", token.getToken(), "headerName", token.getHeaderName());
    }

    @GetMapping("/auth/me")
    Map<String, String> me(Authentication authentication) {
        return Map.of(
                "username", authentication.getName(),
                "role", authentication.getAuthorities().iterator().next().getAuthority().substring(5));
    }

    @GetMapping("/workspaces/operator")
    Map<String, String> operator(Principal principal) {
        return workspace(
                "Operator workspace",
                "Create an application or continue one of your saved drafts.",
                principal);
    }

    @GetMapping("/workspaces/officer")
    Map<String, String> officer(Principal principal) {
        return workspace(
                "Officer workspace",
                "Review submitted applications, request targeted corrections, and record final decisions.",
                principal);
    }

    private Map<String, String> workspace(String heading, String message, Principal principal) {
        return Map.of("heading", heading, "message", message, "username", principal.getName());
    }
}
