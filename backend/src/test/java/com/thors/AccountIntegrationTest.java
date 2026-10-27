package com.thors;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository;
import com.thors.security.SessionUser;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Integration test cho feature Account: HTTP request -> controller -> security -> service -> SQL (H2).
 *
 * <p>Mã IT-xxx-nnn khớp với "Test Case ID" trong file báo cáo Integration Test (Report-5.2).
 * Các test có ghi "Suspected defect" được viết theo hành vi ĐÚNG mong đợi, nên dự kiến sẽ FAIL cho
 * tới khi lỗi được sửa.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(AuthIntegrationTest.TestDelivery.class)
class AccountIntegrationTest {
    static final String PASSWORD = "Strong-password-123";
    static final String NEW_PASSWORD = "New-Strong-pass-456";
    static String hash; // BCrypt (cost 12) chậm, chỉ tính một lần cho cả class

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired AccountRepository users;
    @Autowired JdbcTemplate db;
    @Autowired PasswordEncoder passwords;

    Account admin;
    Account owner;
    Account otherOwner;

    @BeforeEach
    void setUp() {
        if (hash == null) hash = passwords.encode(PASSWORD);
        db.update("DELETE FROM audit_log");
        db.update("DELETE FROM `user`");
        admin = make("ADMIN", "Admin One", "admin@example.com", null, "ACTIVE", null);
        owner = make("OWNER", "Owner One", "owner@example.com", null, "ACTIVE", null);
        otherOwner = make("OWNER", "Owner Two", "owner2@example.com", null, "ACTIVE", null);
    }

    // ------------------------------------------------------------------ fixtures

    /** Tạo tài khoản trực tiếp qua repository; creator = người tạo (ghi audit ACCOUNT_CREATE). */
    Account make(String role, String name, String email, String phone, String status, Integer creator) {
        return users.create(role, name, hash, email, phone, status, creator, null, true);
    }

