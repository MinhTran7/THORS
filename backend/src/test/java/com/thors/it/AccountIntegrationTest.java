package com.thors.it;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.thors.module.account.repository.AuditLogRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpMethod;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;

/**
 * Integration test tab "Account" của Report-5.2_Integration Test (IT-ACC-01 .. IT-ACC-19). Mỗi test tự tạo
 * tiền điều kiện của mình (không phụ thuộc thứ tự chạy); MySQL được thay bằng H2, Cloudinary / mail / OTP
 * là đồ giả (xem {@link IntegrationTestBase}).
 */
class AccountIntegrationTest extends IntegrationTestBase {

    int auditCount(String action, int target) {
        return count(
                "SELECT COUNT(*) FROM audit_log WHERE action_type=? AND entity_affected='user' AND entity_id=?",
                action,
                target);
    }

    List<String> auditValues(String action, int target) {
        return db.queryForList(
                "SELECT new_value FROM audit_log WHERE action_type=? AND entity_affected='user' AND entity_id=?"
                        + " ORDER BY log_id",
                String.class,
                action,
                target);
    }

    // ================================================================== Hồ sơ cá nhân

    @Test
    @DisplayName("IT-ACC-01: Xem hồ sơ trả đúng thông tin và tên người tạo")
    void viewProfileReturnsCreatorName() throws Exception {
        var owner = account("OWNER", "Chủ Shop Một", "owner1@example.com", null, null);
        var member = account("FAMILY_MEMBER", "Thành Viên Một", "member1@example.com", "0911111111", owner.id());
        db.update("UPDATE `user` SET address='45 Trần Phú' WHERE user_id=?", member.id());
        var session = login(member.email());

        var r = get("/api/accounts/profile", session);

        assertEquals(200, r.getStatus(), r.getContentAsString());
        var p = body(r);
        var row = db.queryForMap("SELECT * FROM `user` WHERE user_id=?", member.id());
        var dbAccount = users.byId(member.id()).orElseThrow();
        assertAll(
                () -> assertEquals(member.id(), p.get("id").asInt()),
                () -> assertEquals(row.get("full_name"), p.get("fullName").asText()),
                () -> assertEquals(row.get("phone"), p.get("phone").asText()),
                () -> assertEquals(row.get("address"), p.get("address").asText()),
                () -> assertEquals("FAMILY_MEMBER", p.get("role").asText()),
                () -> assertEquals("Chủ Shop Một", p.get("createdByName").asText()),
                () -> assertEquals(dbAccount.googleSubject() != null, p.get("googleLinked").asBoolean()),
                () -> assertEquals(!dbAccount.passwordHash().startsWith("!"), p.get("passwordEnabled").asBoolean()));
    }

    @Test
    @DisplayName("IT-ACC-02: Cập nhật hồ sơ lưu xuống DB, chuẩn hóa dữ liệu và ghi audit")
    void updateProfileNormalizesAndAudits() throws Exception {
        var customer = account("CUSTOMER", "Khách Cũ", "customer2@example.com", null, null);
        var session = login(customer.email());

        var r =
                sendJson(
                        patch("/api/accounts/profile"),
                        Map.of("fullName", "  Nguyễn Văn B ", "phone", "0912 345 678", "address", "12 Lê Lợi"),
                        session);
        assertEquals(200, r.getStatus(), r.getContentAsString());
        assertEquals("Nguyễn Văn B", body(r).get("fullName").asText());

        var p = body(get("/api/accounts/profile", session));
        assertEquals("Nguyễn Văn B", p.get("fullName").asText());
        assertEquals("0912345678", p.get("phone").asText());
        assertEquals("12 Lê Lợi", p.get("address").asText());

        var row = db.queryForMap("SELECT full_name, phone, address FROM `user` WHERE user_id=?", customer.id());
        assertEquals("Nguyễn Văn B", row.get("full_name"));
        assertEquals("0912345678", row.get("phone"));
        assertEquals("12 Lê Lợi", row.get("address"));
        assertEquals(1, auditCount("PROFILE_UPDATE", customer.id()));
    }

