package com.thors.module.facebook.repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/**
 * Truy vấn của luồng tạo đơn từ Facebook POS (FacebookService.createOrderFromFacebook).
 * Module Facebook không có bảng riêng (tin nhắn / hội thoại lấy từ Facebook Graph API, giữ trong RAM);
 * đơn được ghi vào bảng orders / order_item dùng chung với module Order.
 * Mọi câu lệnh chạy trong transaction của hàm gọi.
 */
@Repository
public class FacebookOrderRepository {

    private final JdbcTemplate jdbc;

    public FacebookOrderRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Dữ liệu một đơn Facebook mới (trạng thái chờ xác nhận, chưa thanh toán). */
    public record NewOrder(int actorId, String orderNumber, String status, String paymentMethod,
                           long itemsAmount, long totalAmount,
                           String deliveryName, String deliveryPhone, String deliveryAddress,
                           Double deliveryLat, Double deliveryLng) {
    }

    /**
     * Đọc biến thể kèm tên / trạng thái sản phẩm và KHÓA dòng (FOR UPDATE) để hai đơn chốt cùng lúc
     * không giữ quá số hàng có thể bán. Rỗng nếu không có biến thể.
     */
    public Optional<Map<String, Object>> lockVariant(int detailId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT pd.detail_id, pd.product_id, p.product_name, pd.size, pd.color, pd.price, pd.stock_quantity,
                       pd.status AS variant_status, p.status AS product_status
                FROM product_detail pd
                JOIN product p ON p.product_id = pd.product_id
                WHERE pd.detail_id = ?
                FOR UPDATE
                """, detailId);
        return rows.stream().findFirst();
    }

    /** Số hàng của biến thể đang giữ cho các đơn chưa xác nhận (reserved_quantity). */
    public int heldQuantity(int detailId) {
        Integer held = jdbc.queryForObject(
                "SELECT COALESCE(SUM(reserved_quantity), 0) FROM order_item WHERE detail_id = ? AND reserved_quantity > 0",
                Integer.class, detailId);
        return held == null ? 0 : held;
    }

    /** Thêm đơn vào bảng orders, trả order_id vừa tạo. */
    public int insertOrder(NewOrder o) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO orders (
                        user_id, created_by, order_number, order_type, order_date,
                        order_status, preparation_status, payment_method, payment_status,
                        items_amount, promotion_discount_amount, coupon_discount_amount,
                        shipping_fee, total_amount,
                        delivery_name, delivery_phone, delivery_address,
                        delivery_lat, delivery_lng
                    ) VALUES (
                        ?, ?, ?, 'Online', NOW(),
                        ?, 'NOT_STARTED', ?, 'UNPAID',
                        ?, 0, 0,
                        0, ?,
                        ?, ?, ?,
                        ?, ?
                    )
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, o.actorId());
            ps.setInt(2, o.actorId());
            ps.setString(3, o.orderNumber());
            ps.setString(4, o.status());
            ps.setString(5, o.paymentMethod());
            ps.setLong(6, o.itemsAmount());
            ps.setLong(7, o.totalAmount());
            ps.setString(8, o.deliveryName());
            ps.setString(9, o.deliveryPhone());
            ps.setString(10, o.deliveryAddress());
            ps.setObject(11, o.deliveryLat());
            ps.setObject(12, o.deliveryLng());
            return ps;
        }, keyHolder);
        return Objects.requireNonNull(keyHolder.getKey(), "Không lấy được mã đơn vừa tạo.").intValue();
    }

    /**
     * Thêm một dòng hàng. KHÔNG trừ tồn kho: chỉ GIỮ hàng (reserved_quantity = qty) cho đơn chờ xác nhận;
     * Owner xác nhận đơn (OrderService.changeStatus) mới trừ kho, hủy / từ chối / hết hạn thì trả lại phần giữ.
     */
    public void insertItem(int orderId, int detailId, Object productName, Object size, Object color,
                           int qty, long unitPrice) {
        jdbc.update("""
                INSERT INTO order_item (order_id, detail_id, product_name_snapshot, size_snapshot,
                                        color_snapshot, quantity, unit_price, reserved_quantity)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                orderId, detailId, productName, size, color, qty, unitPrice, qty);
    }
}
