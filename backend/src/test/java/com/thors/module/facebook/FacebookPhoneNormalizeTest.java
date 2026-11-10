package com.thors.module.facebook;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.thors.module.facebook.service.FacebookService;
import org.junit.jupiter.api.Test;

/** SĐT khách Facebook lưu thống nhất dạng 0xxxxxxxxx dù khách nhắn kiểu nào. */
class FacebookPhoneNormalizeTest {

    @Test
    void acceptsCommonVietnameseFormats() {
        assertEquals("0566238971", FacebookService.normalizeVnPhone("0566238971"));
        assertEquals("0566238971", FacebookService.normalizeVnPhone("+84 566 238 971"));
        assertEquals("0566238971", FacebookService.normalizeVnPhone("84566238971"));
        assertEquals("0912345678", FacebookService.normalizeVnPhone("0912.345.678"));
        assertEquals("0912345678", FacebookService.normalizeVnPhone("(091) 234-5678"));
    }

    @Test
    void rejectsInvalidNumbers() {
        assertNull(FacebookService.normalizeVnPhone(null));
        assertNull(FacebookService.normalizeVnPhone(""));
        assertNull(FacebookService.normalizeVnPhone("0123456789"));  // đầu số 01 không phải di động
        assertNull(FacebookService.normalizeVnPhone("091234567"));   // thiếu số
        assertNull(FacebookService.normalizeVnPhone("09123456789")); // thừa số
        assertNull(FacebookService.normalizeVnPhone("0|12345678"));  // ký tự | trong regex cũ
    }
}
