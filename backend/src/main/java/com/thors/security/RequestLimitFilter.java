package com.thors.security;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.web.filter.OncePerRequestFilter;

public class RequestLimitFilter extends OncePerRequestFilter {
  private record Window(long start, int count) {}

  private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

  @Override
  protected void doFilterInternal(
      HttpServletRequest req, HttpServletResponse res, FilterChain chain)
      throws ServletException, IOException {
    if ("POST".equals(req.getMethod()) && req.getRequestURI().startsWith("/api/auth/")) {
      long now = System.currentTimeMillis();
      String key = req.getRemoteAddr() + ":" + req.getRequestURI();
      int max = req.getRequestURI().endsWith("login") ? 30 : 60;
      if (windows.size() > 10000)
        windows.entrySet().removeIf(e -> now - e.getValue().start() > 900000);
      var w =
          windows.compute(
              key,
              (k, old) ->
                  old == null || now - old.start() > 900000
                      ? new Window(now, 1)
                      : new Window(old.start(), old.count() + 1));
      if (w.count() > max) {
        res.setStatus(429);
        res.setContentType("application/json;charset=UTF-8");
        res.getWriter()
            .write(
                "{\"code\":\"RATE_LIMIT\",\"message\":\"Quá nhiều yêu cầu. Vui lòng thử lại"
                    + " sau.\"}");
        return;
      }
    }
    chain.doFilter(req, res);
  }
}
