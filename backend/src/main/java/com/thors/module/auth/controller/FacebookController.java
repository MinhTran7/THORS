package com.thors.module.auth.controller;

import com.thors.common.ApiException;
import com.thors.config.Settings;
import com.thors.module.account.mapper.AccountMapper;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.auth.dto.AuthRequests.Code;
import com.thors.module.auth.entity.OtpChallenge;
import com.thors.module.auth.service.FacebookAccountService;
import com.thors.module.auth.service.FacebookAccountService.Pending;
import com.thors.security.*;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth/facebook")
public class FacebookController {
    private final FacebookAccountService facebook;
    private final SessionAccess sessions;
    private final Settings settings;
    private final AccountRepository users;
    public FacebookController(FacebookAccountService facebook, SessionAccess sessions, Settings settings, AccountRepository users) {
        this.facebook = facebook; this.sessions = sessions; this.settings = settings; this.users = users;
    }
    public record Email(String email) {}
    private Pending pending(HttpServletRequest req) {
        if (settings.facebook() == null || !settings.facebook().enabled())
            throw new ApiException(503, "FACEBOOK_NOT_CONFIGURED", "Facebook chưa được cấu hình.");
        var s = req.getSession(false);
        var p = s == null ? null : (Pending) s.getAttribute("FACEBOOK_PENDING");
        facebook.valid(p);
        return p;
    }
    @GetMapping("/context")
    Object context(HttpServletRequest req) {
        var p = pending(req);
        var c = (OtpChallenge) req.getSession().getAttribute("FACEBOOK_CHALLENGE");
        return Map.of("email", p.actor() == null ? (p.email() == null ? "" : p.email()) : "",
                "linking", p.actor() != null, "sent", c != null,
                "destination", c == null ? "" : mask(c.destination()),
                "resendSeconds", settings.auth().resendSeconds());
    }
    @PostMapping("/email")
    Object email(@RequestBody Email r, HttpServletRequest req) {
        var p = pending(req);
        synchronized (req.getSession()) {
            var c = facebook.send(p, r.email());
            req.getSession().setAttribute("FACEBOOK_CHALLENGE", c);
            return Map.of("destination", mask(c.destination()), "resendSeconds", settings.auth().resendSeconds());
        }
    }
    @PostMapping("/resend")
    Object resend(HttpServletRequest req) {
        var p = pending(req);
        synchronized (req.getSession()) {
            var old = (OtpChallenge) req.getSession().getAttribute("FACEBOOK_CHALLENGE");
            if (old == null) throw new ApiException(400, "OTP_CONTEXT", "Hãy nhập email trước.");
            var c = facebook.send(p, old.destination());
            req.getSession().setAttribute("FACEBOOK_CHALLENGE", c);
            return Map.of("destination", mask(c.destination()), "resendSeconds", settings.auth().resendSeconds());
        }
    }
    @PostMapping("/verify")
    Object verify(@Valid @RequestBody Code r, HttpServletRequest req, HttpServletResponse res) {
        var p = pending(req);
        synchronized (req.getSession()) {
            var c = (OtpChallenge) req.getSession().getAttribute("FACEBOOK_CHALLENGE");
            var result = facebook.finish(p, c, r.code());
            if (!result.check().success())
                throw new ApiException(400, result.check().code(), result.check().message());
            req.getSession().removeAttribute("FACEBOOK_PENDING");
            req.getSession().removeAttribute("FACEBOOK_CHALLENGE");
            sessions.login(result.account(), req, res);
            return Map.of("account", AccountMapper.view(result.account()));
        }
    }
    @GetMapping("/status")
    Object status() {
        return Map.of("linked", users.facebookLink(sessions.current().id()) != null);
    }
    @PostMapping("/link")
    Object link(HttpServletRequest req) {
        if (settings.facebook() == null || !settings.facebook().enabled())
            throw new ApiException(503, "FACEBOOK_NOT_CONFIGURED", "Facebook chưa được cấu hình.");
        var a = sessions.current();
        req.getSession().setAttribute("FACEBOOK_LINK_USER", SessionUser.from(a));
        req.getSession().setAttribute("FACEBOOK_LINK_AT", System.currentTimeMillis());
        return Map.of("url", "/oauth2/authorization/facebook");
    }
    private String mask(String email) { return email.charAt(0) + "***" + email.substring(email.indexOf('@')); }
}
