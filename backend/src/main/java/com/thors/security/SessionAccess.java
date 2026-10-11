package com.thors.security;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository;
import jakarta.servlet.http.*;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.stereotype.Component;

@Component
public class SessionAccess {
  private final AccountRepository users;
  private final HttpSessionSecurityContextRepository contexts =
      new HttpSessionSecurityContextRepository();

  public SessionAccess(AccountRepository users) {
    this.users = users;
  }

  public Account current() {
    var auth = SecurityContextHolder.getContext().getAuthentication();
    if (auth == null || !(auth.getPrincipal() instanceof SessionUser p))
      throw new ApiException(401, "UNAUTHENTICATED", "Vui lòng đăng nhập.");
    var a =
        users
            .byId(p.userId())
            .orElseThrow(
                () -> new ApiException(401, "UNAUTHENTICATED", "Phiên đăng nhập không hợp lệ."));
    if (!a.active() || a.authVersion() != p.authVersion()
        || !a.passwordHash().equals(p.passwordHash()) || !a.role().equals(p.role()))
      throw new ApiException(401, "SESSION_EXPIRED", "Phiên đăng nhập đã hết hiệu lực.");
    return a;
  }

  public void login(Account a, HttpServletRequest request, HttpServletResponse response) {
    if (request.getSession(false) != null) request.changeSessionId();
    var context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(
        new UsernamePasswordAuthenticationToken(
            SessionUser.from(a), null, List.of(new SimpleGrantedAuthority("ROLE_" + a.role()))));
    SecurityContextHolder.setContext(context);
    contexts.saveContext(context, request, response);
    request.getSession().removeAttribute("OTP_CHALLENGE");
    request.getSession().removeAttribute("RESET_GRANT");
  }

  public void clear(HttpServletRequest req, HttpServletResponse res) {
    var session = req.getSession(false);
    if (session != null) session.invalidate();
    SecurityContextHolder.clearContext();
    var cookie = new Cookie("JSESSIONID", "");
    cookie.setPath("/");
    cookie.setMaxAge(0);
    cookie.setHttpOnly(true);
    cookie.setSecure(req.isSecure());
    res.addCookie(cookie);
  }
}
