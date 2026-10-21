package com.thors;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.thors.common.ApiException;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.auth.service.*;
import com.thors.module.auth.service.FacebookAccountService.Pending;
import com.thors.security.SessionUser;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.*;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"thors.facebook.enabled=true", "thors.facebook.client-id=test-app",
        "thors.facebook.client-secret=test-secret"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(AuthIntegrationTest.TestDelivery.class)
class FacebookIntegrationTest {
    @Autowired FacebookAccountService facebook;
    @Autowired FacebookLoginHandler handler;
    @Autowired AccountRepository users;
    @Autowired JdbcTemplate db;
    @Autowired AuthIntegrationTest.RecordingSender sender;
    @Autowired MockMvc mvc;

    @BeforeEach void clean() {
        SecurityContextHolder.clearContext();
        db.update("DELETE FROM audit_log"); db.update("DELETE FROM `user`"); sender.values.clear();
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    Pending pending(String sub) { return new Pending(sub, "Facebook Customer", null, null, System.currentTimeMillis()+600000); }

    @Test void registrationRequiresOtpThenAllowsRepeatLoginWithoutOtp() {
        var p = pending("123");
        assertNull(facebook.login(p));
        var c = facebook.send(p, "new@example.com");
        assertTrue(users.byId(c.userId()).orElseThrow().pending());
        assertTrue(users.byFacebook("123").isEmpty());
        var result = facebook.finish(p, c, sender.values.get("new@example.com"));
        assertTrue(result.check().success()); assertTrue(result.account().active());
        assertTrue(result.account().verified("EMAIL"));
        assertEquals("CUSTOMER", result.account().role());
        assertEquals(result.account().id(), facebook.login(p).id());
        assertThrows(ApiException.class, () -> facebook.finish(p, c, sender.values.get("new@example.com")));
    }
    @Test void wrongAttemptsCommitAndFiveAttemptsLock() {
        var p = pending("124"); var c = facebook.send(p, "wrong@example.com");
        String correct = sender.values.get("wrong@example.com");
        String wrong = "000000".equals(correct) ? "111111" : "000000";
        for (int i=1; i<=5; i++) {
            assertFalse(facebook.finish(p,c,wrong).check().success());
        }
        assertEquals("OTP_LOCKED", facebook.finish(p,c,correct).check().code());
        assertTrue(users.byFacebook("124").isEmpty());
        assertThrows(ApiException.class, () -> facebook.send(p,"wrong@example.com"));
    }
    @Test void expirationAndResendInvalidateOldCode() {
        var p = pending("125"); var c = facebook.send(p,"expire@example.com");
        db.update("UPDATE `user` SET verification_expires_at=DATEADD('MINUTE',-1,CURRENT_TIMESTAMP) WHERE user_id=?",c.userId());
        assertEquals("OTP_EXPIRED",facebook.finish(p,c,sender.values.get("expire@example.com")).check().code());
        assertThrows(ApiException.class, () -> facebook.send(p,"expire@example.com"));
        db.update("UPDATE audit_log SET performed_at=DATEADD('MINUTE',-2,CURRENT_TIMESTAMP)");
        var next = facebook.send(p,"expire@example.com");
        assertEquals("OTP_EXPIRED",facebook.finish(p,c,sender.values.get("expire@example.com")).check().code());
        assertTrue(facebook.finish(p,next,sender.values.get("expire@example.com")).check().success());
    }
    @Test void existingEmailDoesNotAutoLink() {
        var a = users.create("CUSTOMER","Customer","!TEST","existing@example.com",null,"ACTIVE",null,null,true);
        var e = assertThrows(ApiException.class, () -> facebook.send(pending("126"),a.email()));
        assertEquals("FACEBOOK_LINK_REQUIRED",e.code);
        assertTrue(users.byFacebook("126").isEmpty());
    }
    @Test void explicitLinkUsesThorsEmailThenLoginAndBlock() {
        var a = users.create("CUSTOMER","Customer","!TEST","owner@example.com",null,"ACTIVE",null,null,true);
        var p = new Pending("127","Someone","different@example.com",SessionUser.from(a),System.currentTimeMillis()+600000);
        var c = facebook.send(p,"attacker@example.com");
        assertEquals(a.email(),c.destination());
        assertTrue(facebook.finish(p,c,sender.values.get(a.email())).check().success());
        assertEquals(a.id(),facebook.login(pending("127")).id());
        users.status(a.id(),"LOCKED");
        assertEquals("ACCOUNT_BLOCKED",assertThrows(ApiException.class,()->facebook.login(pending("127"))).code);
    }
    @Test void subjectCannotReuseAnotherSubjectsChallenge() {
        var p = pending("128"); var c = facebook.send(p,"bound@example.com");
        assertThrows(ApiException.class, () -> facebook.finish(pending("129"),c,sender.values.get("bound@example.com")));
        assertTrue(users.byFacebook("129").isEmpty());
    }
    @Test void linkIntentInvalidatedByAccountChanges() {
        var a=users.create("CUSTOMER","Customer","!TEST","change@example.com",null,"ACTIVE",null,null,true);
        var p=new Pending("130","Name",null,SessionUser.from(a),System.currentTimeMillis()+600000);
        var c=facebook.send(p,null);
        users.password(a.id(),"!NEW",false);
        assertThrows(ApiException.class,()->facebook.finish(p,c,sender.values.get(a.email())));
    }
    @Test void expiredOAuthContextCannotSendOtp() {
        var p=new Pending("131","Name",null,null,0);
        assertThrows(ApiException.class,()->facebook.send(p,"expired@example.com"));
    }
    @Test void oauthCallbackDoesNotAuthenticateBeforeOtp() throws Exception {
        var request=new MockHttpServletRequest(); var response=new MockHttpServletResponse();
        var authorities=List.of(new SimpleGrantedAuthority("ROLE_USER"));
        var principal=new DefaultOAuth2User(authorities,Map.of("id","132","name","Facebook User"),"id");
        var token=new OAuth2AuthenticationToken(principal,authorities,"facebook");
        SecurityContextHolder.getContext().setAuthentication(token);
        handler.onAuthenticationSuccess(request,response,token);
        assertEquals("http://localhost:3000/auth/facebook/complete",response.getRedirectedUrl());
        assertNull(SecurityContextHolder.getContext().getAuthentication());
        var session=(MockHttpSession)request.getSession();
        assertNull(session.getAttribute("SPRING_SECURITY_CONTEXT"));
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/facebook/email").session(session).contentType("application/json")
                .content("{\"email\":\"http@example.com\"}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/facebook/email").session(session).with(csrf()).contentType("application/json")
                .content("{\"email\":\"http@example.com\"}")).andExpect(status().isOk());
        mvc.perform(post("/api/auth/facebook/verify").session(session).with(csrf()).contentType("application/json")
                .content("{\"code\":\""+sender.values.get("http@example.com")+"\"}")).andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk());
    }
    @Test void oauthStateRequired() throws Exception {
        mvc.perform(get("/login/oauth2/code/facebook").param("code","forged").param("state","invalid"))
                .andExpect(status().is3xxRedirection()).andExpect(redirectedUrl("http://localhost:3000/login?error=facebook_failed"));
    }
}