    @Test
    @DisplayName("IT-ACC-03: Không cho dùng số điện thoại đã thuộc tài khoản khác")
    void phoneOfAnotherAccountIsRejected() throws Exception {
        var a = account("CUSTOMER", "Khách A", "customer-a@example.com", "0901234567", null);
        account("CUSTOMER", "Khách B", "customer-b@example.com", "0987654321", null);
        var session = login(a.email());
        var before = db.queryForMap("SELECT full_name, phone, address FROM `user` WHERE user_id=?", a.id());
        int auditsBefore = count("SELECT COUNT(*) FROM audit_log");

        var r =
                sendJson(
                        patch("/api/accounts/profile"),
                        Map.of("fullName", "Khách A đổi tên", "phone", "0987654321", "address", "Địa chỉ mới"),
                        session);

        assertEquals(409, r.getStatus());
        assertEquals("PHONE_IN_USE", body(r).get("code").asText());
        assertEquals("Số điện thoại đã được sử dụng.", body(r).get("message").asText());
        assertEquals(before, db.queryForMap("SELECT full_name, phone, address FROM `user` WHERE user_id=?", a.id()));
        assertEquals(auditsBefore, count("SELECT COUNT(*) FROM audit_log"));
        assertEquals(0, auditCount("PROFILE_UPDATE", a.id()));
    }

    @Test
    @DisplayName("IT-ACC-04: Đổi ảnh đại diện: tải lên Cloudinary, lưu URL, xóa ảnh cũ")
    void replaceAvatarUploadsAndDeletesOld() throws Exception {
        var user = account("CUSTOMER", "Khách Ảnh", "avatar@example.com", null, null);
        String oldPublicId = "thors/avatars/u" + user.id() + "_old";
        db.update(
                "UPDATE `user` SET avatar_url=? WHERE user_id=?",
                "https://res.cloudinary.com/test-cloud/image/upload/v1/" + oldPublicId + ".png",
                user.id());
        var session = login(user.email());
        byte[] image = png(260); // ~200 KB
        assertTrue(image.length > 150_000 && image.length < 5 * 1024 * 1024, "PNG size " + image.length);

        var r =
                send(
                        multipart(HttpMethod.PUT, "/api/accounts/profile/avatar")
                                .file(new MockMultipartFile("file", "avatar.png", "image/png", image)),
                        session);

        assertEquals(200, r.getStatus(), r.getContentAsString());
        String url = body(r).get("avatarUrl").asText();
        assertTrue(
                url.matches("^https://res\\.cloudinary\\.com/.+/thors/avatars/u" + user.id() + "_.+"),
                "avatarUrl = " + url);
        assertEquals(url, string("SELECT avatar_url FROM `user` WHERE user_id=?", user.id()));
        assertEquals(url, body(get("/api/accounts/profile", session)).get("avatarUrl").asText());
        assertEquals(List.of("Avatar updated"), auditValues("PROFILE_UPDATE", user.id()));
        // Bước 3 (Cloudinary): ảnh mới được tải vào thors/avatars, ảnh cũ của user bị xóa
        verify(uploader).upload(any(), argThat(o -> "thors/avatars".equals(o.get("folder"))));
        verify(uploader).destroy(eq(oldPublicId), anyMap());
    }

    @Test
    @DisplayName("IT-ACC-05: Ảnh đại diện quá 5 MB bị từ chối, avatar giữ nguyên")
    void avatarOverFiveMegabytesRejected() throws Exception {
        var user = account("CUSTOMER", "Khách Ảnh Lớn", "big-avatar@example.com", null, null);
        String old = "https://res.cloudinary.com/test-cloud/image/upload/v1/thors/avatars/u" + user.id() + "_old.jpg";
        db.update("UPDATE `user` SET avatar_url=? WHERE user_id=?", old, user.id());
        var session = login(user.email());
        byte[] sixMb = new byte[6 * 1024 * 1024];
        sixMb[0] = (byte) 0xFF;
        sixMb[1] = (byte) 0xD8;

        var r =
                send(
                        multipart(HttpMethod.PUT, "/api/accounts/profile/avatar")
                                .file(new MockMultipartFile("file", "big.jpg", "image/jpeg", sixMb)),
                        session);

        assertEquals(400, r.getStatus());
        assertEquals("AVATAR_SIZE", body(r).get("code").asText());
        assertEquals("Ảnh đại diện tối đa 5 MB.", body(r).get("message").asText());
        verify(uploader, never()).upload(any(), anyMap());
        assertEquals(old, string("SELECT avatar_url FROM `user` WHERE user_id=?", user.id()));
    }

