package com.thors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.thors.common.ApiException;
import com.thors.module.account.dto.AccountDetail;
import com.thors.module.account.dto.AccountPage;
import com.thors.module.account.dto.AccountRequests.*;
import com.thors.module.account.dto.AccountSummary;
import com.thors.module.account.dto.AccountView;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.account.service.AccountService;
import com.thors.module.auth.repository.OtpRepository;
import com.thors.module.notification.service.NotificationPublisher;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Unit test cho {@link AccountService} (module account).
 *
 * <p>Không dùng Spring context hay database: AccountRepository, OtpRepository và PasswordEncoder
 * đều được mock bằng Mockito. Mã UTCxxx khớp với cột "Test Case ID" trong file báo cáo Unit Test.
 */
class AccountUnitTest {
    private static final LocalDateTime T = LocalDateTime.of(2026, 1, 1, 8, 0);

    AccountRepository users;
    OtpRepository codes;
    PasswordEncoder passwords;
    AccountService service;
    NotificationPublisher notifications;

    // Người dùng mẫu (mỗi test có bản mới vì JUnit tạo một instance cho mỗi test).
    final Account admin = acc(1, "ADMIN", "ACTIVE", null);
    final Account owner = acc(10, "OWNER", "ACTIVE", null);
    final Account otherOwner = acc(11, "OWNER", "ACTIVE", null);
    final Account family = acc(30, "FAMILY_MEMBER", "ACTIVE", 10);

    @BeforeEach
    void setUp() {
        users = mock(AccountRepository.class);
        codes = mock(OtpRepository.class);
        passwords = mock(PasswordEncoder.class);
        notifications = mock(NotificationPublisher.class);
        when(passwords.encode(anyString())).thenReturn("ENC");
        service = new AccountService(users, codes, passwords, notifications);
    }

    // ------------------------------------------------------------------ helpers

    private static Account acc(int id, String role, String status, Integer createdBy) {
        return new Account(id, role, "User " + id, "hash", "u" + id + "@mail.com", "+849000000" + id,
                "Old address", "https://old.test/avatar.png", status, T, T, null, 0L, createdBy);
    }

    private static Account withPhone(Account a, String phone) {
        return new Account(a.id(), a.role(), a.fullName(), a.passwordHash(), a.email(), phone, a.address(),
                a.avatarUrl(), a.status(), a.createdAt(), a.emailVerifiedAt(), a.googleSubject(),
                a.authVersion(), a.createdBy());
    }

    private static Account withHash(Account a, String hash) {
        return new Account(a.id(), a.role(), a.fullName(), hash, a.email(), a.phone(), a.address(),
                a.avatarUrl(), a.status(), a.createdAt(), a.emailVerifiedAt(), a.googleSubject(),
                a.authVersion(), a.createdBy());
    }

    private static Account withGoogle(Account a, String subject) {
        return new Account(a.id(), a.role(), a.fullName(), a.passwordHash(), a.email(), a.phone(), a.address(),
                a.avatarUrl(), a.status(), a.createdAt(), a.emailVerifiedAt(), subject,
                a.authVersion(), a.createdBy());
    }

    /** Repository trả về tài khoản này cho users.lock(id) và users.byId(id). */
    private void stub(Account a) {
        when(users.lock(a.id())).thenReturn(a);
        when(users.byId(a.id())).thenReturn(Optional.of(a));
    }

    private void stubSearch(long total, Account... items) {
        when(users.search(any(), any(), any(), any(), anyInt(), anyInt()))
                .thenReturn(new AccountRepository.Page(List.of(items), total));
    }

    private void stubCreate(Account created) {
        when(users.create(any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean()))
                .thenReturn(created);
    }

    private ApiException fail(int status, String code, Executable call) {
        ApiException ex = assertThrows(ApiException.class, call);
        assertEquals(status, ex.status);
        assertEquals(code, ex.code);
        return ex;
    }

    private void verifyNoStatusWrite() {
        verify(users, never()).status(anyInt(), anyString());
    }

    private void verifyNoAudit() {
        verify(users, never()).audit(any(), anyString(), anyInt(), anyString());
    }

    private void verifyNoCreate() {
        verify(users, never()).create(any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean());
    }

    private void verifyNoPasswordWrite() {
        verify(users, never()).password(anyInt(), anyString(), anyBoolean());
    }

    private void verifyNoProfileWrite() {
        verify(users, never()).updateProfile(anyInt(), any(), any(), any(), any());
    }


    // ================================================================== profile()

    @Test
    @DisplayName("UTC001 - Returns the detail of the signed-in account")
    void profile_returnsOwnDetail() {
        stub(owner);
        AccountDetail d = service.profile(owner);
        assertEquals(10, d.id());
        assertEquals("OWNER", d.role());
        assertEquals("User 10", d.fullName());
        assertEquals("ACTIVE", d.status());
        assertNull(d.createdById());
        assertNull(d.createdByName());
    }

