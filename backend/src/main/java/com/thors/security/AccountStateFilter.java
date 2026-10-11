package com.thors.security;

import com.thors.module.account.repository.AccountRepository;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class AccountStateFilter extends OncePerRequestFilter {
  private final AccountRepository users;

  public AccountStateFilter(AccountRepository users) {
    this.users = users;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest req, HttpServletResponse res, FilterChain chain)
      throws ServletException, IOException {
    var auth = SecurityContextHolder.getContext().getAuthentication();
    if (auth != null && auth.getPrincipal() instanceof SessionUser p) {
      var a = users.byId(p.userId());
      if (a.isEmpty() || !a.get().active() || a.get().authVersion() != p.authVersion()
          || !a.get().passwordHash().equals(p.passwordHash()) || !a.get().role().equals(p.role())) {
        SecurityContextHolder.clearContext();
        var s = req.getSession(false);
        if (s != null) s.invalidate();
      }
    }
    chain.doFilter(req, res);
  }
}