    @Test
    @DisplayName("IT-ACC-06: Gỡ ảnh đại diện: xóa URL trong DB và xóa ảnh trên Cloudinary")
    void removeAvatarClearsDbAndCloudinary() throws Exception {
        var user = account("CUSTOMER", "Khách Gỡ Ảnh", "remove-avatar@example.com", null, null);
        String publicId = "thors/avatars/u" + user.id() + "_abc123";
        db.update(
                "UPDATE `user` SET avatar_url=? WHERE user_id=?",
                "https://res.cloudinary.com/test-cloud/image/upload/v1/" + publicId + ".png",
                user.id());
        var session = login(user.email());

        var r = send(delete("/api/accounts/profile/avatar"), session);

        assertEquals(200, r.getStatus(), r.getContentAsString());
        assertTrue(body(r).get("avatarUrl").isNull());
        assertTrue(body(get("/api/accounts/profile", session)).get("avatarUrl").isNull());
        assertNull(string("SELECT avatar_url FROM `user` WHERE user_id=?", user.id()));
        verify(uploader).destroy(eq(publicId), anyMap());
        assertEquals(List.of("Avatar removed"), auditValues("PROFILE_UPDATE", user.id()));
    }

    // ================================================================== Quản lý tài khoản

    @Test
    @DisplayName("IT-ACC-07: Owner tạo tài khoản Family Member, hệ thống gửi mail và bắt đổi mật khẩu lần đầu")
    void ownerCreatesFamilyMember() throws Exception {
        var owner = account("OWNER", "Chủ Shop", "owner7@example.com", null, null);
        var session = login(owner.email());

        var r =
                sendJson(
                        post("/api/accounts"),
                        Map.of(
                                "role", "FAMILY_MEMBER",
                                "fullName", "Thành Viên Mới",
                                "email", "new.member@example.com",
                                "phone", "0933333333",
                                "password", "Issued-password-123",
                                "confirmPassword", "Issued-password-123"),
                        session);

        assertEquals(200, r.getStatus(), r.getContentAsString());
        assertTrue(body(r).get("mailSent").asBoolean());
        int id = body(r).get("id").asInt();
        var row = db.queryForMap("SELECT account_status, password_hash FROM `user` WHERE user_id=?", id);
        assertEquals("PENDING_VERIFICATION", row.get("account_status"));
        assertTrue(((String) row.get("password_hash")).matches("^\\$2[aby]\\$\\d{2}\\$.{53}$"), "BCrypt hash");
        assertTrue(passwords.matches("Issued-password-123", (String) row.get("password_hash")));
        // created_by: bảng user không có cột này, người tạo lưu ở audit ACCOUNT_CREATE
        assertEquals(owner.id(), users.byId(id).orElseThrow().createdBy());
        assertEquals(
                owner.id(),
                db.queryForObject(
                        "SELECT user_id FROM audit_log WHERE action_type='ACCOUNT_CREATE' AND entity_id=?",
                        Integer.class,
                        id));
        assertEquals(1, count("SELECT COUNT(*) FROM user_password_change_required WHERE user_id=?", id));
        var mail = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(mail.capture());
        assertArrayEquals(new String[] {"new.member@example.com"}, mail.getValue().getTo());
        assertTrue(mail.getValue().getText().contains("Issued-password-123"));
    }

