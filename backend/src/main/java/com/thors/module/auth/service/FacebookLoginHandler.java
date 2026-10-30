package com.thors.module.auth.service;

import com.thors.config.Settings;
import com.thors.security.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

@Component
public class FacebookLoginHandler implements AuthenticationSuccessHandler {
    private final FacebookAccountService facebook;
    private final SessionAccess sessions;
    private final Settings settings;
    public FacebookLoginHandler(FacebookAccountService facebook, SessionAccess sessions, Settings settings) {
        this.facebook = facebook; this.sessions = sessions; this.settings = settings;
    }
    @Override
    public void onAuthenticationSuccess(HttpServletRequest req, HttpServletResponse res, Authentication auth)
            throws IOException {
        var old = req.getSession();
        var actor = (SessionUser) old.getAttribute("FACEBOOK_LINK_USER");
        var at = (Long) old.getAttribute("FACEBOOK_LINK_AT");
        try {
            if (actor != null && (at == null || System.currentTimeMillis() - at > 600000))
                throw new IllegalArgumentException("Expired link intent");
            var profile = (OAuth2User) auth.getPrincipal();
            var pending = new FacebookAccountService.Pending(profile.getName(), profile.getAttribute("name"),
                    profile.getAttribute("email"), actor, System.currentTimeMillis() + 20 * 60000);
            var account = facebook.login(pending);
            // OAuth success alone must NEVER grant access to THORS before email verification.
            sessions.clear(req, res);
            if (account != null) {
                sessions.login(account, req, res);
                res.sendRedirect(settings.frontendUrl() + "/auth/facebook/callback");
            } else {
                req.getSession(true).setAttribute("FACEBOOK_PENDING", pending);
                res.sendRedirect(settings.frontendUrl() + "/auth/facebook/complete");
            }
        } catch (Exception e) {
            sessions.clear(req, res);
            String code = e instanceof com.thors.common.ApiException x ? x.code : "FACEBOOK_FAILED";
            res.sendRedirect(settings.frontendUrl() + "/login?error=" + code.toLowerCase(java.util.Locale.ROOT));
        }
    }
}
