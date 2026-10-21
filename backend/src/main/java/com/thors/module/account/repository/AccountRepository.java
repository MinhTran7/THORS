package com.thors.module.account.repository;

import com.thors.common.ApiException;
import com.thors.common.ContactNormalizer;
import com.thors.module.account.entity.Account;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.*;
import java.time.LocalDateTime;
import java.util.*;
import org.springframework.jdbc.core.*;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** Uses the existing user, role and audit_log tables. */
@Repository
public class AccountRepository {
    private final JdbcTemplate db;

    public AccountRepository(JdbcTemplate db) {
        this.db = db;
    }

    // Computed aliases, not extra columns.
    private static final String SELECT = """
      SELECT u.*, r.role_name,
        (SELECT a.new_value FROM audit_log a WHERE a.entity_affected='user'
          AND a.entity_id=u.user_id AND a.action_type='GOOGLE_LINK'
          ORDER BY a.log_id DESC LIMIT 1) AS linked_google_key,
        (SELECT COALESCE(MAX(a.log_id),0) FROM audit_log a WHERE a.entity_affected='user'
          AND a.entity_id=u.user_id AND a.action_type IN ('PASSWORD_INVALIDATE','STATUS_INVALIDATE')) AS session_revision,
        (SELECT a.user_id FROM audit_log a WHERE a.entity_affected='user'
          AND a.entity_id=u.user_id AND a.action_type='ACCOUNT_CREATE'
          ORDER BY a.log_id ASC LIMIT 1) AS account_creator
      FROM `user` u JOIN `role` r ON r.role_id=u.role_id
      """;

    // 14 tham số, khớp record Account.
    private final RowMapper<Account> mapper = (rs, i) -> new Account(
            rs.getInt("user_id"),
            rs.getString("role_name"),
            rs.getString("full_name"),
            rs.getString("password_hash"),
            rs.getString("email"),
            rs.getString("phone"),
            rs.getString("address"),
            rs.getString("avatar_url"),
            rs.getString("account_status"),
            time(rs, "created_at"),
            time(rs, "email_verified_at"),
            rs.getString("linked_google_key"),
            rs.getLong("session_revision"),
            rs.getObject("account_creator", Integer.class));

    /** Một trang kết quả tìm kiếm tài khoản. */
    public record Page(List<Account> items, long total) {}

    /** Yêu cầu đặt lại mật khẩu của Shop Owner chưa được Admin xử lý. */
    public record OpenResetRequest(int userId, String fullName, String email, LocalDateTime requestedAt) {}

    private static LocalDateTime time(ResultSet r, String col) throws SQLException {
        return r.getObject(col, LocalDateTime.class);
    }

    public Optional<Account> byId(int id) {
        return db.query(SELECT + " WHERE u.user_id=?", mapper, id).stream().findFirst();
    }

    public Account lock(int id) {
        // Lock user separately to preserve lock order.
        var rows = db.queryForList("SELECT user_id FROM `user` WHERE user_id=? FOR UPDATE", id);
        if (rows.isEmpty()) {
            throw new ApiException(404, "ACCOUNT_NOT_FOUND", "Không tìm thấy tài khoản.");
        }
        return byId(id).orElseThrow();
    }

    /** Serialize identity allocation on the existing CUSTOMER role row. */
    public void lockIdentityRegistry() {
        var rows = db.queryForList("SELECT role_id FROM `role` WHERE role_name='CUSTOMER' FOR UPDATE");
        if (rows.size() != 1) {
            throw new IllegalStateException("Database thiếu role CUSTOMER.");
        }
    }

    public Optional<Account> byIdentifier(String value) {
        value = ContactNormalizer.identifier(value);
        final String identity = value;
        List<Account> found;
        if (value.contains("@")) {
            found = db.query(SELECT + " WHERE LOWER(TRIM(u.email))=?", mapper, value);
        } else {
            // Match legacy VN phone formats.
            found = db.query(SELECT + " WHERE u.phone IS NOT NULL", mapper).stream()
                    .filter(a -> identity.equals(normalizedPhone(a.phone())))
                    .toList();
        }
        if (found.size() > 1) {
            throw new ApiException(409, "IDENTIFIER_AMBIGUOUS",
                    "Số điện thoại được dùng bởi nhiều tài khoản. "
                            + "Hãy đăng nhập bằng email và liên hệ quản trị.");
        }
        return found.stream().findFirst();
    }