    @Test
    @DisplayName("IT-ACC-08: Owner sửa tên và vô hiệu hóa tài khoản trong cùng một lần lưu")
    void ownerRenamesAndDisablesInOneSave() throws Exception {
        var owner = account("OWNER", "Chủ Shop", "owner8@example.com", null, null);
        var member = account("FAMILY_MEMBER", "Tên Cũ", "member8@example.com", null, owner.id());
        var sessionA = login(member.email());
        var ownerSession = login(owner.email());

        var r =
                sendJson(
                        patch("/api/accounts/" + member.id()),
                        Map.of("fullName", "Tên Mới", "status", "DISABLED"),
                        ownerSession);

        assertEquals(200, r.getStatus(), r.getContentAsString());
        var row = db.queryForMap("SELECT full_name, account_status FROM `user` WHERE user_id=?", member.id());
        assertEquals("Tên Mới", row.get("full_name"));
        assertEquals("DISABLED", row.get("account_status"));
        assertEquals(List.of("ACTIVE -> DISABLED"), auditValues("ACCOUNT_DEACTIVATE", member.id()));
        assertEquals(1, auditCount("ACCOUNT_EDIT", member.id()));
        assertEquals(401, get("/api/accounts/profile", sessionA).getStatus());
    }

    @Test
    @DisplayName("IT-ACC-09: Owner kích hoạt lại tài khoản đã vô hiệu hóa")
    void ownerReactivatesDisabledAccount() throws Exception {
        var owner = account("OWNER", "Chủ Shop", "owner9@example.com", null, null);
        var member = account("FAMILY_MEMBER", "Thành Viên", "member9@example.com", null, owner.id());
        users.status(member.id(), "DISABLED"); // tiền điều kiện: trạng thái sau IT-ACC-08
        var ownerSession = login(owner.email());

        var r = sendJson(patch("/api/accounts/" + member.id() + "/status"), Map.of("status", "ACTIVE"), ownerSession);

        assertEquals(200, r.getStatus(), r.getContentAsString());
        assertEquals("ACTIVE", string("SELECT account_status FROM `user` WHERE user_id=?", member.id()));
        assertEquals(List.of("DISABLED -> ACTIVE"), auditValues("ACCOUNT_ACTIVATE", member.id()));
        assertEquals(200, loginResponse(member.email(), PASSWORD, new MockHttpSession()).getStatus());
    }

    @Test
    @DisplayName("IT-ACC-10: Admin khóa Owner, phiên của Owner bị hủy ở request kế tiếp")
    void adminLocksOwnerAndSessionIsRevoked() throws Exception {
        var admin = account("ADMIN", "Quản Trị", "admin10@example.com", null, null);
        var owner = account("OWNER", "Chủ Shop", "owner10@example.com", null, admin.id());
        var sessionA = login(owner.email());
        var adminSession = login(admin.email());

        var r = send(post("/api/accounts/" + owner.id() + "/lock"), adminSession);

        assertEquals(200, r.getStatus(), r.getContentAsString());
        assertEquals("LOCKED", string("SELECT account_status FROM `user` WHERE user_id=?", owner.id()));
        assertEquals(List.of("ACTIVE -> LOCKED"), auditValues("ACCOUNT_LOCK", owner.id()));
        assertEquals(401, get("/api/accounts/profile", sessionA).getStatus());
        var again = loginResponse(owner.email(), PASSWORD, new MockHttpSession());
        assertNotEquals(200, again.getStatus());
        assertEquals("ACCOUNT_BLOCKED", body(again).get("code").asText());
    }

    @Test
    @DisplayName("IT-ACC-11: Admin mở khóa Owner")
    void adminUnlocksOwner() throws Exception {
        var admin = account("ADMIN", "Quản Trị", "admin11@example.com", null, null);
        var owner = account("OWNER", "Chủ Shop", "owner11@example.com", null, admin.id());
        users.status(owner.id(), "LOCKED"); // tiền điều kiện: trạng thái sau IT-ACC-10
        var adminSession = login(admin.email());

        var r = send(post("/api/accounts/" + owner.id() + "/unlock"), adminSession);

        assertEquals(200, r.getStatus(), r.getContentAsString());
        assertEquals("ACTIVE", string("SELECT account_status FROM `user` WHERE user_id=?", owner.id()));
        assertEquals(List.of("LOCKED -> ACTIVE"), auditValues("ACCOUNT_UNLOCK", owner.id()));
        assertEquals(200, loginResponse(owner.email(), PASSWORD, new MockHttpSession()).getStatus());
        var second = send(post("/api/accounts/" + owner.id() + "/unlock"), adminSession);
        assertEquals(400, second.getStatus());
        assertEquals("NOT_LOCKED", body(second).get("code").asText());
    }