    @Test
    @DisplayName("UTC002 - Resolves the creator's name when created_by is set")
    void profile_resolvesCreatorName() {
        stub(family);
        stub(owner);
        AccountDetail d = service.profile(family);
        assertEquals(10, d.createdById());
        assertEquals("User 10", d.createdByName());
    }

    @Test
    @DisplayName("UTC003 - passwordEnabled=false when hash starts with '!' and googleLinked=true")
    void profile_flagsPasswordlessGoogleAccount() {
        Account google = withGoogle(withHash(owner, "!google"), "sub-1");
        stub(google);
        AccountDetail d = service.profile(google);
        assertFalse(d.passwordEnabled());
        assertTrue(d.googleLinked());
    }

    @Test
    @DisplayName("UTC004 - Throws when the account no longer exists")
    void profile_throwsWhenAccountMissing() {
        assertThrows(NoSuchElementException.class, () -> service.profile(owner));
    }


    // ================================================================== updateProfile()

    @Test
    @DisplayName("UTC005 - Updates name, phone, address, avatar and writes audit log")
    void updateProfile_updatesAllFieldsAndAudits() {
        stub(owner);
        service.updateProfile(owner, new UpdateProfile("  Nguyen Van A  ", "0912345678", "12 Hang Bai", "https://cdn.test/a.png"));
        verify(users).lockIdentityRegistry();
        verify(users).updateProfile(10, "Nguyen Van A", "+84912345678", "12 Hang Bai", "https://cdn.test/a.png");
        verify(users).audit(10, "PROFILE_UPDATE", 10, "Profile information updated");
    }

    @Test
    @DisplayName("UTC006 - null phone/address/avatar keep the current values")
    void updateProfile_nullFieldsKeepCurrentValues() {
        stub(owner);
        service.updateProfile(owner, new UpdateProfile("New Name", null, null, null));
        verify(users, never()).lockIdentityRegistry();
        verify(users).updateProfile(10, "New Name", owner.phone(), owner.address(), owner.avatarUrl());
    }

    @Test
    @DisplayName("UTC007 - Blank phone keeps the current phone")
    void updateProfile_blankPhoneKeepsCurrentPhone() {
        stub(owner);
        service.updateProfile(owner, new UpdateProfile("New Name", "   ", null, null));
        verify(users, never()).lockIdentityRegistry();
        verify(users).updateProfile(10, "New Name", owner.phone(), owner.address(), owner.avatarUrl());
    }

    @Test
    @DisplayName("UTC008 - Empty address/avatar clear the stored values")
    void updateProfile_emptyAddressAndAvatarClearValues() {
        stub(owner);
        service.updateProfile(owner, new UpdateProfile("New Name", null, "", ""));
        verify(users).updateProfile(10, "New Name", owner.phone(), null, null);
    }

    @Test
    @DisplayName("UTC009 - Rejects an avatar URL that is not https")
    void updateProfile_rejectsNonHttpsAvatar() {
        stub(owner);
        fail(400, "AVATAR_URL", () -> service.updateProfile(owner, new UpdateProfile("New Name", null, null, "http://cdn.test/a.png")));
        verifyNoProfileWrite();
    }

    @Test
    @DisplayName("UTC010 - Avatar URL of exactly 500 characters is accepted")
    void updateProfile_avatarUrlLength500Accepted() {
        stub(owner);
        String url = "https://" + "a".repeat(492);
        assertEquals(500, url.length());
        service.updateProfile(owner, new UpdateProfile("New Name", null, null, url));
        verify(users).updateProfile(10, "New Name", owner.phone(), owner.address(), url);
    }

    @Test
    @DisplayName("UTC011 - Avatar URL of 501 characters is rejected")
    void updateProfile_avatarUrlLength501Rejected() {
        stub(owner);
        String url = "https://" + "a".repeat(493);
        fail(400, "AVATAR_URL", () -> service.updateProfile(owner, new UpdateProfile("New Name", null, null, url)));
        verifyNoProfileWrite();
    }

    @Test
    @DisplayName("UTC012 - Rejects a blank full name")
    void updateProfile_blankNameRejected() {
        stub(owner);
        fail(400, "NAME", () -> service.updateProfile(owner, new UpdateProfile("   ", null, null, null)));
        verifyNoProfileWrite();
    }

    @Test
    @DisplayName("UTC013 - Name of 100 characters is accepted, 101 is rejected")
    void updateProfile_nameLengthBoundary() {
        stub(owner);
        String ok = "a".repeat(100);
        service.updateProfile(owner, new UpdateProfile(ok, null, null, null));
        verify(users).updateProfile(10, ok, owner.phone(), owner.address(), owner.avatarUrl());
        fail(400, "NAME", () -> service.updateProfile(owner, new UpdateProfile("a".repeat(101), null, null, null)));
    }

    @Test
    @DisplayName("UTC014 - Rejects a malformed phone number")
    void updateProfile_rejectsInvalidPhone() {
        stub(owner);
        fail(400, "PHONE", () -> service.updateProfile(owner, new UpdateProfile("New Name", "abc123", null, null)));
        verifyNoProfileWrite();
    }


