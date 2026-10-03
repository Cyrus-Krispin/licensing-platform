package com.licensing.platform.config;
import javax.sql.DataSource;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.JdbcUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
@Configuration public class SecurityConfig {
 @Bean PasswordEncoder passwordEncoder(){ return new BCryptPasswordEncoder(); }
 @Bean UserDetailsService users(DataSource ds){ JdbcUserDetailsManager m=new JdbcUserDetailsManager(ds); m.setUsersByUsernameQuery("select username,password_hash,true from app_user where username=?"); m.setAuthoritiesByUsernameQuery("select username,concat('ROLE_',role) from app_user where username=?"); return m; }
 @Bean SecurityFilterChain security(HttpSecurity h) throws Exception { var csrf=CookieCsrfTokenRepository.withHttpOnlyFalse(); csrf.setCookiePath("/"); h.csrf(c->c.csrfTokenRepository(csrf)).authorizeHttpRequests(a->a.requestMatchers("/api/auth/csrf","/actuator/health/**").permitAll().requestMatchers("/api/workspaces/operator").hasRole("OPERATOR").requestMatchers("/api/workspaces/officer").hasRole("OFFICER").anyRequest().authenticated()).exceptionHandling(e->e.authenticationEntryPoint((q,s,x)->s.sendError(401))).formLogin(f->f.loginProcessingUrl("/api/auth/login").successHandler((q,s,a)->s.setStatus(204)).failureHandler((q,s,e)->s.sendError(401,"Invalid credentials"))).logout(l->l.logoutUrl("/api/auth/logout").logoutSuccessHandler((q,s,a)->s.setStatus(204))); return h.build(); }
}