    // ================================================================== Đặt lại và đổi mật khẩu

    @Test
    @DisplayName("IT-ACC-12: Owner gửi yêu cầu đặt lại mật khẩu, mọi Admin nhận thông báo")
    void ownerResetRequestNotifiesEveryAdmin() throws Exception {
        var admin = account("ADMIN", "Quản Trị Một", "admin12a@example.com", null, null);
        var admin2 = account("ADMIN", "Quản Trị Hai", "admin12b@example.com", null, null);
        var owner = account("OWNER", "Chủ Shop Quên", "owner12@example.com", null, admin.id());

        var first = sendJson(post("/api/auth/password-reset-requests"), Map.of("identifier", owner.email()), null);
        var second = sendJson(post("/api/auth/password-reset-requests"), Map.of("identifier", owner.email()), null);
        var missing =
                sendJson(post("/api/auth/password-reset-requests"), Map.of("identifier", "nobody@example.com"), null);

        assertEquals(200, first.getStatus(), first.getContentAsString());
        assertEquals(200, second.getStatus());
        assertEquals(body(first).get("message"), body(second).get("message"));
        // không tiết lộ tài khoản có tồn tại hay không
        assertEquals(missing.getStatus(), first.getStatus());
        assertEquals(body(missing), body(first));
        assertEquals(1, auditCount("PASSWORD_RESET_REQUEST", owner.id()));

        var adminSession = login(admin.email());
        var notices = get("/api/notifications", adminSession);
        assertEquals(200, notices.getStatus());
        boolean found = false;
        for (JsonNode n : body(notices).get("items"))
            found |= "PASSWORD_RESET_REQUEST".equals(n.get("type").asText())
                    && "Yêu cầu đặt lại mật khẩu".equals(n.get("title").asText());
        assertTrue(found, "Admin chưa có thông báo PASSWORD_RESET_REQUEST");
        assertTrue(notificationTitles(admin2.id()).contains("Yêu cầu đặt lại mật khẩu"), "Admin thứ hai chưa nhận");

        var requests = get("/api/accounts/password-reset-requests", adminSession);
        assertEquals(200, requests.getStatus());
        List<Integer> ids = new ArrayList<>();
        body(requests).forEach(n -> ids.add(n.get("userId").asInt()));
        assertTrue(ids.contains(owner.id()), "Owner không có trong danh sách yêu cầu: " + ids);
    }

    @Test
    @DisplayName("IT-ACC-13: Admin đặt lại mật khẩu cho Owner đã gửi yêu cầu")
    void adminResetsPasswordOfRequestingOwner() throws Exception {
        var admin = account("ADMIN", "Quản Trị", "admin13@example.com", null, null);
        var owner = account("OWNER", "Chủ Shop", "owner13@example.com", null, admin.id());
        var other = account("OWNER", "Chủ Shop Khác", "owner13b@example.com", null, admin.id());
        // tiền điều kiện (IT-ACC-12): Owner đã gửi yêu cầu
        assertEquals(
                200,
                sendJson(post("/api/auth/password-reset-requests"), Map.of("identifier", owner.email()), null)
                        .getStatus());
        var ownerSession = login(owner.email());
        String oldHash = string("SELECT password_hash FROM `user` WHERE user_id=?", owner.id());
        var adminSession = login(admin.email());
        var newPassword = Map.of("password", "New-password-123", "confirmPassword", "New-password-123");

        var r = sendJson(post("/api/accounts/" + owner.id() + "/reset-password"), newPassword, adminSession);

        assertEquals(200, r.getStatus(), r.getContentAsString());
        assertEquals("PENDING_VERIFICATION", string("SELECT account_status FROM `user` WHERE user_id=?", owner.id()));
        assertNotEquals(oldHash, string("SELECT password_hash FROM `user` WHERE user_id=?", owner.id()));
        assertEquals(401, get("/api/auth/me", ownerSession).getStatus());
        assertEquals(1, auditCount("PASSWORD_RESET_ADMIN", owner.id()));
        assertEquals(
                1,
                count(
                        "SELECT COUNT(*) FROM user_notification un JOIN notification n ON n.notification_id=un.notification_id"
                                + " WHERE un.user_id=? AND n.type='ACCOUNT_SECURITY' AND n.title='Mật khẩu đã được đặt lại'",
                        owner.id()));

        var step3 = sendJson(post("/api/accounts/" + other.id() + "/reset-password"), newPassword, adminSession);
        assertEquals(400, step3.getStatus());
        assertEquals("NO_RESET_REQUEST", body(step3).get("code").asText());
    }

