package com.thors.module.auth.service;

import com.thors.common.*;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.auth.entity.OtpChallenge;
import com.thors.security.SessionUser;
import java.io.Serializable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FacebookAccountService {
    public record Pending(String subject, String name, String email, SessionUser actor, long expires)
            implements Serializable {}
    public record Result(OtpService.Check check, Account account) {}
    private final AccountRepository users;
    private final OtpService otp;

    public FacebookAccountService(AccountRepository users, OtpService otp) {
        this.users = users;
        this.otp = otp;
    }

    public void valid(Pending p) {
        if (p == null || p.expires() < System.currentTimeMillis())
            throw new ApiException(400, "FACEBOOK_EXPIRED", "Phiên Facebook đã hết hạn. Vui lòng bắt đầu lại.");
        if (p.subject() == null || !p.subject().matches("[0-9]{1,255}"))
            throw new ApiException(400, "FACEBOOK_FAILED", "Thông tin Facebook không hợp lệ.");
    }

    private Account actor(Pending p) {
        var a = users.lock(p.actor().userId());
        if (!a.active() || a.authVersion() != p.actor().authVersion()
                || !a.passwordHash().equals(p.actor().passwordHash()) || !a.role().equals(p.actor().role()))
            throw new ApiException(401, "LINK_EXPIRED", "Phiên liên kết đã hết hiệu lực. Vui lòng đăng nhập lại.");
        return a;
    }

    /** Returns a THORS account only for an already linked, verified identity. */
    @Transactional
    public Account login(Pending p) {
        valid(p);
        users.lockIdentityRegistry();
        if (p.actor() != null) {
            actor(p); // Explicit linking always verifies the THORS email with a fresh OTP.
            return null;
        }
        var linked = users.byFacebook(p.subject());
        if (linked.isEmpty()) return null;
        var a = users.lock(linked.get().id());
        if (!a.active()) throw new ApiException(403, "ACCOUNT_BLOCKED", "Tài khoản chưa kích hoạt hoặc đã bị khóa.");
        if (!a.verified("EMAIL")) throw new ApiException(403, "FACEBOOK_EMAIL_REQUIRED", "Hãy đăng nhập THORS và xác minh email trước.");
        return a;
    }

    private String pendingHash(Pending p) { return "!FACEBOOK_PENDING:" + users.facebookKey(p.subject()); }

    @Transactional
    public OtpChallenge send(Pending p, String enteredEmail) {
        valid(p);
        users.lockIdentityRegistry();
        Account a;
        if (p.actor() != null) {
            a = actor(p);
        } else {
            String email = ContactNormalizer.email(enteredEmail);
            var found = users.byIdentifier(email);
            if (found.isPresent()) {
                a = users.lock(found.get().id());
                if (!a.pending() || !"CUSTOMER".equals(a.role()) || !pendingHash(p).equals(a.passwordHash()))
                    throw new ApiException(409, "FACEBOOK_LINK_REQUIRED",
                            "Email đã có tài khoản THORS. Hãy đăng nhập tài khoản đó rồi liên kết Facebook trong hồ sơ.");
            } else {
                String name = p.name() == null || p.name().isBlank() ? "Khách hàng Facebook" : p.name();
                a = users.create("CUSTOMER", ContactNormalizer.name(name), pendingHash(p), email,
                        null, "PENDING_VERIFICATION", null, null, false);
            }
        }
        var linked = users.byFacebook(p.subject());
        if (linked.isPresent() && linked.get().id() != a.id())
            throw new ApiException(409, "FACEBOOK_IN_USE", "Facebook đã liên kết tài khoản khác.");
        var current = users.facebookLink(a.id());
        if (current != null && !current.equals(users.facebookKey(p.subject())))
            throw new ApiException(409, "FACEBOOK_ALREADY_LINKED", "Tài khoản đã liên kết Facebook khác.");
        return otp.issue(a.id(), "FACEBOOK", "EMAIL", false);
    }

    @Transactional
    public Result finish(Pending p, OtpChallenge c, String code) {
        valid(p);
        if (c == null || !"FACEBOOK".equals(c.context()))
            throw new ApiException(400, "OTP_CONTEXT", "Hãy gửi mã OTP trước.");
        users.lockIdentityRegistry();
        var a = users.lock(c.userId());
        if (p.actor() != null) {
            var owner = actor(p);
            if (owner.id() != a.id()) throw new ApiException(400, "OTP_CONTEXT", "Yêu cầu không hợp lệ.");
        } else if (!a.pending() || !"CUSTOMER".equals(a.role()) || !pendingHash(p).equals(a.passwordHash())) {
            throw new ApiException(400, "FACEBOOK_EXPIRED", "Yêu cầu đăng ký không còn hiệu lực.");
        }
        // Do not throw for wrong OTP here: its attempt count must commit.
        var check = otp.verify(c, code);
        if (!check.success()) return new Result(check, null);
        users.linkFacebook(a.id(), p.subject());
        users.verify(a.id(), "EMAIL", p.actor() == null);
        if (p.actor() == null) users.password(a.id(), "!FACEBOOK_ONLY", false);
        users.audit(a.id(), "FACEBOOK_EMAIL_VERIFIED", a.id(), "EMAIL");
        return new Result(check, users.byId(a.id()).orElseThrow());
    }
}