    private String normalizedPhone(String value) {
        try {
            return ContactNormalizer.phone(value);
        } catch (ApiException e) {
            return null;
        }
    }

    private void ensurePhoneAvailable(String phone, Integer exclude) {
        if (phone == null) {
            return;
        }
        boolean exists = db.query(SELECT + " WHERE u.phone IS NOT NULL", mapper).stream()
                .anyMatch(a -> !Objects.equals(a.id(), exclude)
                        && phone.equals(normalizedPhone(a.phone())));
        if (exists) {
            throw new ApiException(409, "PHONE_IN_USE", "Số điện thoại đã được sử dụng.");
        }
    }

    public String googleKey(String sub) {
        try {
            return "google:" + HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(sub.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public Optional<Account> byGoogle(String sub) {
        var found = db.query(
                SELECT + " WHERE EXISTS (SELECT 1 FROM audit_log a"
                        + " WHERE a.entity_affected='user' AND a.entity_id=u.user_id"
                        + " AND a.action_type='GOOGLE_LINK' AND a.new_value=?)",
                mapper, googleKey(sub));
        if (found.size() > 1) {
            throw new ApiException(409, "GOOGLE_IN_USE", "Liên kết Google không hợp lệ.");
        }
        return found.stream().findFirst();
    }

    public String facebookKey(String subject) {
        return "facebook:" + googleKey(subject).substring("google:".length());
    }

    public Optional<Account> byFacebook(String subject) {
        var found = db.query(SELECT + " WHERE EXISTS (SELECT 1 FROM audit_log a"
                + " WHERE a.entity_affected='user' AND a.entity_id=u.user_id"
                + " AND a.action_type='FACEBOOK_LINK' AND a.new_value=?)", mapper, facebookKey(subject));
        if (found.size() > 1) throw new ApiException(409, "FACEBOOK_IN_USE", "Liên kết Facebook không hợp lệ.");
        return found.stream().findFirst();
    }

    public String facebookLink(int userId) {
        return db.queryForList("SELECT new_value FROM audit_log WHERE entity_affected='user'"
                        + " AND entity_id=? AND action_type='FACEBOOK_LINK' ORDER BY log_id DESC LIMIT 1",
                String.class, userId).stream().findFirst().orElse(null);
    }

    @Transactional
    public void linkFacebook(int userId, String subject) {
        lockIdentityRegistry();
        lock(userId);
        var other = byFacebook(subject);
        if (other.isPresent() && other.get().id() != userId)
            throw new ApiException(409, "FACEBOOK_IN_USE", "Facebook đã liên kết tài khoản khác.");
        var current = facebookLink(userId);
        var key = facebookKey(subject);
        if (current != null && !current.equals(key))
            throw new ApiException(409, "FACEBOOK_ALREADY_LINKED", "Tài khoản đã liên kết Facebook khác.");
        if (current == null) audit(userId, "FACEBOOK_LINK", userId, key);
    }

    public int countAdmin() {
        return db.queryForObject(
                "SELECT COUNT(*) FROM `user` u JOIN `role` r ON r.role_id=u.role_id"
                        + " WHERE r.role_name='ADMIN'",
                Integer.class);
    }

    @Transactional
    public Account create(String role, String name, String hash, String email, String phone,
                          String status, Integer creator, String subject, boolean emailVerified) {

        lockIdentityRegistry();

        final String normalizedEmail = ContactNormalizer.optionalEmail(email);
        String enteredPhone = ContactNormalizer.phoneInput(phone);

        if (normalizedEmail == null) {
            throw new ApiException(400, "EMAIL", "Email là bắt buộc.");
        }

        ensurePhoneAvailable(ContactNormalizer.phone(enteredPhone), null);

        if (byIdentifier(normalizedEmail).isPresent()) {
            throw new ApiException(409, "EMAIL_IN_USE", "Email đã được sử dụng.");
        }

        Integer roleId = db.queryForObject(
                "SELECT role_id FROM `role` WHERE role_name=?", Integer.class, role);

        var keys = new GeneratedKeyHolder();

        db.update(c -> {
            var s = c.prepareStatement(
                    "INSERT INTO `user`"
                            + "(role_id,full_name,password_hash,email,phone,"
                            + "account_status,email_verified_at)"
                            + " VALUES(?,?,?,?,?,?,?)",
                    new String[]{"user_id"});
            s.setInt(1, roleId);
            s.setString(2, name);
            s.setString(3, hash);
            s.setString(4, normalizedEmail);
            s.setString(5, enteredPhone);
            s.setString(6, status);
            s.setObject(7, emailVerified ? LocalDateTime.now(java.time.Clock.systemUTC()) : null);
            return s;
        }, keys);

        int id = Objects.requireNonNull(keys.getKey()).intValue();
        audit(creator, "ACCOUNT_CREATE", id, role);
        if (subject != null) {
            linkGoogle(id, subject);
        }
        return byId(id).orElseThrow();
    }

    public void verify(int id, String channel, boolean activate) {
        if (!"EMAIL".equals(channel)) {
            throw new ApiException(400, "CHANNEL", "THORS chỉ xác minh bằng email.");
        }
        db.update(
                "UPDATE `user` SET email_verified_at=CURRENT_TIMESTAMP"
                        + (activate ? ",account_status='ACTIVE'" : "")
                        + " WHERE user_id=?",
                id);
    }

    @Transactional
    public void password(int id, String hash, boolean pending) {
        lock(id);
        db.update(
                "UPDATE `user` SET password_hash=?"
                        + (pending ? ",account_status='PENDING_VERIFICATION'" : "")
                        + " WHERE user_id=?",
                hash, id);
        audit(null, "PASSWORD_INVALIDATE", id, "Existing sessions and reset grants revoked");
    }

    @Transactional
    public void linkGoogle(int id, String sub) {
        lockIdentityRegistry();
        var a = lock(id);
        String key = googleKey(sub);
        var existing = byGoogle(sub);
        if (existing.isPresent() && existing.get().id() != id) {
            throw new ApiException(409, "GOOGLE_IN_USE", "Google đã liên kết với tài khoản khác.");
        }
        if (a.googleSubject() != null && !a.googleSubject().equals(key)) {
            throw new ApiException(409, "GOOGLE_ALREADY_LINKED", "Tài khoản đã liên kết Google khác.");
        }
        if (a.googleSubject() == null) {
            audit(id, "GOOGLE_LINK", id, key);
        }
    }

    public void addPhone(int id, String phone) {
        phone = ContactNormalizer.phoneInput(phone);
        ensurePhoneAvailable(ContactNormalizer.phone(phone), id);
        db.update("UPDATE `user` SET phone=? WHERE user_id=?", phone, id);
    }

    /** Ghi đè các trường hồ sơ; người gọi truyền giá trị cuối cùng (đã chuẩn hóa) cho mọi trường. */
    public void updateProfile(int id, String name, String phone, String address, String avatarUrl) {
        ensurePhoneAvailable(phone, id);
        db.update("UPDATE `user` SET full_name=?,phone=?,address=?,avatar_url=? WHERE user_id=?",
                name, phone, address, avatarUrl, id);
    }

    public void name(int id, String name) {
        db.update("UPDATE `user` SET full_name=? WHERE user_id=?", name, id);
    }

    @Transactional
    public void status(int id, String status) {
        lock(id);
        db.update("UPDATE `user` SET account_status=? WHERE user_id=?", status, id);
        audit(null, "STATUS_INVALIDATE", id, status);
    }

    public List<Account> managed(Account actor) {
        return "ADMIN".equals(actor.role())
                ? db.query(SELECT + " ORDER BY u.user_id DESC", mapper)
                : db.query(
                SELECT
                        + " WHERE r.role_name IN ('STAFF','FAMILY_MEMBER')"
                        + " AND EXISTS (SELECT 1 FROM audit_log a"
                        + " WHERE a.entity_affected='user'"
                        + " AND a.entity_id=u.user_id"
                        + " AND a.action_type='ACCOUNT_CREATE'"
                        + " AND a.user_id=?)"
                        + " ORDER BY u.user_id DESC",
                mapper, actor.id());
    }

    /** Phạm vi nhìn thấy: ADMIN mọi tài khoản; OWNER chỉ STAFF/FAMILY_MEMBER do chính mình tạo. */
    private static void scope(Account actor, StringBuilder where, List<Object> args) {
        if ("ADMIN".equals(actor.role())) return;
        where.append(" AND r.role_name IN ('STAFF','FAMILY_MEMBER') AND EXISTS"
                + " (SELECT 1 FROM audit_log a WHERE a.entity_affected='user' AND a.entity_id=u.user_id"
                + " AND a.action_type='ACCOUNT_CREATE' AND a.user_id=?)");
        args.add(actor.id());
    }

    /** Đếm tài khoản trong phạm vi của actor, nhóm theo trạng thái và vai trò. */
    public com.thors.module.account.dto.AccountSummary summary(Account actor) {
        var where = new StringBuilder(" WHERE 1=1");
        List<Object> args = new ArrayList<>();
        scope(actor, where, args);
        Map<String, Long> byStatus = new LinkedHashMap<>();
        Map<String, Long> byRole = new LinkedHashMap<>();
        long[] total = {0};
        db.query("SELECT r.role_name, u.account_status, COUNT(*) AS n FROM `user` u"
                        + " JOIN `role` r ON r.role_id=u.role_id" + where + " GROUP BY r.role_name, u.account_status",
                rs -> {
                    long n = rs.getLong("n");
                    total[0] += n;
                    byStatus.merge(rs.getString("account_status"), n, Long::sum);
                    byRole.merge(rs.getString("role_name"), n, Long::sum);
                }, args.toArray());
        return new com.thors.module.account.dto.AccountSummary(total[0], byStatus, byRole);
    }

    public Page search(Account actor, String q, String role, String status, int page, int size) {
        var where = new StringBuilder(" WHERE 1=1");
        List<Object> args = new ArrayList<>();
        scope(actor, where, args);
        if (role != null) { where.append(" AND r.role_name=?"); args.add(role); }
        if (status != null) { where.append(" AND u.account_status=?"); args.add(status); }
        if (q != null) {
            String like = "%" + q.toLowerCase().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
            where.append(" AND (LOWER(u.full_name) LIKE ? OR LOWER(u.email) LIKE ? OR u.phone LIKE ?)");
            args.add(like); args.add(like); args.add(like);
        }
        Long total = db.queryForObject("SELECT COUNT(*) FROM `user` u JOIN `role` r ON r.role_id=u.role_id"
                + where, Long.class, args.toArray());
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(size);
        pageArgs.add((long) page * size);
        var items = db.query(SELECT + where + " ORDER BY u.user_id DESC LIMIT ? OFFSET ?",
                mapper, pageArgs.toArray());
        return new Page(items, total == null ? 0 : total);
    }

    // Yêu cầu đặt lại mật khẩu của Owner: dòng PASSWORD_RESET_REQUEST mới nhất chưa có thao tác đổi
    // hoặc đặt lại mật khẩu nào xảy ra sau nó.
    private static final String OPEN_RESET = """
      FROM audit_log req
      JOIN `user` u ON u.user_id = req.entity_id
      JOIN `role` r ON r.role_id = u.role_id
      WHERE req.action_type = 'PASSWORD_RESET_REQUEST' AND req.entity_affected = 'user'
        AND r.role_name = 'OWNER'
        AND req.log_id = (SELECT MAX(x.log_id) FROM audit_log x
            WHERE x.entity_affected = 'user' AND x.entity_id = req.entity_id
              AND x.action_type = 'PASSWORD_RESET_REQUEST')
        AND NOT EXISTS (SELECT 1 FROM audit_log c
            WHERE c.entity_affected = 'user' AND c.entity_id = req.entity_id
              AND c.log_id > req.log_id
              AND c.action_type IN ('PASSWORD_RESET_ADMIN','PASSWORD_RESET','PASSWORD_CHANGE'))
      """;

    public List<OpenResetRequest> openResetRequests() {
        return db.query("SELECT u.user_id, u.full_name, u.email, req.performed_at " + OPEN_RESET
                        + " ORDER BY req.log_id DESC",
                (rs, i) -> new OpenResetRequest(rs.getInt("user_id"), rs.getString("full_name"),
                        rs.getString("email"), time(rs, "performed_at")));
    }

    public boolean hasOpenResetRequest(int userId) {
        Integer n = db.queryForObject("SELECT COUNT(*) " + OPEN_RESET + " AND req.entity_id = ?",
                Integer.class, userId);
        return n != null && n > 0;
    }

    public void audit(Integer actor, String action, int target, String detail) {
        db.update(
                "INSERT INTO audit_log"
                        + "(user_id,action_type,entity_affected,entity_id,new_value,actor_type)"
                        + " VALUES(?,?,'user',?,?,?)",
                actor, action, target, detail, actor == null ? "SYSTEM" : "USER");
    }
}