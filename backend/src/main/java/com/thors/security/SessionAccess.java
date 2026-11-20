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

  /**
   * TẠO PHIÊN ĐĂNG NHẬP sau khi đã kiểm tra đúng (gọi từ AuthController.login, Google/Facebook handler...).
   * Sau hàm này trình duyệt giữ cookie JSESSIONID; các request sau dùng cookie đó để biết ai đang đăng nhập.
   */
  public void login(Account a, HttpServletRequest request, HttpServletResponse response) {
    // Đổi mã phiên: chống chiếm phiên (session fixation) — mã phiên trước đăng nhập không dùng được nữa
    if (request.getSession(false) != null) request.changeSessionId();
    // Tạo "giấy thông hành" Spring Security: SessionUser (id, vai trò, phiên bản mật khẩu...) + quyền ROLE_<vai trò>
    var context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(
            new UsernamePasswordAuthenticationToken(
                    SessionUser.from(a), null, List.of(new SimpleGrantedAuthority("ROLE_" + a.role()))));
    SecurityContextHolder.setContext(context);
    // Lưu vào session → trình duyệt nhận cookie JSESSIONID
    contexts.saveContext(context, request, response);
    // Xóa dữ liệu OTP / đặt lại mật khẩu còn sót trong session
    request.getSession().removeAttribute("OTP_CHALLENGE");
    request.getSession().removeAttribute("RESET_GRANT");
    // Ghi audit_log: LOGIN kèm địa chỉ IP
    users.audit(a.id(), "LOGIN", a.id(), "IP " + request.getRemoteAddr());
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