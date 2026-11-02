package com.thors.module.payment.repository;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class PaymentRepository {

    private final JdbcTemplate db;

    public PaymentRepository(JdbcTemplate db) {
        this.db = db;
    }

    public record PaymentRecord(
            int paymentId,
            int orderId,
            String transactionRef,
            String paymentMethod,
            String paymentStatus,
            long amount,
            LocalDateTime attemptedAt,
            String provider,
            LocalDateTime paidAt,
            String failureReason
    ) {}

    public record OrderPayable(
            int orderId,
            String orderNumber,
            int userId,
            long totalAmount,
            String paymentStatus,
            String orderStatus,
            String paymentMethod,
            String deliveryName,
            String deliveryPhone,
            String deliveryAddress
    ) {}

    public record OrderItemSimple(
            String name,
            int quantity,
            long price
    ) {}

    public Optional<OrderPayable> findOrderPayable(int orderId) {
        String sql = """
            SELECT order_id, order_number, user_id, total_amount, payment_status,
                   order_status, payment_method, delivery_name, delivery_phone, delivery_address
            FROM orders
            WHERE order_id = ?
        """;
        try {
            OrderPayable order = db.queryForObject(sql, (rs, i) -> new OrderPayable(
                    rs.getInt("order_id"),
                    rs.getString("order_number"),
                    rs.getInt("user_id"),
                    rs.getLong("total_amount"),
                    rs.getString("payment_status"),
                    rs.getString("order_status"),
                    rs.getString("payment_method"),
                    rs.getString("delivery_name"),
                    rs.getString("delivery_phone"),
                    rs.getString("delivery_address")
            ), orderId);
            return Optional.ofNullable(order);
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    public List<OrderItemSimple> findOrderItems(int orderId) {
        String sql = """
            SELECT product_name_snapshot, quantity, unit_price
            FROM order_item
            WHERE order_id = ?
        """;
        return db.query(sql, (rs, i) -> new OrderItemSimple(
                rs.getString("product_name_snapshot"),
                rs.getInt("quantity"),
                rs.getLong("unit_price")
        ), orderId);
    }

    public void insertPaymentAttempt(int orderId, String transactionRef, long amount, String provider) {
        String sql = """
            INSERT INTO payment (order_id, transaction_ref, payment_method, payment_status, amount, provider, attempted_at)
            VALUES (?, ?, 'ONLINE', 'PENDING', ?, ?, NOW())
        """;
        db.update(sql, orderId, transactionRef, amount, provider);
    }

    public Optional<PaymentRecord> findByTransactionRef(String transactionRef) {
        String sql = """
            SELECT payment_id, order_id, transaction_ref, payment_method, payment_status,
                   amount, attempted_at, provider, paid_at, failure_reason
            FROM payment
            WHERE transaction_ref = ?
        """;
        try {
            PaymentRecord rec = db.queryForObject(sql, (rs, i) -> new PaymentRecord(
                    rs.getInt("payment_id"),
                    rs.getInt("order_id"),
                    rs.getString("transaction_ref"),
                    rs.getString("payment_method"),
                    rs.getString("payment_status"),
                    rs.getLong("amount"),
                    rs.getTimestamp("attempted_at") != null ? rs.getTimestamp("attempted_at").toLocalDateTime() : null,
                    rs.getString("provider"),
                    rs.getTimestamp("paid_at") != null ? rs.getTimestamp("paid_at").toLocalDateTime() : null,
                    rs.getString("failure_reason")
            ), transactionRef);
            return Optional.ofNullable(rec);
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    public Optional<PaymentRecord> findLatestByOrderId(int orderId) {
        String sql = """
            SELECT payment_id, order_id, transaction_ref, payment_method, payment_status,
                   amount, attempted_at, provider, paid_at, failure_reason
            FROM payment
            WHERE order_id = ?
            ORDER BY payment_id DESC
            LIMIT 1
        """;
        try {
            PaymentRecord rec = db.queryForObject(sql, (rs, i) -> new PaymentRecord(
                    rs.getInt("payment_id"),
                    rs.getInt("order_id"),
                    rs.getString("transaction_ref"),
                    rs.getString("payment_method"),
                    rs.getString("payment_status"),
                    rs.getLong("amount"),
                    rs.getTimestamp("attempted_at") != null ? rs.getTimestamp("attempted_at").toLocalDateTime() : null,
                    rs.getString("provider"),
                    rs.getTimestamp("paid_at") != null ? rs.getTimestamp("paid_at").toLocalDateTime() : null,
                    rs.getString("failure_reason")
            ), orderId);
            return Optional.ofNullable(rec);
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    public void markPaymentSuccess(String transactionRef) {
        String sql = """
            UPDATE payment
            SET payment_status = 'SUCCESS', paid_at = NOW(), failure_reason = NULL
            WHERE transaction_ref = ?
        """;
        db.update(sql, transactionRef);
    }

    public void markPaymentFailed(String transactionRef, String reason) {
        String sql = """
            UPDATE payment
            SET payment_status = 'FAILED', failure_reason = ?
            WHERE transaction_ref = ?
        """;
        db.update(sql, reason, transactionRef);
    }

    public void markOrderPaid(int orderId) {
        String sql = """
            UPDATE orders
            SET payment_status = 'PAID',
                order_status = CASE WHEN order_status = 'AWAITING_PAYMENT' THEN 'PENDING_CONFIRMATION' ELSE order_status END
            WHERE order_id = ?
        """;
        db.update(sql, orderId);
    }
}