    @Test
    @DisplayName("IT-ACC-14: Tài khoản mới bị bắt đổi mật khẩu ở lần đăng nhập đầu tiên")
    void newAccountMustChangePasswordOnFirstLogin() throws Exception {
        // tiền điều kiện (IT-ACC-07): Owner tạo tài khoản với mật khẩu cấp sẵn
        var owner = account("OWNER", "Chủ Shop", "owner14@example.com", null, null);
        String issued = "Issued-password-123";
        String mine = "My-own-password-456";
        var created =
                sendJson(
                        post("/api/accounts"),
                        Map.of(
                                "role", "FAMILY_MEMBER", "fullName", "Thành Viên Mới", "email", "first14@example.com",
                                "password", issued, "confirmPassword", issued),
                        login(owner.email()));
        assertEquals(200, created.getStatus(), created.getContentAsString());
        int id = body(created).get("id").asInt();

        // Bước 1: đăng nhập bằng mật khẩu Owner cấp. Tài khoản mới ở PENDING_VERIFICATION nên giao diện bắt
        // xác minh OTP trước (đã giả lập mail OTP), rồi đăng nhập lại.
        var session = new MockHttpSession();
        var pending = loginResponse("first14@example.com", issued, session);
        if (body(pending).path("verificationRequired").asBoolean(false)) {
            assertEquals(
                    200,
                    sendJson(post("/api/auth/activation"), Map.of("identifier", "first14@example.com", "password", issued), session)
                            .getStatus());
            assertEquals(
                    200,
                    sendJson(post("/api/auth/otp/verify"), Map.of("code", otpSender.codes.get("first14@example.com")), session)
                            .getStatus());
        }
        var step1 = loginResponse("first14@example.com", issued, session);
        assertEquals(200, step1.getStatus(), step1.getContentAsString());
        assertTrue(body(step1).get("passwordChangeRequired").asBoolean());

        // Bước 2: đổi mật khẩu
        var step2 =
                sendJson(
                        post("/api/auth/change-password"),
                        Map.of("currentPassword", issued, "password", mine, "confirmPassword", mine),
                        session);
        assertEquals(200, step2.getStatus(), step2.getContentAsString());
        assertEquals(0, count("SELECT COUNT(*) FROM user_password_change_required WHERE user_id=?", id));
        assertEquals(401, get("/api/auth/me", session).getStatus(), "phiên phải bị xóa");
        assertEquals(
                1,
                count(
                        "SELECT COUNT(*) FROM user_notification un JOIN notification n ON n.notification_id=un.notification_id"
                                + " WHERE un.user_id=? AND n.type='ACCOUNT_SECURITY'",
                        id));

        // Bước 3: đăng nhập bằng mật khẩu mới
        var step3 = loginResponse("first14@example.com", mine, new MockHttpSession());
        assertEquals(200, step3.getStatus(), step3.getContentAsString());
        assertFalse(body(step3).get("passwordChangeRequired").asBoolean());
    }

    @Test
    @DisplayName("IT-ACC-15: Đổi mật khẩu lần đầu với mật khẩu hiện tại sai")
    void firstPasswordChangeWithWrongCurrentPassword() throws Exception {
        var owner = account("OWNER", "Chủ Shop", "owner15@example.com", null, null);
        var member = account("FAMILY_MEMBER", "Thành Viên", "member15@example.com", null, owner.id());
        db.update("INSERT INTO user_password_change_required(user_id) VALUES(?)", member.id());
        var session = new MockHttpSession();
        var logged = loginResponse(member.email(), PASSWORD, session);
        assertTrue(body(logged).get("passwordChangeRequired").asBoolean());
        String hash = string("SELECT password_hash FROM `user` WHERE user_id=?", member.id());

        var r =
                sendJson(
                        post("/api/auth/change-password"),
                        Map.of(
                                "currentPassword", "Wrong-password-000",
                                "password", "My-own-password-456",
                                "confirmPassword", "My-own-password-456"),
                        session);

        assertEquals(400, r.getStatus());
        assertEquals(hash, string("SELECT password_hash FROM `user` WHERE user_id=?", member.id()));
        assertEquals(1, count("SELECT COUNT(*) FROM user_password_change_required WHERE user_id=?", member.id()));
        var me = get("/api/auth/me", session);
        assertEquals(200, me.getStatus(), "phiên phải còn");
        assertTrue(body(me).get("passwordChangeRequired").asBoolean(), "vẫn ở trang Đổi mật khẩu");
    }

