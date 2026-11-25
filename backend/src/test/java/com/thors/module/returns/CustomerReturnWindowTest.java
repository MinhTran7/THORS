package com.thors.module.returns;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.thors.module.returns.dto.ReturnableOrderResponse;
import com.thors.module.returns.service.ReturnServiceAccess;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Khách tự gửi yêu cầu trả hàng online: trong 7 ngày kể từ lúc giao, mỗi đơn một lần (trừ khi bị từ chối). */
class CustomerReturnWindowTest {
    private static final LocalDateTime DELIVERED = LocalDateTime.of(2026, 11, 13, 9, 47, 42); // UTC

    private static ReturnableOrderResponse order(LocalDateTime deliveredAt, String lastReturnStatus) {
        var o = new ReturnableOrderResponse();
        o.setDeliveredAt(deliveredAt);
        o.setActiveReturnStatus(lastReturnStatus);
        return o;
    }

    @Test
    @DisplayName("Còn trong 7 ngày kể từ lúc giao thì được gửi")
    void insideWindow() {
        assertNull(ReturnServiceAccess.block(order(DELIVERED, null), DELIVERED.plusDays(7).minusMinutes(1)));
    }

    @Test
    @DisplayName("Quá 7 ngày thì bị chặn, báo hạn theo giờ Việt Nam")
    void afterWindow() {
        String msg = ReturnServiceAccess.block(order(DELIVERED, null), DELIVERED.plusDays(7));
        assertNotNull(msg);
        assertTrue(msg.contains("16:47 20/11/2026"), msg);
    }

    @Test
    @DisplayName("Chưa có mốc giao thì không gửi online được")
    void noDeliveryTime() {
        assertNotNull(ReturnServiceAccess.block(order(null, null), DELIVERED));
    }

    @Test
    @DisplayName("Đã trả xong hoặc đang xử lý thì không gửi thêm; bị từ chối thì được gửi lại")
    void onePerOrder() {
        LocalDateTime now = DELIVERED.plusDays(1);
        assertNotNull(ReturnServiceAccess.block(order(DELIVERED, "COMPLETED"), now));
        assertNotNull(ReturnServiceAccess.block(order(DELIVERED, "PENDING"), now));
        assertNotNull(ReturnServiceAccess.block(order(DELIVERED, "APPROVED"), now));
        assertNull(ReturnServiceAccess.block(order(DELIVERED, "REJECTED"), now));
    }
}
