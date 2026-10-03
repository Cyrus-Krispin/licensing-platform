package com.licensing.platform.auth;
import java.security.Principal;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api") public class AuthController {
 @GetMapping("/auth/csrf") Map<String,String> csrf(CsrfToken token){ return Map.of("token",token.getToken(),"headerName",token.getHeaderName()); }
 @GetMapping("/auth/me") Map<String,String> me(Authentication a){ return Map.of("username",a.getName(),"role",a.getAuthorities().iterator().next().getAuthority().substring(5)); }
 @GetMapping("/workspaces/operator") Map<String,String> operator(Principal p){ return Map.of("heading","Operator workspace","message","Start an application in a later product slice.","username",p.getName()); }
 @GetMapping("/workspaces/officer") Map<String,String> officer(Principal p){ return Map.of("heading","Officer workspace","message","Submitted applications will appear in a later product slice.","username",p.getName()); }
}