    /** Session đã đăng nhập (dựng sẵn, không gọi /login để test nhanh hơn). */
    MockHttpSession sessionFor(Account a) {
        Account fresh = users.byId(a.id()).orElseThrow();
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken(
                SessionUser.from(fresh), null, List.of(new SimpleGrantedAuthority("ROLE_" + fresh.role()))));
        var session = new MockHttpSession();
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
        return session;
    }

    Map<String, Object> newMember(String email, String phone) {
        var m = new HashMap<String, Object>();
        m.put("role", "FAMILY_MEMBER");
        m.put("fullName", "Nguyen Van A");
        m.put("email", email);
        m.put("phone", phone);
        m.put("password", PASSWORD);
        m.put("confirmPassword", PASSWORD);
        return m;
    }

    /** Owner khóa/vô hiệu hóa qua API: tạo sẵn dữ liệu cho màn hình System Logs. */
    Account[] seedLogs() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        var f2 = make("FAMILY_MEMBER", "Family Two", "fam2@example.com", null, "ACTIVE", owner.id());
        assertEquals(200, status(doPatch("/api/accounts/" + f1.id() + "/status", Map.of("status", "DISABLED"), sessionFor(owner))));
        assertEquals(200, status(doPost("/api/accounts/" + f2.id() + "/lock", Map.of(), sessionFor(admin))));
        return new Account[] {f1, f2};
    }

    // ------------------------------------------------------------------ HTTP helpers

    MvcResult doGet(String url, MockHttpSession session, String... params) throws Exception {
        var req = get(url);
        for (int i = 0; i + 1 < params.length; i += 2) req.param(params[i], params[i + 1]);
        if (session != null) req.session(session);
        return mvc.perform(req).andReturn();
    }

    MvcResult doSend(String method, String url, Object payload, MockHttpSession session, boolean withCsrf) throws Exception {
        var req = "PATCH".equals(method) ? patch(url) : post(url);
        req.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(payload));
        if (session != null) req.session(session);
        if (withCsrf) req.with(csrf());
        return mvc.perform(req).andReturn();
    }

    MvcResult doPost(String url, Object payload, MockHttpSession session) throws Exception {
        return doSend("POST", url, payload, session, true);
    }

    MvcResult doPatch(String url, Object payload, MockHttpSession session) throws Exception {
        return doSend("PATCH", url, payload, session, true);
    }

    MvcResult doRaw(String method, String url, String raw, MockHttpSession session) throws Exception {
        var req = "PATCH".equals(method) ? patch(url) : post(url);
        req.contentType(MediaType.APPLICATION_JSON).content(raw).with(csrf());
        if (session != null) req.session(session);
        return mvc.perform(req).andReturn();
    }

    /** Đăng nhập thật qua /api/auth/login (session mới, chưa xác thực). */
    MvcResult loginAttempt(String email, String pw) throws Exception {
        return doSend("POST", "/api/auth/login", Map.of("identifier", email, "password", pw), new MockHttpSession(), true);
    }

    int status(MvcResult r) {
        return r.getResponse().getStatus();
    }

    JsonNode body(MvcResult r) throws Exception {
        return json.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    void expectError(MvcResult r, int expectedStatus, String expectedCode) throws Exception {
        assertEquals(expectedStatus, status(r), "HTTP status");
        assertEquals(expectedCode, body(r).path("code").asText(), "error code");
    }

    // ------------------------------------------------------------------ database / JSON helpers

    String dbStatus(int id) {
        return db.queryForObject("SELECT account_status FROM `user` WHERE user_id=?", String.class, id);
    }

    String dbName(int id) {
        return db.queryForObject("SELECT full_name FROM `user` WHERE user_id=?", String.class, id);
    }

    String dbPhone(int id) {
        return db.queryForObject("SELECT phone FROM `user` WHERE user_id=?", String.class, id);
    }

    String dbHash(int id) {
        return db.queryForObject("SELECT password_hash FROM `user` WHERE user_id=?", String.class, id);
    }

    int auditCount(String action, int entityId) {
        return db.queryForObject(
                "SELECT COUNT(*) FROM audit_log WHERE action_type=? AND entity_id=?", Integer.class, action, entityId);
    }

    int userCount() {
        return db.queryForObject("SELECT COUNT(*) FROM `user`", Integer.class);
    }

    Set<Integer> ids(JsonNode page) {
        var result = new HashSet<Integer>();
        page.get("items").forEach(i -> result.add(i.get("id").asInt()));
        return result;
    }

    List<String> actionsOf(JsonNode page) {
        var result = new ArrayList<String>();
        page.get("items").forEach(i -> result.add(i.get("action").asText()));
        return result;
    }

    JsonNode firstItem(JsonNode page, String action) {
        for (JsonNode i : page.get("items")) if (action.equals(i.get("action").asText())) return i;
        return null;
    }


    // ================================================================== Profile

    @Test
    @DisplayName("IT-PRF-001 - View the profile of the signed-in user")
    void viewOwnProfile() throws Exception {
        var r = doGet("/api/accounts/profile", sessionFor(owner));
        assertEquals(200, status(r));
        var b = body(r);
        assertEquals(owner.id(), b.get("id").asInt());
        assertEquals("OWNER", b.get("role").asText());
        assertEquals("Owner One", b.get("fullName").asText());
        assertEquals("owner@example.com", b.get("email").asText());
        assertEquals("ACTIVE", b.get("status").asText());
        assertTrue(b.get("passwordEnabled").asBoolean());
        assertFalse(b.has("passwordHash"));
    }

    @Test
    @DisplayName("IT-PRF-002 - Update full name and address")
    void updateNameAndAddress() throws Exception {
        var r = doPatch("/api/accounts/profile", Map.of("fullName", "Nguyen Van Owner", "address", "12 Hang Bai, Ha Noi"), sessionFor(owner));
        assertEquals(200, status(r));
        assertEquals("Nguyen Van Owner", body(r).get("fullName").asText());
        assertEquals("Nguyen Van Owner", dbName(owner.id()));
        assertEquals("12 Hang Bai, Ha Noi", db.queryForObject("SELECT address FROM `user` WHERE user_id=?", String.class, owner.id()));
        assertEquals(1, auditCount("PROFILE_UPDATE", owner.id()));
    }

    @Test
    @DisplayName("IT-PRF-003 - Reject an avatar URL that is not https")
    void rejectsNonHttpsAvatar() throws Exception {
        var r = doPatch("/api/accounts/profile", Map.of("fullName", "Changed Name", "avatarUrl", "http://cdn.test/a.png"), sessionFor(owner));
        expectError(r, 400, "AVATAR_URL");
        assertEquals("Owner One", dbName(owner.id()));
    }

    @Test
    @DisplayName("IT-PRF-004 - Reject a blank full name")
    void rejectsBlankName() throws Exception {
        var r = doPatch("/api/accounts/profile", Map.of("fullName", "   "), sessionFor(owner));
        expectError(r, 400, "VALIDATION");
        assertEquals("Owner One", dbName(owner.id()));
    }

    @Test
    @DisplayName("IT-PRF-005 - Reject a full name of 101 characters")
    void rejectsNameLongerThan100() throws Exception {
        var r = doPatch("/api/accounts/profile", Map.of("fullName", "a".repeat(101)), sessionFor(owner));
        expectError(r, 400, "VALIDATION");
        assertEquals("Owner One", dbName(owner.id()));
    }

    @Test
    @DisplayName("IT-PRF-006 - Add a phone number to an account that has none")
    void addPhone() throws Exception {
        var r = doPost("/api/accounts/profile/phone", Map.of("phone", "0912345678"), sessionFor(owner));
        assertEquals(200, status(r));
        assertEquals("0912345678", body(r).get("phone").asText());
        assertEquals("0912345678", dbPhone(owner.id()));
        assertEquals(1, auditCount("PHONE_ADDED", owner.id()));
    }

    @Test
    @DisplayName("IT-PRF-007 - A phone number cannot be added when the account already has one")
    void addPhoneTwiceIsRejected() throws Exception {
        var s = sessionFor(owner);
        assertEquals(200, status(doPost("/api/accounts/profile/phone", Map.of("phone", "0912345678"), s)));
        expectError(doPost("/api/accounts/profile/phone", Map.of("phone", "0987654321"), s), 400, "PHONE_EXISTS");
        assertEquals("0912345678", dbPhone(owner.id()));
    }

    @Test
    @DisplayName("IT-PRF-008 - Reject a phone number already used by another account (different format)")
    void phoneUsedByAnotherAccountIsRejected() throws Exception {
        make("FAMILY_MEMBER", "Family One", "fam1@example.com", "+84912345678", "ACTIVE", owner.id());
        expectError(doPost("/api/accounts/profile/phone", Map.of("phone", "0912345678"), sessionFor(owner)), 409, "PHONE_IN_USE");
        assertNull(dbPhone(owner.id()));
    }


    // ================================================================== Family Account Management

    @Test
    @DisplayName("IT-FAM-001 - Owner creates a Family Member account")
    void ownerCreatesFamilyMember() throws Exception {
        var r = doPost("/api/accounts", newMember("Family1@Example.com", "0912345678"), sessionFor(owner));
        assertEquals(200, status(r));
        var b = body(r);
        assertEquals("FAMILY_MEMBER", b.get("role").asText());
        assertEquals("Nguyen Van A", b.get("fullName").asText());
        assertEquals("family1@example.com", b.get("email").asText());
        assertEquals("PENDING_VERIFICATION", b.get("status").asText());
        assertFalse(b.get("emailVerified").asBoolean());
        int id = b.get("id").asInt();
        String stored = dbHash(id);
        assertTrue(stored.startsWith("$2"));
        assertNotEquals(PASSWORD, stored);
        assertEquals(owner.id(), db.queryForObject(
                "SELECT user_id FROM audit_log WHERE action_type='ACCOUNT_CREATE' AND entity_id=?", Integer.class, id));
    }

    @Test
    @DisplayName("IT-FAM-002 - A new account must activate first: login does not create a session")
    void newAccountIsPendingAndHasNoSession() throws Exception {
        assertEquals(200, status(doPost("/api/accounts", newMember("family1@example.com", null), sessionFor(owner))));
        var anon = new MockHttpSession();
        var login = doSend("POST", "/api/auth/login", Map.of("identifier", "family1@example.com", "password", PASSWORD), anon, true);
        assertEquals(200, status(login));
        assertTrue(body(login).get("verificationRequired").asBoolean());
        assertEquals(401, status(doGet("/api/accounts/profile", anon)));
    }

    @Test
    @DisplayName("IT-FAM-003 - Reject an email that is already used")
    void rejectsDuplicateEmail() throws Exception {
        make("FAMILY_MEMBER", "Existing", "family1@example.com", null, "ACTIVE", owner.id());
        expectError(doPost("/api/accounts", newMember("Family1@Example.com", null), sessionFor(owner)), 409, "EMAIL_IN_USE");
        assertEquals(1, db.queryForObject("SELECT COUNT(*) FROM `user` WHERE email='family1@example.com'", Integer.class));
    }

    @Test
    @DisplayName("IT-FAM-004 - Owner cannot create OWNER or ADMIN accounts")
    void ownerCannotCreatePrivilegedRoles() throws Exception {
        int before = userCount();
        for (String role : List.of("OWNER", "ADMIN")) {
            var payload = newMember(role.toLowerCase() + "x@example.com", null);
            payload.put("role", role);
            expectError(doPost("/api/accounts", payload, sessionFor(owner)), 403, "ROLE");
        }
        assertEquals(before, userCount());
    }

    @Test
    @DisplayName("IT-FAM-005 - Reject a malformed email")
    void rejectsInvalidEmail() throws Exception {
        int before = userCount();
        var payload = newMember("not-an-email", null);
        expectError(doPost("/api/accounts", payload, sessionFor(owner)), 400, "VALIDATION");
        assertEquals(before, userCount());
    }

    @Test
    @DisplayName("IT-FAM-006 - Reject when confirmPassword differs from password")
    void rejectsPasswordMismatch() throws Exception {
        int before = userCount();
        var payload = newMember("family1@example.com", null);
        payload.put("confirmPassword", "Different-password-1");
        expectError(doPost("/api/accounts", payload, sessionFor(owner)), 400, "PASSWORD_CONFIRM");
        assertEquals(before, userCount());
    }

    @Test
    @DisplayName("IT-FAM-007 - Reject a password shorter than 10 characters")
    void rejectsShortPassword() throws Exception {
        int before = userCount();
        var payload = newMember("family1@example.com", null);
        payload.put("password", "short");
        payload.put("confirmPassword", "short");
        expectError(doPost("/api/accounts", payload, sessionFor(owner)), 400, "PASSWORD");
        assertEquals(before, userCount());
    }

    @Test
    @DisplayName("IT-FAM-008 - Reject a phone number already used by another account")
    void rejectsPhoneAlreadyInUse() throws Exception {
        make("FAMILY_MEMBER", "Family One", "fam1@example.com", "+84912345678", "ACTIVE", owner.id());
        int before = userCount();
        expectError(doPost("/api/accounts", newMember("family2@example.com", "0912345678"), sessionFor(owner)), 409, "PHONE_IN_USE");
        assertEquals(before, userCount());
    }

    @Test
    @DisplayName("IT-FAM-009 - Owner sees only the members he created")
    void ownerListsOnlyOwnMembers() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        var f2 = make("FAMILY_MEMBER", "Family Two", "fam2@example.com", null, "ACTIVE", owner.id());
        make("FAMILY_MEMBER", "Family Three", "fam3@example.com", null, "ACTIVE", otherOwner.id());
        var r = doGet("/api/accounts", sessionFor(owner));
        assertEquals(200, status(r));
        assertEquals(2, body(r).get("total").asInt());
        assertEquals(Set.of(f1.id(), f2.id()), ids(body(r)));
    }

    @Test
    @DisplayName("IT-FAM-010 - Filter by status, search by text and paginate")
    void listFiltersSearchAndPaging() throws Exception {
        var alpha = make("FAMILY_MEMBER", "Alpha Member", "alpha@example.com", null, "ACTIVE", owner.id());
        var bravo = make("FAMILY_MEMBER", "Bravo Member", "bravo@example.com", null, "DISABLED", owner.id());
        make("FAMILY_MEMBER", "Charlie Member", "charlie@example.com", null, "ACTIVE", owner.id());
        var s = sessionFor(owner);
        var byStatus = body(doGet("/api/accounts", s, "status", "DISABLED"));
        assertEquals(1, byStatus.get("total").asInt());
        assertEquals(Set.of(bravo.id()), ids(byStatus));
        assertEquals(Set.of(alpha.id()), ids(body(doGet("/api/accounts", s, "q", "ALPHA"))));
        var page0 = body(doGet("/api/accounts", s, "size", "2", "page", "0"));
        assertEquals(3, page0.get("total").asInt());
        assertEquals(2, page0.get("totalPages").asInt());
        assertEquals(2, page0.get("items").size());
        assertEquals(Set.of(alpha.id()), ids(body(doGet("/api/accounts", s, "size", "2", "page", "1"))));
    }

    @Test
    @DisplayName("IT-FAM-011 - Reject invalid list parameters")
    void listRejectsInvalidParameters() throws Exception {
        var s = sessionFor(owner);
        expectError(doGet("/api/accounts", s, "size", "0"), 400, "PAGE_SIZE");
        expectError(doGet("/api/accounts", s, "page", "-1"), 400, "PAGE");
        expectError(doGet("/api/accounts", s, "role", "HACKER"), 400, "ROLE_FILTER");
        expectError(doGet("/api/accounts", s, "status", "DELETED"), 400, "STATUS_FILTER");
    }

    @Test
    @DisplayName("IT-FAM-012 - Owner views the detail of a member he created")
    void ownerViewsOwnMemberDetail() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        var r = doGet("/api/accounts/" + f1.id(), sessionFor(owner));
        assertEquals(200, status(r));
        var b = body(r);
        assertEquals(f1.id(), b.get("id").asInt());
        assertEquals("FAMILY_MEMBER", b.get("role").asText());
        assertEquals(owner.id(), b.get("createdById").asInt());
        assertEquals("Owner One", b.get("createdByName").asText());
    }

    @Test
    @DisplayName("IT-FAM-013 - Owner cannot view a member created by another Owner")
    void ownerCannotViewMemberOfAnotherOwner() throws Exception {
        var g1 = make("FAMILY_MEMBER", "Family Three", "fam3@example.com", null, "ACTIVE", otherOwner.id());
        expectError(doGet("/api/accounts/" + g1.id(), sessionFor(owner)), 403, "OWNERSHIP");
    }

    @Test
    @DisplayName("IT-FAM-014 - Unknown account id returns 404")
    void detailOfUnknownAccountIs404() throws Exception {
        expectError(doGet("/api/accounts/9999", sessionFor(owner)), 404, "ACCOUNT_NOT_FOUND");
    }

    @Test
    @DisplayName("IT-FAM-015 - Deactivating a member ends his session and blocks sign-in")
    void deactivateRevokesSessionAndBlocksLogin() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        var memberSession = sessionFor(f1);
        assertEquals(200, status(doGet("/api/accounts/profile", memberSession)));
        var r = doPatch("/api/accounts/" + f1.id() + "/status", Map.of("status", "DISABLED"), sessionFor(owner));
        assertEquals(200, status(r));
        assertEquals("DISABLED", body(r).get("status").asText());
        assertEquals("DISABLED", dbStatus(f1.id()));
        assertEquals(1, auditCount("ACCOUNT_DEACTIVATE", f1.id()));
        assertEquals(401, status(doGet("/api/accounts/profile", memberSession)));
        expectError(loginAttempt("fam1@example.com", PASSWORD), 403, "ACCOUNT_BLOCKED");
    }

    @Test
    @DisplayName("IT-FAM-016 - Re-activating a member lets him sign in again")
    void reactivateAllowsLogin() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "DISABLED", owner.id());
        var r = doPatch("/api/accounts/" + f1.id() + "/status", Map.of("status", "ACTIVE"), sessionFor(owner));
        assertEquals(200, status(r));
        assertEquals("ACTIVE", dbStatus(f1.id()));
        assertEquals(1, auditCount("ACCOUNT_ACTIVATE", f1.id()));
        var login = loginAttempt("fam1@example.com", PASSWORD);
        assertEquals(200, status(login));
        assertFalse(body(login).get("verificationRequired").asBoolean());
    }

    @Test
    @DisplayName("IT-FAM-017 - Owner cannot set the LOCKED status")
    void ownerCannotLockAccount() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        expectError(doPatch("/api/accounts/" + f1.id() + "/status", Map.of("status", "LOCKED"), sessionFor(owner)), 403, "LOCK_ADMIN_ONLY");
        assertEquals("ACTIVE", dbStatus(f1.id()));
    }

    @Test
    @DisplayName("IT-FAM-018 - A PENDING_VERIFICATION account cannot be activated by the Owner")
    void pendingAccountCannotBeActivated() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "PENDING_VERIFICATION", owner.id());
        expectError(doPatch("/api/accounts/" + f1.id() + "/status", Map.of("status", "ACTIVE"), sessionFor(owner)), 400, "ACCOUNT_UNVERIFIED");
        assertEquals("PENDING_VERIFICATION", dbStatus(f1.id()));
    }

    @Test
    @DisplayName("IT-FAM-019 - Reject an unknown status value")
    void rejectsUnknownStatus() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        expectError(doPatch("/api/accounts/" + f1.id() + "/status", Map.of("status", "DELETED"), sessionFor(owner)), 400, "STATUS");
        assertEquals("ACTIVE", dbStatus(f1.id()));
    }

    @Test
    @DisplayName("IT-FAM-020 - Owner renames a member")
    void ownerRenamesMember() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        var r = doPatch("/api/accounts/" + f1.id(), Map.of("fullName", "Renamed Member"), sessionFor(owner));
        assertEquals(200, status(r));
        assertEquals("Renamed Member", body(r).get("fullName").asText());
        assertEquals("Renamed Member", dbName(f1.id()));
        assertEquals(1, auditCount("ACCOUNT_EDIT", f1.id()));
    }

    @Test
    @DisplayName("IT-FAM-021 - Reject a blank name when editing")
    void editRejectsBlankName() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        expectError(doPatch("/api/accounts/" + f1.id(), Map.of("fullName", "  "), sessionFor(owner)), 400, "VALIDATION");
        assertEquals("Family One", dbName(f1.id()));
    }

    @Test
    @DisplayName("IT-FAM-022 - Owner cannot edit a member created by another Owner")
    void ownerCannotEditMemberOfAnotherOwner() throws Exception {
        var g1 = make("FAMILY_MEMBER", "Family Three", "fam3@example.com", null, "ACTIVE", otherOwner.id());
        expectError(doPatch("/api/accounts/" + g1.id(), Map.of("fullName", "Renamed"), sessionFor(owner)), 403, "OWNERSHIP");
        assertEquals("Family Three", dbName(g1.id()));
    }


    // ================================================================== Admin Account Management

    @Test
    @DisplayName("IT-ADM-001 - Admin lists every account and can filter by role")
    void adminListsAllAccounts() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        var g1 = make("FAMILY_MEMBER", "Family Three", "fam3@example.com", null, "ACTIVE", otherOwner.id());
        var s = sessionFor(admin);
        var all = body(doGet("/api/accounts", s));
        assertEquals(5, all.get("total").asInt());
        assertEquals(Set.of(admin.id(), owner.id(), otherOwner.id(), f1.id(), g1.id()), ids(all));
        assertEquals(Set.of(owner.id(), otherOwner.id()), ids(body(doGet("/api/accounts", s, "role", "OWNER"))));
    }

    @Test
    @DisplayName("IT-ADM-002 - Account summary is scoped by role of the caller")
    void summaryCountsByRoleAndStatus() throws Exception {
        make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        make("FAMILY_MEMBER", "Family Two", "fam2@example.com", null, "DISABLED", owner.id());
        make("FAMILY_MEMBER", "Family Three", "fam3@example.com", null, "ACTIVE", otherOwner.id());
        var forAdmin = body(doGet("/api/accounts/summary", sessionFor(admin)));
        assertEquals(6, forAdmin.get("total").asInt());
        assertEquals(3, forAdmin.get("byRole").get("FAMILY_MEMBER").asInt());
        assertEquals(2, forAdmin.get("byRole").get("OWNER").asInt());
        assertEquals(1, forAdmin.get("byRole").get("ADMIN").asInt());
        assertEquals(5, forAdmin.get("byStatus").get("ACTIVE").asInt());
        assertEquals(1, forAdmin.get("byStatus").get("DISABLED").asInt());
        var forOwner = body(doGet("/api/accounts/summary", sessionFor(owner)));
        assertEquals(2, forOwner.get("total").asInt());
        assertEquals(2, forOwner.get("byRole").get("FAMILY_MEMBER").asInt());
        assertEquals(1, forOwner.get("byStatus").get("DISABLED").asInt());
    }

    @Test
    @DisplayName("IT-ADM-003 - Admin locks an account: session revoked and sign-in blocked")
    void adminLocksAccount() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        var memberSession = sessionFor(f1);
        var r = doPost("/api/accounts/" + f1.id() + "/lock", Map.of(), sessionFor(admin));
        assertEquals(200, status(r));
        assertEquals("LOCKED", body(r).get("status").asText());
        assertEquals("LOCKED", dbStatus(f1.id()));
        assertEquals(1, auditCount("ACCOUNT_LOCK", f1.id()));
        assertEquals(401, status(doGet("/api/accounts/profile", memberSession)));
        expectError(loginAttempt("fam1@example.com", PASSWORD), 403, "ACCOUNT_BLOCKED");
    }

    @Test
    @DisplayName("IT-ADM-004 - Owner cannot change or unlock an account locked by the Admin")
    void ownerCannotUndoAdminLock() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "LOCKED", owner.id());
        var s = sessionFor(owner);
        expectError(doPatch("/api/accounts/" + f1.id() + "/status", Map.of("status", "ACTIVE"), s), 403, "LOCKED_BY_ADMIN");
        expectError(doPost("/api/accounts/" + f1.id() + "/unlock", Map.of(), s), 403, "ROLE");
        assertEquals("LOCKED", dbStatus(f1.id()));
    }

    @Test
    @DisplayName("IT-ADM-005 - Admin unlocks an account and the user can sign in again")
    void adminUnlocksAccount() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "LOCKED", owner.id());
        var r = doPost("/api/accounts/" + f1.id() + "/unlock", Map.of(), sessionFor(admin));
        assertEquals(200, status(r));
        assertEquals("ACTIVE", dbStatus(f1.id()));
        assertEquals(1, auditCount("ACCOUNT_UNLOCK", f1.id()));
        var login = loginAttempt("fam1@example.com", PASSWORD);
        assertEquals(200, status(login));
        assertFalse(body(login).get("verificationRequired").asBoolean());
    }

    @Test
    @DisplayName("IT-ADM-006 - Unlock is rejected for an account that is not locked")
    void unlockRejectsAccountThatIsNotLocked() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        expectError(doPost("/api/accounts/" + f1.id() + "/unlock", Map.of(), sessionFor(admin)), 400, "NOT_LOCKED");
        assertEquals("ACTIVE", dbStatus(f1.id()));
    }

    @Test
    @DisplayName("IT-ADM-007 - Admin cannot lock his own account")
    void adminCannotLockSelf() throws Exception {
        expectError(doPost("/api/accounts/" + admin.id() + "/lock", Map.of(), sessionFor(admin)), 400, "SELF_LOCK");
        assertEquals("ACTIVE", dbStatus(admin.id()));
    }

    @Test
    @DisplayName("IT-ADM-008 - Owner cannot call the lock endpoint")
    void ownerCannotUseLockEndpoint() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        expectError(doPost("/api/accounts/" + f1.id() + "/lock", Map.of(), sessionFor(owner)), 403, "ROLE");
        assertEquals("ACTIVE", dbStatus(f1.id()));
    }

    // Suspected defect DEF-02: expected to FAIL until fixed.
    @Test
    @DisplayName("IT-ADM-009 - A Shop Owner who forgot the password submits a reset request (no sign-in)")
    void ownerSubmitsResetRequest() throws Exception {
        var r = doSend("POST", "/api/auth/password-reset-requests", Map.of("identifier", "owner@example.com"), null, true);
        assertEquals(200, status(r));
        assertEquals(1, auditCount("PASSWORD_RESET_REQUEST", owner.id()));
    }

    // Suspected defect DEF-02: expected to FAIL until fixed.
    @Test
    @DisplayName("IT-ADM-010 - The reset request answers the same for known and unknown identifiers")
    void resetRequestDoesNotRevealAccounts() throws Exception {
        var known = doSend("POST", "/api/auth/password-reset-requests", Map.of("identifier", "owner@example.com"), null, true);
        var unknown = doSend("POST", "/api/auth/password-reset-requests", Map.of("identifier", "nobody@example.com"), null, true);
        assertEquals(200, status(known));
        assertEquals(200, status(unknown));
        assertEquals(body(known).get("message").asText(), body(unknown).get("message").asText());
        assertEquals(1, db.queryForObject("SELECT COUNT(*) FROM audit_log WHERE action_type='PASSWORD_RESET_REQUEST'", Integer.class));
    }

    @Test
    @DisplayName("IT-ADM-011 - Admin sees the open reset requests of Shop Owners")
    void adminSeesOpenResetRequests() throws Exception {
        users.audit(null, "PASSWORD_RESET_REQUEST", owner.id(), "Shop Owner submitted a password reset request");
        var r = doGet("/api/accounts/password-reset-requests", sessionFor(admin));
        assertEquals(200, status(r));
        var list = body(r);
        assertEquals(1, list.size());
        assertEquals(owner.id(), list.get(0).get("userId").asInt());
        assertEquals("owner@example.com", list.get(0).get("email").asText());
    }

    @Test
    @DisplayName("IT-ADM-012 - Owner cannot read the reset request list")
    void ownerCannotSeeResetRequests() throws Exception {
        expectError(doGet("/api/accounts/password-reset-requests", sessionFor(owner)), 403, "ROLE");
    }

    @Test
    @DisplayName("IT-ADM-013 - Admin resets the Owner password end to end")
    void adminResetsOwnerPassword() throws Exception {
        users.audit(null, "PASSWORD_RESET_REQUEST", owner.id(), "Shop Owner submitted a password reset request");
        var ownerSession = sessionFor(owner);
        String oldHash = dbHash(owner.id());
        var r = doPost("/api/accounts/" + owner.id() + "/reset-password",
                Map.of("password", NEW_PASSWORD, "confirmPassword", NEW_PASSWORD), sessionFor(admin));
        assertEquals(200, status(r));
        assertEquals("PENDING_VERIFICATION", dbStatus(owner.id()));
        assertNotEquals(oldHash, dbHash(owner.id()));
        assertEquals(1, auditCount("PASSWORD_RESET_ADMIN", owner.id()));
        assertEquals(401, status(doGet("/api/accounts/profile", ownerSession)));
        expectError(loginAttempt("owner@example.com", PASSWORD), 401, "CREDENTIALS");
        var fresh = loginAttempt("owner@example.com", NEW_PASSWORD);
        assertEquals(200, status(fresh));
        assertTrue(body(fresh).get("verificationRequired").asBoolean());
        assertEquals(0, body(doGet("/api/accounts/password-reset-requests", sessionFor(admin))).size());
    }

    @Test
    @DisplayName("IT-ADM-014 - Admin cannot reset an Owner password without an open request")
    void adminNeedsOpenRequestToReset() throws Exception {
        String oldHash = dbHash(owner.id());
        expectError(doPost("/api/accounts/" + owner.id() + "/reset-password",
                Map.of("password", NEW_PASSWORD, "confirmPassword", NEW_PASSWORD), sessionFor(admin)), 400, "NO_RESET_REQUEST");
        assertEquals(oldHash, dbHash(owner.id()));
    }

    @Test
    @DisplayName("IT-ADM-015 - Admin cannot reset a Family Member password")
    void adminCannotResetFamilyMember() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        String oldHash = dbHash(f1.id());
        expectError(doPost("/api/accounts/" + f1.id() + "/reset-password",
                Map.of("password", NEW_PASSWORD, "confirmPassword", NEW_PASSWORD), sessionFor(admin)), 403, "RESET_ROLE");
        assertEquals(oldHash, dbHash(f1.id()));
    }

    @Test
    @DisplayName("IT-ADM-016 - Owner resets the password of his Family Member")
    void ownerResetsMemberPassword() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        var memberSession = sessionFor(f1);
        var r = doPost("/api/accounts/" + f1.id() + "/reset-password",
                Map.of("password", NEW_PASSWORD, "confirmPassword", NEW_PASSWORD), sessionFor(owner));
        assertEquals(200, status(r));
        assertEquals("PENDING_VERIFICATION", dbStatus(f1.id()));
        assertEquals(1, auditCount("PASSWORD_RESET_ADMIN", f1.id()));
        assertEquals(401, status(doGet("/api/accounts/profile", memberSession)));
        var login = loginAttempt("fam1@example.com", NEW_PASSWORD);
        assertEquals(200, status(login));
        assertTrue(body(login).get("verificationRequired").asBoolean());
    }

    @Test
    @DisplayName("IT-ADM-017 - Reject when the confirmation differs")
    void resetRejectsPasswordMismatch() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        String oldHash = dbHash(f1.id());
        expectError(doPost("/api/accounts/" + f1.id() + "/reset-password",
                Map.of("password", NEW_PASSWORD, "confirmPassword", "Another-pass-789"), sessionFor(owner)), 400, "PASSWORD_CONFIRM");
        assertEquals(oldHash, dbHash(f1.id()));
    }


    // ================================================================== System Logs

    @Test
    @DisplayName("IT-LOG-001 - Logs show who did what to whom, and hide internal events")
    void adminViewsLogsOfAccountActivity() throws Exception {
        var seed = seedLogs();
        var r = doGet("/api/audit-logs", sessionFor(admin), "size", "100");
        assertEquals(200, status(r));
        var page = body(r);
        var actions = actionsOf(page);
        assertTrue(actions.containsAll(List.of("ACCOUNT_CREATE", "ACCOUNT_DEACTIVATE", "ACCOUNT_LOCK")));
        assertFalse(actions.contains("STATUS_INVALIDATE"));
        assertFalse(actions.contains("PASSWORD_INVALIDATE"));
        var lock = firstItem(page, "ACCOUNT_LOCK");
        assertNotNull(lock);
        assertEquals(admin.id(), lock.get("actorId").asInt());
        assertEquals("Admin One", lock.get("actorName").asText());
        assertEquals(seed[1].id(), lock.get("entityId").asInt());
        assertEquals("Family Two", lock.get("targetName").asText());
        assertEquals("FAMILY_MEMBER", lock.get("targetRole").asText());
        assertEquals("WARNING", lock.get("status").asText());
    }

    @Test
    @DisplayName("IT-LOG-002 - Filter logs by action type")
    void filterByAction() throws Exception {
        seedLogs();
        var page = body(doGet("/api/audit-logs", sessionFor(admin), "action", "ACCOUNT_LOCK"));
        assertEquals(1, page.get("total").asInt());
        assertEquals(List.of("ACCOUNT_LOCK"), actionsOf(page));
    }

    @Test
    @DisplayName("IT-LOG-003 - Filter logs by status WARNING, SUCCESS and FAILED")
    void filterByStatus() throws Exception {
        seedLogs();
        var s = sessionFor(admin);
        var warning = body(doGet("/api/audit-logs", s, "status", "WARNING", "size", "100"));
        assertEquals(2, warning.get("total").asInt());
        assertEquals(Set.of("ACCOUNT_DEACTIVATE", "ACCOUNT_LOCK"), new HashSet<>(actionsOf(warning)));
        var success = body(doGet("/api/audit-logs", s, "status", "SUCCESS", "size", "100"));
        assertFalse(actionsOf(success).contains("ACCOUNT_LOCK"));
        success.get("items").forEach(i -> assertEquals("SUCCESS", i.get("status").asText()));
        assertEquals(0, body(doGet("/api/audit-logs", s, "status", "FAILED")).get("total").asInt());
    }

    @Test
    @DisplayName("IT-LOG-004 - Filter logs by the affected account")
    void filterByTarget() throws Exception {
        var seed = seedLogs();
        var page = body(doGet("/api/audit-logs", sessionFor(admin), "targetId", String.valueOf(seed[1].id()), "size", "100"));
        page.get("items").forEach(i -> assertEquals(seed[1].id(), i.get("entityId").asInt()));
        assertTrue(actionsOf(page).containsAll(List.of("ACCOUNT_CREATE", "ACCOUNT_LOCK")));
    }

    @Test
    @DisplayName("IT-LOG-005 - Filter logs by the user who performed the action")
    void filterByActor() throws Exception {
        seedLogs();
        var page = body(doGet("/api/audit-logs", sessionFor(admin), "actorId", String.valueOf(owner.id()), "size", "100"));
        page.get("items").forEach(i -> assertEquals(owner.id(), i.get("actorId").asInt()));
        var actions = actionsOf(page);
        assertTrue(actions.containsAll(List.of("ACCOUNT_CREATE", "ACCOUNT_DEACTIVATE")));
        assertFalse(actions.contains("ACCOUNT_LOCK"));
    }

    @Test
    @DisplayName("IT-LOG-006 - Search logs by the name of the affected account (case-insensitive)")
    void searchByText() throws Exception {
        seedLogs();
        var page = body(doGet("/api/audit-logs", sessionFor(admin), "q", "family two", "size", "100"));
        assertTrue(page.get("total").asInt() >= 2);
        page.get("items").forEach(i -> assertEquals("Family Two", i.get("targetName").asText()));
    }

    @Test
    @DisplayName("IT-LOG-007 - Filter logs by date range")
    void filterByDateRange() throws Exception {
        seedLogs();
        var s = sessionFor(admin);
        String today = LocalDate.now(ZoneOffset.UTC).toString();
        String tomorrow = LocalDate.now(ZoneOffset.UTC).plusDays(1).toString();
        assertTrue(body(doGet("/api/audit-logs", s, "from", today, "to", today)).get("total").asInt() > 0);
        assertEquals(0, body(doGet("/api/audit-logs", s, "from", tomorrow)).get("total").asInt());
    }

    @Test
    @DisplayName("IT-LOG-008 - Reject invalid filter parameters")
    void rejectsInvalidParameters() throws Exception {
        var s = sessionFor(admin);
        expectError(doGet("/api/audit-logs", s, "from", "2026-10-12", "to", "2026-10-11"), 400, "DATE_RANGE");
        expectError(doGet("/api/audit-logs", s, "size", "101"), 400, "PAGE_SIZE");
        expectError(doGet("/api/audit-logs", s, "page", "-1"), 400, "PAGE");
        expectError(doGet("/api/audit-logs", s, "status", "UNKNOWN"), 400, "STATUS_FILTER");
        expectError(doGet("/api/audit-logs", s, "offset", "841"), 400, "OFFSET");
    }

    @Test
    @DisplayName("IT-LOG-009 - Pagination returns consistent totals and an empty page past the end")
    void paginatesResults() throws Exception {
        seedLogs();
        var s = sessionFor(admin);
        int total = body(doGet("/api/audit-logs", s, "size", "100")).get("total").asInt();
        var first = body(doGet("/api/audit-logs", s, "size", "2", "page", "0"));
        assertEquals(2, first.get("items").size());
        assertEquals(total, first.get("total").asInt());
        assertEquals((total + 1) / 2, first.get("totalPages").asInt());
        assertEquals(0, body(doGet("/api/audit-logs", s, "size", "2", "page", String.valueOf(total))).get("items").size());
    }

    @Test
    @DisplayName("IT-LOG-010 - Daily statistics count events, alerts and locks")
    void dailySummary() throws Exception {
        seedLogs();
        var s = body(doGet("/api/audit-logs/summary", sessionFor(admin), "offset", "0"));
        assertTrue(s.get("eventsToday").asLong() >= 7);
        assertTrue(s.get("securityAlertsToday").asLong() >= 2);
        assertEquals(1, s.get("locksToday").asLong());
    }

    @Test
    @DisplayName("IT-LOG-011 - The action list contains visible actions in alphabetical order and hides internal ones")
    void actionListForDropdown() throws Exception {
        seedLogs();
        var r = doGet("/api/audit-logs/actions", sessionFor(admin));
        assertEquals(200, status(r));
        List<String> list = new ArrayList<>();
        body(r).forEach(n -> list.add(n.asText()));
        assertTrue(list.containsAll(List.of("ACCOUNT_CREATE", "ACCOUNT_LOCK")));
        assertFalse(list.contains("STATUS_INVALIDATE"));
        assertEquals(list.stream().sorted().toList(), list);
    }

    @Test
    @DisplayName("IT-LOG-012 - Owner cannot read logs, statistics or the action list")
    void ownerCannotViewLogs() throws Exception {
        var s = sessionFor(owner);
        expectError(doGet("/api/audit-logs", s), 403, "ROLE");
        expectError(doGet("/api/audit-logs/summary", s), 403, "ROLE");
        expectError(doGet("/api/audit-logs/actions", s), 403, "ROLE");
    }

    // Suspected defect DEF-01: expected to FAIL until fixed.
    @Test
    @DisplayName("IT-LOG-013 - A wrong-password sign-in appears in the logs as FAILED and in the statistics")
    void failedSignInIsReportedAsFailed() throws Exception {
        make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        assertEquals(401, status(loginAttempt("fam1@example.com", "Wrong-password-999")));
        var s = sessionFor(admin);
        assertTrue(body(doGet("/api/audit-logs", s, "status", "FAILED")).get("total").asInt() >= 1,
                "a failed sign-in must be listed with status FAILED");
        assertEquals(1, body(doGet("/api/audit-logs/summary", s, "offset", "0")).get("failedSignInsToday").asLong());
    }


    // ================================================================== Security

    @Test
    @DisplayName("IT-SEC-001 - Unauthenticated requests cannot read account or log data")
    void unauthenticatedReadsAreRejected() throws Exception {
        for (String url : List.of("/api/accounts", "/api/accounts/profile", "/api/accounts/summary",
                "/api/accounts/password-reset-requests", "/api/accounts/" + owner.id(),
                "/api/audit-logs", "/api/audit-logs/summary", "/api/audit-logs/actions")) {
            expectError(doGet(url, null), 401, "UNAUTHENTICATED");
        }
    }

    @Test
    @DisplayName("IT-SEC-002 - Unauthenticated requests cannot change accounts")
    void unauthenticatedWritesAreRejected() throws Exception {
        var f1 = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        int before = userCount();
        String id = String.valueOf(f1.id());
        expectError(doSend("POST", "/api/accounts", newMember("x@example.com", null), null, true), 401, "UNAUTHENTICATED");
        expectError(doSend("PATCH", "/api/accounts/" + id, Map.of("fullName", "Hacked"), null, true), 401, "UNAUTHENTICATED");
        expectError(doSend("PATCH", "/api/accounts/" + id + "/status", Map.of("status", "DISABLED"), null, true), 401, "UNAUTHENTICATED");
        expectError(doSend("POST", "/api/accounts/" + id + "/lock", Map.of(), null, true), 401, "UNAUTHENTICATED");
        expectError(doSend("POST", "/api/accounts/" + id + "/reset-password",
                Map.of("password", NEW_PASSWORD, "confirmPassword", NEW_PASSWORD), null, true), 401, "UNAUTHENTICATED");
        assertEquals(before, userCount());
        assertEquals("Family One", dbName(f1.id()));
        assertEquals("ACTIVE", dbStatus(f1.id()));
    }

    @Test
    @DisplayName("IT-SEC-003 - A Family Member cannot read management or log endpoints")
    void familyMemberCannotReadManagementData() throws Exception {
        var s = sessionFor(make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id()));
        for (String url : List.of("/api/accounts", "/api/accounts/summary", "/api/accounts/password-reset-requests",
                "/api/accounts/" + owner.id(), "/api/audit-logs", "/api/audit-logs/summary", "/api/audit-logs/actions")) {
            expectError(doGet(url, s), 403, "ROLE");
        }
    }

    @Test
    @DisplayName("IT-SEC-004 - A Family Member cannot create, change, lock or reset accounts")
    void familyMemberCannotWrite() throws Exception {
        var me = make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        var other = make("FAMILY_MEMBER", "Family Two", "fam2@example.com", null, "ACTIVE", owner.id());
        var s = sessionFor(me);
        int before = userCount();
        String id = String.valueOf(other.id());
        expectError(doPost("/api/accounts", newMember("x@example.com", null), s), 403, "ROLE");
        expectError(doPatch("/api/accounts/" + id + "/status", Map.of("status", "DISABLED"), s), 403, "ROLE");
        expectError(doPost("/api/accounts/" + id + "/lock", Map.of(), s), 403, "ROLE");
        expectError(doPost("/api/accounts/" + id + "/reset-password",
                Map.of("password", NEW_PASSWORD, "confirmPassword", NEW_PASSWORD), s), 403, "ROLE");
        assertEquals(before, userCount());
        assertEquals("ACTIVE", dbStatus(other.id()));
    }

    @Test
    @DisplayName("IT-SEC-005 - State-changing request without a CSRF token is rejected")
    void writeWithoutCsrfTokenIsRejected() throws Exception {
        var s = sessionFor(owner);
        int before = userCount();
        assertEquals(403, status(doSend("POST", "/api/accounts", newMember("x@example.com", null), s, false)));
        assertEquals(403, status(doSend("PATCH", "/api/accounts/profile", Map.of("fullName", "Hacked"), s, false)));
        assertEquals(before, userCount());
        assertEquals("Owner One", dbName(owner.id()));
    }

    @Test
    @DisplayName("IT-SEC-006 - IDOR: an Owner cannot read or change a member of another Owner")
    void ownerCannotAccessAnotherOwnersMember() throws Exception {
        var g1 = make("FAMILY_MEMBER", "Family Three", "fam3@example.com", null, "ACTIVE", otherOwner.id());
        var s = sessionFor(owner);
        String id = String.valueOf(g1.id());
        String oldHash = dbHash(g1.id());
        expectError(doGet("/api/accounts/" + id, s), 403, "OWNERSHIP");
        expectError(doPatch("/api/accounts/" + id, Map.of("fullName", "Hijacked"), s), 403, "OWNERSHIP");
        expectError(doPatch("/api/accounts/" + id + "/status", Map.of("status", "DISABLED"), s), 403, "OWNERSHIP");
        expectError(doPost("/api/accounts/" + id + "/reset-password",
                Map.of("password", NEW_PASSWORD, "confirmPassword", NEW_PASSWORD), s), 403, "OWNERSHIP");
        assertEquals("Family Three", dbName(g1.id()));
        assertEquals("ACTIVE", dbStatus(g1.id()));
        assertEquals(oldHash, dbHash(g1.id()));
    }

    @Test
    @DisplayName("IT-SEC-007 - An Owner cannot read or change Admin, other Owners or himself through the management API")
    void ownerCannotManagePrivilegedAccounts() throws Exception {
        var s = sessionFor(owner);
        for (int id : List.of(admin.id(), otherOwner.id(), owner.id())) {
            expectError(doGet("/api/accounts/" + id, s), 403, "OWNERSHIP");
        }
        expectError(doPatch("/api/accounts/" + owner.id() + "/status", Map.of("status", "DISABLED"), s), 403, "OWNERSHIP");
        assertEquals("ACTIVE", dbStatus(owner.id()));
    }

    @Test
    @DisplayName("IT-SEC-008 - Password hashes and passwords never appear in API responses")
    void responsesNeverExposeSecrets() throws Exception {
        var s = sessionFor(admin);
        for (String url : List.of("/api/accounts", "/api/accounts/profile", "/api/accounts/" + owner.id(), "/api/audit-logs")) {
            String text = doGet(url, s, "size", "100").getResponse().getContentAsString(StandardCharsets.UTF_8);
            assertFalse(text.contains("passwordHash"), url);
            assertFalse(text.contains("password_hash"), url);
            assertFalse(text.contains("$2"), url);
            assertFalse(text.contains(PASSWORD), url);
        }
    }

    @Test
    @DisplayName("IT-SEC-009 - SQL injection and wildcard characters in the search text are treated as plain text")
    void searchTextIsNotInjectable() throws Exception {
        make("FAMILY_MEMBER", "Family One", "fam1@example.com", null, "ACTIVE", owner.id());
        int before = userCount();
        var s = sessionFor(owner);
        for (String q : List.of("' OR '1'='1", "'; DROP TABLE `user`; --", "%", "_")) {
            var r = doGet("/api/accounts", s, "q", q);
            assertEquals(200, status(r), q);
            assertEquals(0, body(r).get("total").asInt(), q);
        }
        assertEquals(before, userCount());
    }

    // Suspected defect DEF-03: expected to FAIL until fixed.
    @Test
    @DisplayName("IT-SEC-010 - Malformed input gives a 4xx error, not a server error")
    void malformedInputGivesClientError() throws Exception {
        var s = sessionFor(owner);
        var badId = doGet("/api/accounts/abc", s);
        assertEquals(400, status(badId));
        var badJson = doRaw("POST", "/api/accounts", "{not json", s);
        assertEquals(400, status(badJson));
    }

}