    // ================================================================== Danh sách tài khoản, nhật ký

    @Test
    @DisplayName("IT-ACC-16: Owner chỉ thấy tài khoản do mình tạo, Admin thấy tất cả")
    void ownerSeesOnlyOwnAccountsAdminSeesAll() throws Exception {
        var admin = account("ADMIN", "Quản Trị", "admin16@example.com", null, null);
        var ownerA = account("OWNER", "Chủ A", "owner16a@example.com", null, admin.id());
        var ownerB = account("OWNER", "Chủ B", "owner16b@example.com", null, admin.id());
        var lockedOwner = account("OWNER", "Chủ Khóa", "owner16c@example.com", null, admin.id());
        users.status(lockedOwner.id(), "LOCKED");
        var a1 = account("FAMILY_MEMBER", "TV A1", "a1@example.com", null, ownerA.id());
        var a2 = account("FAMILY_MEMBER", "TV A2", "a2@example.com", null, ownerA.id());
        account("FAMILY_MEMBER", "TV B1", "b1@example.com", null, ownerB.id());
        account("CUSTOMER", "Khách", "customer16@example.com", null, null);

        var ownerSession = login(ownerA.email());
        var summary = body(get("/api/accounts/summary", ownerSession));
        assertEquals(2, summary.get("total").asLong());
        assertEquals(Set.of("FAMILY_MEMBER"), fieldNames(summary.get("byRole")));
        assertEquals(2, summary.get("byRole").get("FAMILY_MEMBER").asLong());
        var list = body(get("/api/accounts", ownerSession));
        assertEquals(Set.of(a1.id(), a2.id()), ids(list.get("items")));
        assertEquals(2, list.get("total").asLong());

        var adminSession = login(admin.email());
        int activeOwners =
                count(
                        "SELECT COUNT(*) FROM `user` u JOIN `role` r ON r.role_id=u.role_id"
                                + " WHERE r.role_name='OWNER' AND u.account_status='ACTIVE'");
        var page = body(get("/api/accounts?role=OWNER&status=ACTIVE&page=0&size=1", adminSession));
        assertEquals(activeOwners, page.get("total").asLong());
        assertEquals(activeOwners, page.get("totalPages").asInt()); // size=1
        assertEquals(1, page.get("items").size());
        var all = body(get("/api/accounts?role=OWNER&status=ACTIVE&page=0&size=20", adminSession));
        assertEquals(Set.of(ownerA.id(), ownerB.id()), ids(all.get("items")));
        for (JsonNode n : all.get("items")) {
            assertEquals("OWNER", n.get("role").asText());
            assertEquals("ACTIVE", n.get("status").asText());
        }
    }

    @Test
    @DisplayName("IT-ACC-17: Owner không xem được chi tiết thành viên của Owner khác")
    void ownerCannotViewOtherOwnersMember() throws Exception {
        var ownerA = account("OWNER", "Chủ A", "owner17a@example.com", null, null);
        var ownerB = account("OWNER", "Chủ B", "owner17b@example.com", null, null);
        var memberA = account("FAMILY_MEMBER", "TV A", "member17a@example.com", null, ownerA.id());
        var memberB = account("FAMILY_MEMBER", "TV B", "member17b@example.com", null, ownerB.id());
        var session = login(ownerA.email());

        var other = get("/api/accounts/" + memberB.id(), session);
        assertEquals(403, other.getStatus());
        assertEquals("OWNERSHIP", body(other).get("code").asText());

        var mine = get("/api/accounts/" + memberA.id(), session);
        assertEquals(200, mine.getStatus(), mine.getContentAsString());
        assertEquals("Chủ A", body(mine).get("createdByName").asText());
    }

