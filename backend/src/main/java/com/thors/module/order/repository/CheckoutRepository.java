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

    public Map<String, Object> findDetailForOrder(int detailId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
            SELECT
                pd.detail_id AS detailId,
                p.product_id AS productId,
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

    public int insertOrder(String orderNumber, int userId,
                           String deliveryName, String deliveryPhone, String deliveryAddress,
                           BigDecimal itemsAmount, BigDecimal shippingFee, BigDecimal totalAmount) {
        return insertOrder(orderNumber, userId, deliveryName, deliveryPhone, deliveryAddress, itemsAmount, shippingFee, totalAmount, "COD");
    }

    public int insertOrder(String orderNumber, int userId,
                           String deliveryName, String deliveryPhone, String deliveryAddress,
                           BigDecimal itemsAmount, BigDecimal shippingFee, BigDecimal totalAmount,
                           String paymentMethod) {
        return insertOrder(orderNumber, userId, deliveryName, deliveryPhone, deliveryAddress,
                itemsAmount, shippingFee, totalAmount, paymentMethod, null, null, BigDecimal.ZERO);
    }

    public int insertOrder(String orderNumber, int userId,
                           String deliveryName, String deliveryPhone, String deliveryAddress,
                           BigDecimal itemsAmount, BigDecimal shippingFee, BigDecimal totalAmount,
                           String paymentMethod, Integer promotionId, String promotionName, BigDecimal promotionDiscount) {
        String method = "ONLINE".equalsIgnoreCase(paymentMethod) ? "ONLINE" : "COD";
        String status = "ONLINE".equals(method) ? "AWAITING_PAYMENT" : "PENDING_CONFIRMATION";
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                INSERT INTO orders
                    (order_number, order_type, user_id, delivery_name, delivery_phone, delivery_address,
                     order_status, total_amount, created_by, payment_method, payment_status,
                     items_amount, shipping_fee, promotion_id, promotion_name_snapshot, promotion_discount_amount)
                VALUES (?, 'Online', ?, ?, ?, ?,
                        ?, ?, ?, ?, 'UNPAID',
                        ?, ?, ?, ?, ?)
                """, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, orderNumber);
            ps.setInt(2, userId);
            ps.setString(3, deliveryName);
            ps.setString(4, deliveryPhone);
            ps.setString(5, deliveryAddress);
            ps.setString(6, status);
            ps.setBigDecimal(7, totalAmount);
            ps.setInt(8, userId);
            ps.setString(9, method);
            ps.setBigDecimal(10, itemsAmount);
            ps.setBigDecimal(11, shippingFee);
            if (promotionId != null) {
                ps.setInt(12, promotionId);
            } else {
                ps.setNull(12, java.sql.Types.INTEGER);
            }
            ps.setString(13, promotionName);
            ps.setBigDecimal(14, promotionDiscount != null ? promotionDiscount : BigDecimal.ZERO);
            return ps;
        }, keyHolder);
        Number key = keyHolder.getKey();
        return key == null ? 0 : key.intValue();
    }

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
