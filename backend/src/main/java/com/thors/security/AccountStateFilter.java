package com.thors.security;

import com.thors.module.account.repository.AccountRepository;
import com.thors.module.account.repository.PasswordChangeRequirementRepository;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.Set;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class AccountStateFilter extends OncePerRequestFilter {
  /** API vẫn dùng được khi tài khoản đang bị bắt đổi mật khẩu. */
  private static final Set<String> ALLOWED_WHILE_PASSWORD_CHANGE_REQUIRED =
      Set.of(
          "/api/auth/me",
          "/api/auth/logout",
          "/api/auth/change-password",
          "/api/auth/csrf",
          "/api/auth/capabilities");

  private final AccountRepository users;
  private final PasswordChangeRequirementRepository passwordChanges;

  public AccountStateFilter(AccountRepository users, PasswordChangeRequirementRepository passwordChanges) {
    this.users = users;
    this.passwordChanges = passwordChanges;
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
      } else if (blockedUntilPasswordChange(req) && passwordChanges.required(p.userId())) {
        res.setStatus(403);
        res.setContentType("application/json;charset=UTF-8");
        res.getWriter()
            .write(
                "{\"code\":\"PASSWORD_CHANGE_REQUIRED\",\"message\":\"Bạn cần đổi mật khẩu trước khi"
                    + " sử dụng hệ thống.\"}");
        return;
      }
    }
    chain.doFilter(req, res);
  }

  /** Chỉ chặn API (trừ danh sách được phép và trang shop công khai); không chặn OAuth2, trang lỗi... */
  private static boolean blockedUntilPasswordChange(HttpServletRequest req) {
    String path = req.getRequestURI().substring(req.getContextPath().length());
    return path.startsWith("/api/")
        && !path.startsWith("/api/shop/")
        && !ALLOWED_WHILE_PASSWORD_CHANGE_REQUIRED.contains(path);
  }
}
