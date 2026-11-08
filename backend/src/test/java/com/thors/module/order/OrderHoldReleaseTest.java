package com.thors.module.order;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.thors.module.order.repository.OrderRepository;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * Đơn chờ xác nhận đang GIỮ hàng (order_item.reserved_quantity, vd. đơn Facebook): hủy / từ chối / hết hạn
 * phải trả lại phần giữ; xác nhận đơn thì giữ nguyên (bước trừ kho dùng phần giữ đó).
 */
class OrderHoldReleaseTest {

    private JdbcTemplate db;
    private OrderRepository orders;

    @BeforeEach
    void setUp() {
        var dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:hold_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE", "sa", "");
        db = new JdbcTemplate(dataSource);
        db.execute("""
                CREATE TABLE orders (order_id INT PRIMARY KEY, order_status VARCHAR(30), cancel_reason VARCHAR(255),
                  cancelled_at TIMESTAMP, confirmed_by INT, confirmed_at TIMESTAMP)""");
        db.execute("""
                CREATE TABLE order_item (order_item_id INT PRIMARY KEY, order_id INT, quantity INT,
                  reserved_quantity INT NOT NULL DEFAULT 0)""");
        db.update("INSERT INTO orders (order_id, order_status) VALUES (1, 'PENDING_CONFIRMATION')");
        db.update("INSERT INTO order_item VALUES (10, 1, 3, 3), (11, 1, 2, 2)");
        orders = new OrderRepository(db);
    }

    private int held() {
        return db.queryForObject("SELECT SUM(reserved_quantity) FROM order_item WHERE order_id = 1", Integer.class);
    }

    @Test
    void rejectingReleasesHeldStock() {
        assertTrue(orders.transition(1, "PENDING_CONFIRMATION", "REJECTED", 7, "Hết hàng", null));
        assertEquals(0, held());
    }

    @Test
    void cancellingReleasesHeldStock() {
        assertTrue(orders.transition(1, "PENDING_CONFIRMATION", "CANCELLED", 7, "Khách hủy", null));
        assertEquals(0, held());
    }

    @Test
    void confirmingKeepsHoldForStockDeduction() {
        assertTrue(orders.transition(1, "PENDING_CONFIRMATION", "AWAITING_PICKUP", 7, null, null));
        assertEquals(5, held());
    }

    @Test
    void staleTransitionDoesNotTouchHold() {
        // Đơn không còn ở trạng thái "from" (người khác vừa đổi) => không đổi gì
        assertFalse(orders.transition(1, "AWAITING_PAYMENT", "CANCELLED", 7, "x", null));
        assertEquals(5, held());
    }
}
