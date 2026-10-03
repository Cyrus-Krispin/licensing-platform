package com.licensing.platform;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.junit.jupiter.api.*;import org.springframework.beans.factory.annotation.Autowired;import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;import org.springframework.boot.test.context.SpringBootTest;import org.springframework.jdbc.core.JdbcTemplate;import org.springframework.security.crypto.password.PasswordEncoder;import org.springframework.test.web.servlet.MockMvc;import org.springframework.test.web.servlet.MvcResult;
@SpringBootTest @AutoConfigureMockMvc class AuthIntegrationTest {
 @Autowired MockMvc mvc; @Autowired JdbcTemplate db; @Autowired PasswordEncoder encoder;
 @BeforeEach void seed(){db.update("delete from app_user");db.update("insert into app_user values (?,?,?)","operator",encoder.encode("password"),"OPERATOR");db.update("insert into app_user values (?,?,?)","officer",encoder.encode("password"),"OFFICER");}
 MvcResult login(String user,String password) throws Exception{return mvc.perform(post("/api/auth/login").with(csrf()).param("username",user).param("password",password)).andReturn();}
 @Test void csrfEndpointIsPublic()throws Exception{mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andExpect(jsonPath("$.token").isNotEmpty());}
 @Test void mutationWithoutCsrfIsRejected()throws Exception{mvc.perform(post("/api/auth/login").param("username","operator").param("password","password")).andExpect(status().isForbidden());}
 @Test void invalidCredentialsAreRejected()throws Exception{mvc.perform(post("/api/auth/login").with(csrf()).param("username","operator").param("password","wrong")).andExpect(status().isUnauthorized());}
 @Test void anonymousCannotReadWorkspace()throws Exception{mvc.perform(get("/api/workspaces/operator")).andExpect(status().isUnauthorized());}
 @Test void operatorCanOnlyReadOperatorWorkspace()throws Exception{var session=login("operator","password").getResponse().getCookie("SESSION");mvc.perform(get("/api/workspaces/operator").cookie(session)).andExpect(status().isOk()).andExpect(jsonPath("$.heading").value("Operator workspace"));mvc.perform(get("/api/workspaces/officer").cookie(session)).andExpect(status().isForbidden());}
 @Test void officerCanOnlyReadOfficerWorkspace()throws Exception{var session=login("officer","password").getResponse().getCookie("SESSION");mvc.perform(get("/api/workspaces/officer").cookie(session)).andExpect(status().isOk());mvc.perform(get("/api/workspaces/operator").cookie(session)).andExpect(status().isForbidden());}
 @Test void logoutRevokesSession()throws Exception{var session=login("operator","password").getResponse().getCookie("SESSION");mvc.perform(post("/api/auth/logout").with(csrf()).cookie(session)).andExpect(status().isNoContent());mvc.perform(get("/api/auth/me").cookie(session)).andExpect(status().isUnauthorized());}
}
