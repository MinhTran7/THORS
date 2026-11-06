package com.thors.module.order.delivery;

import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Đọc và lưu vị trí giao hàng của đơn online (các cột delivery_lat, delivery_lng, delivery_distance_*). */
@Repository
public class DeliveryRepository {
    private final JdbcTemplate db;

    public DeliveryRepository(JdbcTemplate db) {
        this.db = db;
    }

    public record Geo(String address, Double lat, Double lng, Integer distanceM, boolean approximate) {}

    public Optional<Geo> findOnline(int orderId) {
        List<Geo> rows =
                db.query(
                        """
                        SELECT delivery_address, delivery_lat, delivery_lng, delivery_distance_m, delivery_distance_approx
                        FROM orders WHERE order_id = ? AND order_type = 'Online'
                        """,
                        (rs, i) ->
                                new Geo(
                                        rs.getString("delivery_address"),
                                        rs.getObject("delivery_lat", Double.class),
                                        rs.getObject("delivery_lng", Double.class),
                                        rs.getObject("delivery_distance_m", Integer.class),
                                        rs.getBoolean("delivery_distance_approx")),
                        orderId);
        return rows.stream().findFirst();
    }

    public void save(int orderId, double lat, double lng, int distanceM, boolean approximate) {
        db.update(
                """
                UPDATE orders SET delivery_lat = ?, delivery_lng = ?, delivery_distance_m = ?, delivery_distance_approx = ?
                WHERE order_id = ?
                """,
                lat,
                lng,
                distanceM,
                approximate,
                orderId);
    }
}