    // ================================================================== phone()

    @Test
    @DisplayName("UTC015 - Adds a phone number to an account that has none")
    void phone_addsPhoneWhenMissing() {
        Account noPhone = withPhone(owner, null);
        stub(noPhone);
        Account result = service.phone(owner, "0912345678");
        assertSame(noPhone, result);
        verify(users).lockIdentityRegistry();
        verify(users).addPhone(10, "0912345678");
        verify(users).audit(10, "PHONE_ADDED", 10, "Phone added");
    }

    @Test
    @DisplayName("UTC016 - Rejects when the account already has a phone")
    void phone_rejectsWhenAlreadyHasPhone() {
        stub(owner);
        fail(400, "PHONE_EXISTS", () -> service.phone(owner, "0912345678"));
        verify(users, never()).addPhone(anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC017 - Rejects a blank phone input")
    void phone_rejectsBlankInput() {
        stub(withPhone(owner, null));
        fail(400, "PHONE", () -> service.phone(owner, "   "));
        verify(users, never()).addPhone(anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC018 - Rejects a phone number with invalid format")
    void phone_rejectsInvalidFormat() {
        stub(withPhone(owner, null));
        fail(400, "PHONE", () -> service.phone(owner, "12345"));
        verify(users, never()).addPhone(anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC019 - Rejects entered text longer than 15 characters even if the normalized number is valid")
    void phone_rejectsEnteredTextLongerThan15() {
        stub(withPhone(owner, null));
        ApiException ex = fail(400, "PHONE", () -> service.phone(owner, "0912  345  678  90"));
        assertEquals("Số điện thoại tối đa 15 ký tự.", ex.getMessage());
        verify(users, never()).addPhone(anyInt(), anyString());
    }


    // ================================================================== list()

    @Test
    @DisplayName("UTC020 - Admin gets a page of accounts mapped to AccountView")
    void list_adminSeesPageAndMapsItems() {
        stubSearch(2, owner, family);
        AccountPage p = service.list(admin, null, null, null, 0, 10);
        assertEquals(0, p.page());
        assertEquals(10, p.size());
        assertEquals(2, p.total());
        assertEquals(1, p.totalPages());
        assertEquals(2, p.items().size());
        AccountView v = p.items().get(1);
        assertEquals(30, v.id());
        assertEquals("FAMILY_MEMBER", v.role());
        assertEquals("User 30", v.fullName());
        assertEquals("ACTIVE", v.status());
        assertTrue(v.emailVerified());
        assertFalse(v.phoneVerified());
        assertFalse(v.googleLinked());
        assertTrue(v.passwordEnabled());
    }

    @Test
    @DisplayName("UTC021 - Passes trimmed q and valid filters to the repository")
    void list_passesTrimmedFiltersToRepository() {
        stubSearch(0);
        AccountPage p = service.list(owner, "  abc ", "FAMILY_MEMBER", "ACTIVE", 1, 5);
        assertEquals(1, p.page());
        assertEquals(5, p.size());
        verify(users).search(owner, "abc", "FAMILY_MEMBER", "ACTIVE", 1, 5);
    }

    @Test
    @DisplayName("UTC022 - Blank q/role/status are converted to null")
    void list_blankFiltersBecomeNull() {
        stubSearch(0);
        service.list(owner, "", " ", "", 0, 10);
        verify(users).search(owner, null, null, null, 0, 10);
    }

    @Test
    @DisplayName("UTC023 - totalPages rounds up (25 items / size 10 = 3)")
    void list_totalPagesRoundsUp() {
        stubSearch(25);
        assertEquals(3, service.list(owner, null, null, null, 0, 10).totalPages());
    }

    @Test
    @DisplayName("UTC024 - totalPages for an exact multiple (20 / 10 = 2)")
    void list_totalPagesExactMultiple() {
        stubSearch(20);
        assertEquals(2, service.list(owner, null, null, null, 0, 10).totalPages());
    }

    @Test
    @DisplayName("UTC025 - No result gives totalPages=0 and an empty item list")
    void list_emptyResultHasZeroPages() {
        stubSearch(0);
        AccountPage p = service.list(owner, null, null, null, 0, 10);
        assertEquals(0, p.total());
        assertEquals(0, p.totalPages());
        assertTrue(p.items().isEmpty());
    }

    @Test
    @DisplayName("UTC026 - Rejects an actor that is not ADMIN or OWNER")
    void list_rejectsNonManagerRole() {
        fail(403, "ROLE", () -> service.list(family, null, null, null, 0, 10));
        verify(users, never()).search(any(), any(), any(), any(), anyInt(), anyInt());
    }

    @Test
    @DisplayName("UTC027 - Rejects page = -1")
    void list_rejectsNegativePage() {
        fail(400, "PAGE", () -> service.list(owner, null, null, null, -1, 10));
    }

    @Test
    @DisplayName("UTC028 - Rejects size = 0 and size = 101")
    void list_rejectsInvalidPageSize() {
        fail(400, "PAGE_SIZE", () -> service.list(owner, null, null, null, 0, 0));
        fail(400, "PAGE_SIZE", () -> service.list(owner, null, null, null, 0, 101));
    }

    @Test
    @DisplayName("UTC029 - Accepts size = 1 and size = 100")
    void list_acceptsPageSizeBoundaries() {
        stubSearch(0);
        assertEquals(1, service.list(owner, null, null, null, 0, 1).size());
        assertEquals(100, service.list(owner, null, null, null, 0, 100).size());
    }

    @Test
    @DisplayName("UTC030 - Rejects an unknown role filter")
    void list_rejectsUnknownRoleFilter() {
        fail(400, "ROLE_FILTER", () -> service.list(owner, null, "HACKER", null, 0, 10));
    }

    @Test
    @DisplayName("UTC031 - Rejects an unknown status filter")
    void list_rejectsUnknownStatusFilter() {
        fail(400, "STATUS_FILTER", () -> service.list(owner, null, null, "DELETED", 0, 10));
    }

    @Test
    @DisplayName("UTC032 - q of 100 characters is accepted, 101 is rejected")
    void list_queryLengthBoundary() {
        stubSearch(0);
        service.list(owner, "a".repeat(100), null, null, 0, 10);
        fail(400, "QUERY", () -> service.list(owner, "a".repeat(101), null, null, 0, 10));
    }


    // ================================================================== summary()

    @Test
    @DisplayName("UTC033 - Returns the summary computed by the repository")
    void summary_returnsRepositorySummary() {
        AccountSummary s = new AccountSummary(3, Map.of("ACTIVE", 2L, "DISABLED", 1L), Map.of("FAMILY_MEMBER", 3L));
        when(users.summary(owner)).thenReturn(s);
        assertSame(s, service.summary(owner));
    }

    @Test
    @DisplayName("UTC034 - Rejects an actor that is not ADMIN or OWNER")
    void summary_rejectsNonManager() {
        fail(403, "ROLE", () -> service.summary(family));
        verify(users, never()).summary(any());
    }


    // ================================================================== detail()

    @Test
    @DisplayName("UTC035 - Owner views a family member they created")
    void detail_ownerViewsOwnFamilyMember() {
        stub(family);
        stub(owner);
        AccountDetail d = service.detail(owner, 30);
        assertEquals(30, d.id());
        assertEquals("FAMILY_MEMBER", d.role());
        assertEquals("User 10", d.createdByName());
    }

    @Test
    @DisplayName("UTC036 - Throws 404 when the account does not exist")
    void detail_returns404WhenNotFound() {
        fail(404, "ACCOUNT_NOT_FOUND", () -> service.detail(owner, 999));
    }

    @Test
    @DisplayName("UTC037 - Owner cannot view a member created by another owner")
    void detail_ownerCannotViewMemberOfAnotherOwner() {
        stub(acc(31, "FAMILY_MEMBER", "ACTIVE", 11));
        fail(403, "OWNERSHIP", () -> service.detail(owner, 31));
    }

    @Test
    @DisplayName("UTC038 - Owner cannot view a CUSTOMER account even if created_by matches")
    void detail_ownerCannotViewNonManagedRole() {
        stub(acc(41, "CUSTOMER", "ACTIVE", 10));
        fail(403, "OWNERSHIP", () -> service.detail(owner, 41));
    }

    @Test
    @DisplayName("UTC039 - Admin can view any account")
    void detail_adminViewsAnyAccount() {
        stub(otherOwner);
        AccountDetail d = service.detail(admin, 11);
        assertEquals(11, d.id());
        assertEquals("OWNER", d.role());
    }

    @Test
    @DisplayName("UTC040 - Rejects an actor that is not ADMIN or OWNER")
    void detail_rejectsNonManager() {
        fail(403, "ROLE", () -> service.detail(family, 30));
    }


    // ================================================================== create()

    @Test
    @DisplayName("UTC041 - Owner creates a family member (normalizes data, PENDING_VERIFICATION)")
    void create_ownerCreatesFamilyMember() {
        Account created = acc(31, "FAMILY_MEMBER", "PENDING_VERIFICATION", 10);
        stubCreate(created);
        Account result = service.create(owner, new Create("FAMILY_MEMBER", "  Nguyen Van A ", "Family@Mail.COM", "0912345678", "Password123", "Password123"));
        assertSame(created, result);
        verify(passwords).encode("Password123");
        verify(users).create(eq("FAMILY_MEMBER"), eq("Nguyen Van A"), eq("ENC"), eq("family@mail.com"),
                eq("+84912345678"), eq("PENDING_VERIFICATION"), eq(10), isNull(), eq(false));
    }

    @Test
    @DisplayName("UTC042 - Owner cannot create OWNER, ADMIN or CUSTOMER accounts")
    void create_ownerCannotCreatePrivilegedRoles() {
        for (String role : List.of("OWNER", "ADMIN", "CUSTOMER")) {
            fail(403, "ROLE", () -> service.create(owner, new Create(role, "Name", "a@mail.com", null, "Password123", "Password123")));
        }
        verifyNoCreate();
    }

    @Test
    @DisplayName("UTC043 - Admin creates an OWNER account")
    void create_adminCreatesOwner() {
        Account created = acc(12, "OWNER", "PENDING_VERIFICATION", 1);
        stubCreate(created);
        Account result = service.create(admin, new Create("OWNER", "Shop Owner", "owner@mail.com", "0912345678", "Password123", "Password123"));
        assertSame(created, result);
        verify(users).create(eq("OWNER"), eq("Shop Owner"), eq("ENC"), eq("owner@mail.com"),
                eq("+84912345678"), eq("PENDING_VERIFICATION"), eq(1), isNull(), eq(false));
    }

    @Test
    @DisplayName("UTC044 - Admin cannot create a FAMILY_MEMBER account")
    void create_adminCannotCreateFamilyMember() {
        fail(403, "ROLE", () -> service.create(admin, new Create("FAMILY_MEMBER", "Name", "a@mail.com", null, "Password123", "Password123")));
        verifyNoCreate();
    }

    @Test
    @DisplayName("UTC045 - Rejects an actor that is not ADMIN or OWNER")
    void create_rejectsNonManagerActor() {
        fail(403, "ROLE", () -> service.create(family, new Create("FAMILY_MEMBER", "Name", "a@mail.com", null, "Password123", "Password123")));
        verifyNoCreate();
    }

    @Test
    @DisplayName("UTC046 - Rejects when confirmPassword differs from password")
    void create_rejectsMismatchedPasswordConfirmation() {
        fail(400, "PASSWORD_CONFIRM", () -> service.create(owner, new Create("FAMILY_MEMBER", "Name", "a@mail.com", null, "Password123", "Password124")));
        verifyNoCreate();
    }

    @Test
    @DisplayName("UTC047 - Password of 9 characters is rejected, 10 is accepted")
    void create_passwordLowerBound() {
        stubCreate(acc(31, "FAMILY_MEMBER", "PENDING_VERIFICATION", 10));
        fail(400, "PASSWORD", () -> service.create(owner, new Create("FAMILY_MEMBER", "Name", "a@mail.com", null, "Passwor12", "Passwor12")));
        assertNotNull(service.create(owner, new Create("FAMILY_MEMBER", "Name", "a@mail.com", null, "Password12", "Password12")));
    }

    @Test
    @DisplayName("UTC048 - Password of 64 characters is accepted, 65 is rejected")
    void create_passwordUpperBound() {
        stubCreate(acc(31, "FAMILY_MEMBER", "PENDING_VERIFICATION", 10));
        String ok = "a".repeat(64);
        String tooLong = "a".repeat(65);
        assertNotNull(service.create(owner, new Create("FAMILY_MEMBER", "Name", "a@mail.com", null, ok, ok)));
        fail(400, "PASSWORD", () -> service.create(owner, new Create("FAMILY_MEMBER", "Name", "a@mail.com", null, tooLong, tooLong)));
    }

    @Test
    @DisplayName("UTC049 - Rejects an invalid email")
    void create_rejectsInvalidEmail() {
        fail(400, "EMAIL", () -> service.create(owner, new Create("FAMILY_MEMBER", "Name", "not-an-email", null, "Password123", "Password123")));
        verifyNoCreate();
    }

    @Test
    @DisplayName("UTC050 - Rejects a blank full name")
    void create_rejectsBlankFullName() {
        fail(400, "NAME", () -> service.create(owner, new Create("FAMILY_MEMBER", "   ", "a@mail.com", null, "Password123", "Password123")));
        verifyNoCreate();
    }

    @Test
    @DisplayName("UTC051 - Rejects an invalid phone number")
    void create_rejectsInvalidPhone() {
        fail(400, "PHONE", () -> service.create(owner, new Create("FAMILY_MEMBER", "Name", "a@mail.com", "abc", "Password123", "Password123")));
        verifyNoCreate();
    }

    @Test
    @DisplayName("UTC052 - Phone is optional (null is passed to the repository)")
    void create_allowsMissingPhone() {
        stubCreate(acc(31, "FAMILY_MEMBER", "PENDING_VERIFICATION", 10));
        service.create(owner, new Create("FAMILY_MEMBER", "Name", "a@mail.com", null, "Password123", "Password123"));
        verify(users).create(eq("FAMILY_MEMBER"), eq("Name"), eq("ENC"), eq("a@mail.com"),
                isNull(), eq("PENDING_VERIFICATION"), eq(10), isNull(), eq(false));
    }


    // ================================================================== edit()

    @Test
    @DisplayName("UTC053 - Renames the account and writes ACCOUNT_EDIT audit")
    void edit_renamesAccountAndWritesAudit() {
        stub(family);
        Account result = service.edit(owner, 30, new Edit("  New Name ", null));
        assertSame(family, result);
        verify(users).name(30, "New Name");
        verify(users).audit(10, "ACCOUNT_EDIT", 30, "Account details/status updated");
        verifyNoStatusWrite();
    }

    @Test
    @DisplayName("UTC054 - Renames and deactivates in one call")
    void edit_deactivatesAccountWhenStatusProvided() {
        stub(family);
        service.edit(owner, 30, new Edit("New Name", "DISABLED"));
        verify(users).name(30, "New Name");
        verify(users).status(30, "DISABLED");
        verify(codes).invalidateAll(30);
        verify(users).audit(10, "ACCOUNT_DEACTIVATE", 30, "ACTIVE -> DISABLED");
        verify(users).audit(10, "ACCOUNT_EDIT", 30, "Account details/status updated");
    }

    @Test
    @DisplayName("UTC055 - Same status does not change status or invalidate codes")
    void edit_sameStatusIsNoOp() {
        stub(family);
        service.edit(owner, 30, new Edit("New Name", "ACTIVE"));
        verify(users).name(30, "New Name");
        verifyNoStatusWrite();
        verify(codes, never()).invalidateAll(anyInt());
    }

    @Test
    @DisplayName("UTC056 - Invalid status is rejected before any write")
    void edit_invalidStatusWritesNothing() {
        stub(family);
        fail(400, "STATUS", () -> service.edit(owner, 30, new Edit("New Name", "DELETED")));
        verify(users, never()).name(anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC057 - Rejects a blank full name")
    void edit_blankNameRejected() {
        stub(family);
        fail(400, "NAME", () -> service.edit(owner, 30, new Edit("   ", null)));
        verify(users, never()).name(anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC058 - Owner cannot edit a member created by another owner")
    void edit_rejectsMemberOfAnotherOwner() {
        stub(acc(31, "FAMILY_MEMBER", "ACTIVE", 11));
        fail(403, "OWNERSHIP", () -> service.edit(owner, 31, new Edit("New Name", null)));
        verify(users, never()).name(anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC059 - Owner cannot lock an account through edit")
    void edit_ownerCannotLockViaEdit() {
        stub(family);
        fail(403, "LOCK_ADMIN_ONLY", () -> service.edit(owner, 30, new Edit("New Name", "LOCKED")));
        verify(users, never()).name(anyInt(), anyString());
    }


    // ================================================================== changeStatus()

    @Test
    @DisplayName("UTC060 - Owner deactivates an ACTIVE family member")
    void changeStatus_ownerDeactivatesFamilyMember() {
        stub(family);
        Account result = service.changeStatus(owner, 30, "DISABLED");
        assertSame(family, result);
        verify(users).status(30, "DISABLED");
        verify(codes).invalidateAll(30);
        verify(users).audit(10, "ACCOUNT_DEACTIVATE", 30, "ACTIVE -> DISABLED");
    }

    @Test
    @DisplayName("UTC061 - Owner re-activates a DISABLED family member")
    void changeStatus_ownerReactivatesDisabledMember() {
        stub(acc(30, "FAMILY_MEMBER", "DISABLED", 10));
        service.changeStatus(owner, 30, "ACTIVE");
        verify(users).status(30, "ACTIVE");
        verify(users).audit(10, "ACCOUNT_ACTIVATE", 30, "DISABLED -> ACTIVE");
    }

    @Test
    @DisplayName("UTC062 - Same status writes nothing")
    void changeStatus_sameStatusDoesNothing() {
        stub(family);
        service.changeStatus(owner, 30, "ACTIVE");
        verifyNoStatusWrite();
        verifyNoAudit();
    }

    @Test
    @DisplayName("UTC063 - Owner cannot lock an account")
    void changeStatus_ownerCannotLock() {
        stub(family);
        fail(403, "LOCK_ADMIN_ONLY", () -> service.changeStatus(owner, 30, "LOCKED"));
        verifyNoStatusWrite();
    }

    @Test
    @DisplayName("UTC064 - Owner cannot change an account locked by an admin")
    void changeStatus_ownerCannotChangeLockedAccount() {
        stub(acc(30, "FAMILY_MEMBER", "LOCKED", 10));
        fail(403, "LOCKED_BY_ADMIN", () -> service.changeStatus(owner, 30, "ACTIVE"));
        verifyNoStatusWrite();
    }

    @Test
    @DisplayName("UTC065 - A PENDING_VERIFICATION account cannot be activated manually (owner or admin)")
    void changeStatus_pendingAccountCannotBeActivated() {
        stub(acc(30, "FAMILY_MEMBER", "PENDING_VERIFICATION", 10));
        fail(400, "ACCOUNT_UNVERIFIED", () -> service.changeStatus(owner, 30, "ACTIVE"));
        fail(400, "ACCOUNT_UNVERIFIED", () -> service.changeStatus(admin, 30, "ACTIVE"));
        verifyNoStatusWrite();
    }

    @Test
    @DisplayName("UTC066 - Rejects an unknown status")
    void changeStatus_rejectsUnknownStatus() {
        stub(family);
        fail(400, "STATUS", () -> service.changeStatus(owner, 30, "DELETED"));
        verifyNoStatusWrite();
    }

    @Test
    @DisplayName("UTC067 - An actor cannot change their own status")
    void changeStatus_actorCannotChangeOwnStatus() {
        stub(admin);
        fail(400, "SELF_LOCK", () -> service.changeStatus(admin, 1, "DISABLED"));
        verifyNoStatusWrite();
    }

    @Test
    @DisplayName("UTC068 - Admin locks an ACTIVE account")
    void changeStatus_adminLocksAccount() {
        stub(family);
        service.changeStatus(admin, 30, "LOCKED");
        verify(users).status(30, "LOCKED");
        verify(users).audit(1, "ACCOUNT_LOCK", 30, "ACTIVE -> LOCKED");
    }

    @Test
    @DisplayName("UTC069 - Rejects an actor that is not ADMIN or OWNER")
    void changeStatus_rejectsNonManagerActor() {
        fail(403, "ROLE", () -> service.changeStatus(family, 30, "DISABLED"));
        verifyNoStatusWrite();
    }

    @Test
    @DisplayName("UTC070 - Owner cannot change the status of another owner's member")
    void changeStatus_ownerCannotManageMemberOfAnotherOwner() {
        stub(acc(31, "FAMILY_MEMBER", "ACTIVE", 11));
        fail(403, "OWNERSHIP", () -> service.changeStatus(owner, 31, "DISABLED"));
        verifyNoStatusWrite();
    }


    // ================================================================== lock()

    @Test
    @DisplayName("UTC071 - Admin locks an ACTIVE account")
    void lock_adminLocksActiveAccount() {
        stub(family);
        service.lock(admin, 30);
        verify(users).status(30, "LOCKED");
        verify(codes).invalidateAll(30);
        verify(users).audit(1, "ACCOUNT_LOCK", 30, "ACTIVE -> LOCKED");
    }

    @Test
    @DisplayName("UTC072 - Rejects an actor that is not ADMIN")
    void lock_rejectsNonAdmin() {
        fail(403, "ROLE", () -> service.lock(owner, 30));
        verifyNoStatusWrite();
    }


    // ================================================================== unlock()

    @Test
    @DisplayName("UTC073 - Admin unlocks a LOCKED account")
    void unlock_adminUnlocksLockedAccount() {
        stub(acc(30, "FAMILY_MEMBER", "LOCKED", 10));
        service.unlock(admin, 30);
        verify(users).status(30, "ACTIVE");
        verify(users).audit(1, "ACCOUNT_UNLOCK", 30, "LOCKED -> ACTIVE");
    }

    @Test
    @DisplayName("UTC074 - Rejects unlocking an account that is not LOCKED")
    void unlock_rejectsAccountThatIsNotLocked() {
        stub(family);
        fail(400, "NOT_LOCKED", () -> service.unlock(admin, 30));
        verifyNoStatusWrite();
    }

    @Test
    @DisplayName("UTC075 - Rejects an actor that is not ADMIN")
    void unlock_rejectsNonAdmin() {
        fail(403, "ROLE", () -> service.unlock(owner, 30));
        verifyNoStatusWrite();
    }


    // ================================================================== resetByManager()

    @Test
    @DisplayName("UTC076 - Owner resets an ACTIVE family member's password (back to PENDING_VERIFICATION)")
    void resetByManager_ownerResetsActiveFamilyMember() {
        stub(family);
        service.resetByManager(owner, 30, new Password("NewPassword1", "NewPassword1"));
        verify(users).password(30, "ENC", false);
        verify(users).status(30, "PENDING_VERIFICATION");
        verify(codes).invalidateAll(30);
        verify(users).audit(10, "PASSWORD_RESET_ADMIN", 30, "Password replaced by OWNER; activation required; sessions revoked");
    }

    @Test
    @DisplayName("UTC077 - PENDING_VERIFICATION and DISABLED accounts keep their status after a reset")
    void resetByManager_nonActiveStatusIsKept() {
        for (String status : List.of("PENDING_VERIFICATION", "DISABLED")) {
            stub(acc(30, "FAMILY_MEMBER", status, 10));
            service.resetByManager(owner, 30, new Password("NewPassword1", "NewPassword1"));
        }
        verify(users, times(2)).password(30, "ENC", false);
        verifyNoStatusWrite();
    }

    @Test
    @DisplayName("UTC078 - Admin resets an OWNER's password when the owner has an open request")
    void resetByManager_adminResetsOwnerWithOpenRequest() {
        stub(owner);
        when(users.hasOpenResetRequest(10)).thenReturn(true);
        service.resetByManager(admin, 10, new Password("NewPassword1", "NewPassword1"));
        verify(users).password(10, "ENC", false);
        verify(users).status(10, "PENDING_VERIFICATION");
        verify(users).audit(1, "PASSWORD_RESET_ADMIN", 10, "Password replaced by ADMIN; activation required; sessions revoked");
    }

    @Test
    @DisplayName("UTC079 - Admin cannot reset an OWNER's password without an open request")
    void resetByManager_adminNeedsOpenRequest() {
        stub(owner);
        fail(400, "NO_RESET_REQUEST", () -> service.resetByManager(admin, 10, new Password("NewPassword1", "NewPassword1")));
        verifyNoPasswordWrite();
    }

    @Test
    @DisplayName("UTC080 - Admin cannot reset a family member's password")
    void resetByManager_adminCannotResetFamilyMember() {
        stub(family);
        fail(403, "RESET_ROLE", () -> service.resetByManager(admin, 30, new Password("NewPassword1", "NewPassword1")));
        verifyNoPasswordWrite();
    }

    @Test
    @DisplayName("UTC081 - Rejects when confirmPassword differs")
    void resetByManager_rejectsMismatchedConfirmation() {
        stub(family);
        fail(400, "PASSWORD_CONFIRM", () -> service.resetByManager(owner, 30, new Password("NewPassword1", "NewPassword2")));
        verifyNoPasswordWrite();
    }

    @Test
    @DisplayName("UTC082 - Rejects a password shorter than 10 characters")
    void resetByManager_rejectsShortPassword() {
        stub(family);
        fail(400, "PASSWORD", () -> service.resetByManager(owner, 30, new Password("Short1", "Short1")));
        verifyNoPasswordWrite();
    }

    @Test
    @DisplayName("UTC083 - Rejects an actor that is not ADMIN or OWNER")
    void resetByManager_rejectsNonManager() {
        fail(403, "ROLE", () -> service.resetByManager(family, 30, new Password("NewPassword1", "NewPassword1")));
        verifyNoPasswordWrite();
    }

    @Test
    @DisplayName("UTC084 - Owner cannot reset the password of another owner's member")
    void resetByManager_ownerCannotResetMemberOfAnotherOwner() {
        stub(acc(31, "FAMILY_MEMBER", "ACTIVE", 11));
        fail(403, "OWNERSHIP", () -> service.resetByManager(owner, 31, new Password("NewPassword1", "NewPassword1")));
        verifyNoPasswordWrite();
    }


    // ================================================================== requestOwnerReset()

    @Test
    @DisplayName("UTC085 - Records a reset request for an ACTIVE owner (identifier is normalized)")
    void requestOwnerReset_recordsRequestForActiveOwner() {
        when(users.byIdentifier("owner@mail.com")).thenReturn(Optional.of(owner));
        service.requestOwnerReset("Owner@Mail.com");
        verify(users).audit(isNull(), eq("PASSWORD_RESET_REQUEST"), eq(10), eq("Shop Owner submitted a password reset request"));
    }

    @Test
    @DisplayName("UTC086 - Blank identifier is ignored without an error")
    void requestOwnerReset_blankIdentifierIsIgnoredSilently() {
        assertDoesNotThrow(() -> service.requestOwnerReset("   "));
        verify(users, never()).byIdentifier(any());
        verifyNoAudit();
    }

    @Test
    @DisplayName("UTC087 - Unknown account is ignored without an error")
    void requestOwnerReset_unknownIdentifierIsIgnoredSilently() {
        assertDoesNotThrow(() -> service.requestOwnerReset("nobody@mail.com"));
        verifyNoAudit();
    }

    @Test
    @DisplayName("UTC088 - Non-owner accounts are ignored")
    void requestOwnerReset_ignoresNonOwnerAccounts() {
        when(users.byIdentifier("u30@mail.com")).thenReturn(Optional.of(family));
        service.requestOwnerReset("u30@mail.com");
        verifyNoAudit();
    }

    @Test
    @DisplayName("UTC089 - An owner that is not ACTIVE is ignored")
    void requestOwnerReset_ignoresInactiveOwner() {
        when(users.byIdentifier("owner@mail.com")).thenReturn(Optional.of(acc(10, "OWNER", "PENDING_VERIFICATION", null)));
        service.requestOwnerReset("owner@mail.com");
        verifyNoAudit();
    }

    @Test
    @DisplayName("UTC090 - No duplicate request when one is already open")
    void requestOwnerReset_ignoresWhenRequestAlreadyOpen() {
        when(users.byIdentifier("owner@mail.com")).thenReturn(Optional.of(owner));
        when(users.hasOpenResetRequest(10)).thenReturn(true);
        service.requestOwnerReset("owner@mail.com");
        verifyNoAudit();
    }


    // ================================================================== resetRequests()

    @Test
    @DisplayName("UTC091 - Admin gets the list of open reset requests")
    void resetRequests_adminGetsOpenRequests() {
        List<AccountRepository.OpenResetRequest> open = List.of(new AccountRepository.OpenResetRequest(10, "User 10", "u10@mail.com", T));
        when(users.openResetRequests()).thenReturn(open);
        assertSame(open, service.resetRequests(admin));
    }

    @Test
    @DisplayName("UTC092 - Rejects an actor that is not ADMIN")
    void resetRequests_rejectsNonAdmin() {
        fail(403, "ROLE", () -> service.resetRequests(owner));
        verify(users, never()).openResetRequests();
    }

}
