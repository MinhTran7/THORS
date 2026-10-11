package com.thors.module.auth.service;

import com.thors.config.Settings;
import com.thors.security.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

@Component
public class GoogleLoginHandler implements AuthenticationSuccessHandler {
  private final GoogleAccountService google;
  private final SessionAccess sessions;
  private final Settings settings;

  public GoogleLoginHandler(
      GoogleAccountService google, SessionAccess sessions, Settings settings) {
    this.google = google;
    this.sessions = sessions;
    this.settings = settings;
  }

  @Override
  public void onAuthenticationSuccess(
      HttpServletRequest req, HttpServletResponse res, Authentication authentication)
      throws IOException {
    var session = req.getSession();
    var link = (SessionUser) session.getAttribute("GOOGLE_LINK_USER");
    var linkAt = (Long) session.getAttribute("GOOGLE_LINK_AT");
    session.removeAttribute("GOOGLE_LINK_USER");
    session.removeAttribute("GOOGLE_LINK_AT");
    try {
      if (link != null && (linkAt == null || System.currentTimeMillis() - linkAt > 600000))
        throw new IllegalArgumentException();
      var oidc = (OidcUser) authentication.getPrincipal();
      var a =
          google.resolve(
              oidc.getSubject(),
              oidc.getEmail(),
              oidc.getFullName(),
              Boolean.TRUE.equals(oidc.getEmailVerified()),
              link == null ? null : link.userId(),
              link == null ? null : link.authVersion());
      sessions.login(a, req, res);
      res.sendRedirect(settings.frontendUrl() + "/auth/google/callback");
    } catch (Exception e) {
      sessions.clear(req, res);
      String code = e instanceof com.thors.common.ApiException x ? x.code : "GOOGLE_FAILED";
      res.sendRedirect(
          settings.frontendUrl() + "/login?error=" + code.toLowerCase(java.util.Locale.ROOT));
    }
  }
}
