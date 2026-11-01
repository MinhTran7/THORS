package com.thors.module.order.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Map;

@Repository
public class CheckoutRepository {

    private final JdbcTemplate jdbcTemplate;

    public CheckoutRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Thông tin một biến thể để đặt hàng: tên, size, màu, giá, tồn kho còn bán và có được bán online không.
     * Tồn kho tính giống CartRepository (trừ lượng đang giữ của các đơn TEMPORARY / PAID).
     * Trả về null nếu không tồn tại.
     */
    public Map<String, Object> findDetailForOrder(int detailId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
            SELECT
                pd.detail_id AS detailId,
                p.product_name AS productName,
                pd.size AS size,
                pd.color AS color,
                pd.price AS price,
                GREATEST(
                    pd.stock_quantity - COALESCE((
                        SELECT SUM(oi.reserved_quantity)
                        FROM order_item oi
                        INNER JOIN orders o ON o.order_id = oi.order_id
                        WHERE oi.detail_id = pd.detail_id
                          AND o.stock_hold_status IN ('TEMPORARY', 'PAID')
                    ), 0),
                    0
                ) AS stock,
                (p.status = 'ACTIVE'
                 AND pd.status = 'ACTIVE'
                 AND pd.online_sales_enabled = 1) AS available
            FROM product_detail pd
            INNER JOIN product p ON p.product_id = pd.product_id
            WHERE pd.detail_id = ?
            """, detailId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Tạo đơn online COD, chờ chủ cửa hàng xác nhận. Trả về order_id. */
    public int insertOrder(String orderNumber, int userId,
                           String deliveryName, String deliveryPhone, String deliveryAddress,
                           BigDecimal itemsAmount, BigDecimal shippingFee, BigDecimal totalAmount) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                INSERT INTO orders
                    (order_number, order_type, user_id, delivery_name, delivery_phone, delivery_address,
                     order_status, total_amount, created_by, payment_method, payment_status,
                     items_amount, shipping_fee)
                VALUES (?, 'Online', ?, ?, ?, ?,
                        'PENDING_CONFIRMATION', ?, ?, 'COD', 'UNPAID',
                        ?, ?)
                """, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, orderNumber);
            ps.setInt(2, userId);
            ps.setString(3, deliveryName);
            ps.setString(4, deliveryPhone);
            ps.setString(5, deliveryAddress);
            ps.setBigDecimal(6, totalAmount);
            ps.setInt(7, userId);
            ps.setBigDecimal(8, itemsAmount);
            ps.setBigDecimal(9, shippingFee);
            return ps;
        }, keyHolder);
        Number key = keyHolder.getKey();
        return key == null ? 0 : key.intValue();
    }

    /** Thêm một dòng sản phẩm vào đơn, chốt giá và tên tại thời điểm đặt. */
    public void insertItem(int orderId, int detailId, int quantity, BigDecimal unitPrice,
                           String productName, String size, String color) {
        jdbcTemplate.update("""
            INSERT INTO order_item
                (order_id, detail_id, quantity, unit_price,
                 product_name_snapshot, size_snapshot, color_snapshot, reserved_quantity)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)
            """, orderId, detailId, quantity, unitPrice, productName, size, color);
    }
}