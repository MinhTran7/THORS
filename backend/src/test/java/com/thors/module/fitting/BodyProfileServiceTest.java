package com.thors.module.fitting;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.fitting.dto.BodyProfileRequest;
import com.thors.module.fitting.entity.BodyProfile;
import com.thors.module.fitting.repository.BodyProfileRepository;
import com.thors.module.fitting.service.BodyProfileService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.BadSqlGrammarException;

/** Hồ sơ số đo: kiểm tra dữ liệu, quyền (chỉ khách), và báo lỗi rõ khi chưa chạy migration. */
class BodyProfileServiceTest {

    private BodyProfileRepository repo;
    private BodyProfileService service;

    @BeforeEach
    void setUp() {
        repo = mock(BodyProfileRepository.class);
        service = new BodyProfileService(repo);
    }

    private static Account account(int id, String role) {
        return new Account(id, role, "User " + id, "hash", "u" + id + "@mail.com", null, null, null,
                "ACTIVE", LocalDateTime.now(), LocalDateTime.now(), null, 0, null);
    }

    private static BodyProfileRequest request(String gender, String height, String weight, String chest, String fit) {
        return new BodyProfileRequest(gender, dec(height), dec(weight), dec(chest), null, null, null, fit);
    }

    private static BigDecimal dec(String v) {
        return v == null ? null : new BigDecimal(v);
    }

    private static int status(Runnable r) {
        return assertThrows(ApiException.class, r::run).status;
    }

    @Test
    void validateNormalizesGenderFitAndRounds() {
        BodyProfileRequest r = BodyProfileService.validate(request(" male ", "170.26", "65", "90", null));
        assertEquals("MALE", r.gender());
        assertEquals("REGULAR", r.fitPreference()); // bỏ trống -> REGULAR
        assertEquals(new BigDecimal("170.3"), r.heightCm()); // làm tròn 1 chữ số
        assertNull(r.waistCm()); // số đo vòng được bỏ trống
    }

    @Test
    void validateRejectsMissingOrOutOfRange() {
        assertEquals(400, status(() -> BodyProfileService.validate(request(null, "170", "65", null, null))));
        assertEquals(400, status(() -> BodyProfileService.validate(request("MALE", null, "65", null, null))));
        assertEquals(400, status(() -> BodyProfileService.validate(request("MALE", "300", "65", null, null))));
        assertEquals(400, status(() -> BodyProfileService.validate(request("MALE", "170", "10", null, null))));
        assertEquals(400, status(() -> BodyProfileService.validate(request("MALE", "170", "65", "200", null))));
        assertEquals(400, status(() -> BodyProfileService.validate(request("MALE", "170", "65", null, "TIGHT"))));
    }

    @Test
    void onlyCustomerCanUseIt() {
        assertEquals(403, status(() -> service.get(account(1, "OWNER"))));
        assertEquals(403, status(() -> service.save(account(1, "FAMILY_MEMBER"), request("MALE", "170", "65", null, null))));
        verify(repo, never()).upsert(anyInt(), any());
    }

    @Test
    void saveUpsertsForCurrentCustomer() {
        when(repo.findByUserId(7)).thenReturn(Optional.of(new BodyProfile(7, "FEMALE", dec("160.0"), dec("50.0"),
                null, null, null, null, "SLIM", LocalDateTime.now())));
        var saved = service.save(account(7, "CUSTOMER"), request("FEMALE", "160", "50", null, "slim"));
        assertEquals("SLIM", saved.fitPreference());
        verify(repo).upsert(anyInt(), any());
    }

    @Test
    void missingTableGives503() {
        when(repo.findByUserId(anyInt())).thenThrow(new BadSqlGrammarException("x", "SELECT", new java.sql.SQLException()));
        assertEquals(503, status(() -> service.get(account(7, "CUSTOMER"))));
    }

    @Test
    void noProfileYetIsEmpty() {
        when(repo.findByUserId(7)).thenReturn(Optional.empty());
        assertTrue(service.get(account(7, "CUSTOMER")).isEmpty());
    }
}
