package com.thors.module.order.delivery;

import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Đọc địa chỉ giao của đơn online cho hộp thoại "Giao hàng". */
@Repository
public class DeliveryRepository {
    private final JdbcTemplate db;

    public DeliveryRepository(JdbcTemplate db) {
        this.db = db;
    }

    public record Geo(String address) {}

    public Optional<Geo> findOnline(int orderId) {
        List<Geo> rows =
                db.query(
                        "SELECT delivery_address FROM orders WHERE order_id = ? AND order_type = 'Online'",
                        (rs, i) -> new Geo(rs.getString("delivery_address")),
                        orderId);
        return rows.stream().findFirst();
    }
}