    @Test
    @DisplayName("IT-ACC-18: Admin xem thống kê và lọc nhật ký hệ thống theo ngày và hành động")
    void adminSystemLogSummaryAndFilter() throws Exception {
        var admin = account("ADMIN", "Quản Trị", "admin18@example.com", null, null);
        var owner = account("OWNER", "Chủ Shop", "owner18@example.com", null, admin.id());
        var adminSession = login(admin.email());
        // tiền điều kiện (IT-ACC-10): Admin khóa Owner; thêm một lần đăng nhập sai để có bản ghi thất bại
        assertEquals(200, send(post("/api/accounts/" + owner.id() + "/lock"), adminSession).getStatus());
        assertEquals(401, loginResponse(admin.email(), "Wrong-password-000", new MockHttpSession()).getStatus());

        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        var summary = get("/api/audit-logs/summary?from=" + today + "&to=" + today, adminSession);
        assertEquals(200, summary.getStatus(), summary.getContentAsString());
        var s = body(summary);
        LocalDateTime start = today.atStartOfDay();
        LocalDateTime end = today.plusDays(1).atStartOfDay();
        String hidden = String.join(",", AuditLogRepository.HIDDEN.stream().map(a -> "'" + a + "'").toList());
        String inDay = " FROM audit_log WHERE action_type NOT IN (" + hidden + ") AND performed_at >= ? AND performed_at < ?";
        int events = count("SELECT COUNT(*)" + inDay, start, end);
        int failed = count("SELECT COUNT(*)" + inDay + " AND action_type IN ('LOGIN_FAILED','LOGIN_FAILURE','LOGIN_LOCK')", start, end);
        int wrong = count("SELECT COUNT(*)" + inDay + " AND action_type IN ('LOGIN_FAILED','LOGIN_FAILURE')", start, end);
        int paused = count("SELECT COUNT(*)" + inDay + " AND action_type='LOGIN_LOCK'", start, end);
        assertAll(
                () -> assertEquals(events, s.get("events").asLong()),
                () -> assertEquals(events - failed, s.get("successful").asLong()),
                () -> assertEquals(failed, s.get("failed").asLong()),
                () -> assertEquals(wrong, s.get("failedSignIns").asLong()),
                () -> assertEquals(paused, s.get("pausedSignIns").asLong()));

        var r = get("/api/audit-logs?action=ACCOUNT_LOCK&page=0&size=20", adminSession);
        assertEquals(200, r.getStatus(), r.getContentAsString());
        var items = body(r).get("items");
        assertTrue(items.size() >= 1);
        boolean lockOfOwner = false;
        for (JsonNode n : items) {
            assertEquals("ACCOUNT_LOCK", n.get("action").asText());
            lockOfOwner |= n.get("entityId").asInt() == owner.id();
        }
        assertTrue(lockOfOwner, "thiếu bản ghi khóa Owner");
        for (JsonNode n : items) {
            assertFalse(n.path("status").isNull() || n.path("status").isMissingNode(), "dòng thiếu trạng thái: " + n);
            assertFalse(n.path("ip").isNull() || n.path("ip").isMissingNode(), "dòng thiếu IP: " + n);
        }
    }

    @Test
    @DisplayName("IT-ACC-19: Owner không được xem nhật ký hệ thống")
    void ownerCannotReadSystemLog() throws Exception {
        var owner = account("OWNER", "Chủ Shop", "owner19@example.com", null, null);

        var r = get("/api/audit-logs", login(owner.email()));

        assertEquals(403, r.getStatus());
        assertEquals("ROLE", body(r).get("code").asText());
    }

    // ------------------------------------------------------------------

    static Set<String> fieldNames(JsonNode n) {
        Set<String> out = new HashSet<>();
        n.fieldNames().forEachRemaining(out::add);
        return out;
    }

    static Set<Integer> ids(JsonNode items) {
        Set<Integer> out = new HashSet<>();
        items.forEach(n -> out.add(n.get("id").asInt()));
        return out;
    }
}
