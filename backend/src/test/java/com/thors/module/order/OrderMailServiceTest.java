package com.thors.module.order;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.thors.module.order.dto.OrderViews.Detail;
import com.thors.module.order.dto.OrderViews.Line;
import com.thors.module.order.service.OrderMailAccess;
import com.thors.module.order.service.OrderMailService.Recipient;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Nội dung email báo khách đơn hàng đã được xác nhận. */
class OrderMailServiceTest {

    @Test
    @DisplayName("Email xác nhận đơn có mã đơn, sản phẩm, tổng tiền, địa chỉ và link theo dõi")
    void confirmedBody() {
        var line = new Line(1, 11, 3, "Áo Thun Cổ Tròn Basic", "M", "Xám", 2, 180_000, 360_000, null);
        var order = new Detail(42, "ORD-20261120-ABC123", null, "PENDING_CONFIRMATION", null, "COD", "UNPAID", null,
                360_000, null, 0, null, 0, 30_000, 390_000, "Nguyễn Văn A", "0900000000",
                "12 Lê Lợi, Phường An Bình, Cần Thơ", null, null, null, null, null, null, List.of(line), null, null, null);

        String body = OrderMailAccess.confirmedBody(new Recipient("Nguyễn Văn A", "a@example.com"), order,
                "https://shop.example/orders/42");

        assertTrue(body.contains("Xin chào Nguyễn Văn A"), body);
        assertTrue(body.contains("ORD-20261120-ABC123") && body.contains("đã được cửa hàng xác nhận"), body);
        assertTrue(body.contains("Áo Thun Cổ Tròn Basic (M / Xám) x2"), body);
        assertTrue(body.contains("390.000 ₫"), body);
        assertTrue(body.contains("12 Lê Lợi, Phường An Bình, Cần Thơ"), body);
        assertTrue(body.contains("https://shop.example/orders/42"), body);
    }
}
