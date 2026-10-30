package com.thors.module.returns.repository;

import com.thors.module.returns.dto.ReturnRequestResponse;
import com.thors.module.returns.dto.ReturnableOrderResponse;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class ReturnRepository {

    private final JdbcTemplate jdbcTemplate;

    public ReturnRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    // ==========================================
    // ORDER LOOKUP
    // ==========================================

    public Optional<ReturnableOrderResponse> findOrderByNumber(String orderNumber) {
        String sql = """
            SELECT 
                order_id,
                order_number,
                order_status,
                payment_status,
                delivery_name,
                delivery_phone,
                order_date,
                total_amount
            FROM orders
            WHERE order_number = ?
            """;

        try {
            ReturnableOrderResponse order = jdbcTemplate.queryForObject(
                sql,
                (rs, rowNum) -> {
                    ReturnableOrderResponse res = new ReturnableOrderResponse();
                    res.setOrderId(rs.getInt("order_id"));
                    res.setOrderNumber(rs.getString("order_number"));
                    res.setOrderStatus(rs.getString("order_status"));
                    res.setPaymentStatus(rs.getString("payment_status"));
                    res.setCustomerName(rs.getString("delivery_name"));
                    res.setCustomerPhone(rs.getString("delivery_phone"));
                    Timestamp ts = rs.getTimestamp("order_date");
                    res.setOrderDate(ts != null ? ts.toLocalDateTime() : null);
                    res.setTotalAmount(rs.getBigDecimal("total_amount"));
                    return res;
                },
                orderNumber
            );

            if (order != null) {
                order.setItems(findOrderItemsWithReturnedStats(order.getOrderId()));
            }

            return Optional.ofNullable(order);
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    public List<ReturnableOrderResponse.OrderItemDetail> findOrderItemsWithReturnedStats(int orderId) {
        String sql = """
            SELECT 
                oi.order_item_id,
                oi.detail_id,
                oi.product_name_snapshot,
                oi.size_snapshot,
                oi.color_snapshot,
                oi.quantity,
                oi.unit_price,
                COALESCE(SUM(CASE WHEN rr.status != 'REJECTED' THEN rri.quantity_returned ELSE 0 END), 0) AS returned_so_far
            FROM order_item oi
            LEFT JOIN return_request_item rri 
                ON oi.order_item_id = rri.order_item_id
            LEFT JOIN return_request rr 
                ON rri.return_request_id = rr.return_request_id
            WHERE oi.order_id = ?
            GROUP BY 
                oi.order_item_id,
                oi.detail_id,
                oi.product_name_snapshot,
                oi.size_snapshot,
                oi.color_snapshot,
                oi.quantity,
                oi.unit_price
            """;

        return jdbcTemplate.query(
            sql,
            (rs, rowNum) -> {
                ReturnableOrderResponse.OrderItemDetail item = new ReturnableOrderResponse.OrderItemDetail();
                item.setOrderItemId(rs.getInt("order_item_id"));
                item.setDetailId(rs.getInt("detail_id"));
                item.setProductName(rs.getString("product_name_snapshot"));
                item.setSize(rs.getString("size_snapshot"));
                item.setColor(rs.getString("color_snapshot"));
                int purchased = rs.getInt("quantity");
                int returned = rs.getInt("returned_so_far");
                item.setQuantityPurchased(purchased);
                item.setQuantityReturnedSoFar(returned);
                item.setQuantityReturnable(Math.max(0, purchased - returned));
                item.setUnitPrice(rs.getBigDecimal("unit_price"));
                return item;
            },
            orderId
        );
    }

    // ==========================================
    // INSERT RETURN REQUEST
    // ==========================================

    public int insertReturnRequest(
        int orderId,
        Integer userId,
        String reason,
        String status,
        LocalDateTime requestedAt,
        int createdBy,
        String requestType,
        String customerName,
        String customerPhone
    ) {
        String sql = """
            INSERT INTO return_request (
                order_id,
                user_id,
                reason,
                status,
                requested_at,
                created_by,
                request_type,
                customer_name,
                customer_phone
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """;

        KeyHolder keyHolder = new GeneratedKeyHolder();

        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, orderId);
            if (userId != null) {
                ps.setInt(2, userId);
            } else {
                ps.setNull(2, java.sql.Types.INTEGER);
            }
            ps.setString(3, reason);
            ps.setString(4, status);
            ps.setTimestamp(5, Timestamp.valueOf(requestedAt != null ? requestedAt : LocalDateTime.now()));
            ps.setInt(6, createdBy);
            ps.setString(7, requestType != null ? requestType : "RETURN");
            ps.setString(8, customerName);
            ps.setString(9, customerPhone);
            return ps;
        }, keyHolder);

        Number key = keyHolder.getKey();
        return key != null ? key.intValue() : 0;
    }

    public int insertReturnRequestItem(
        int returnRequestId,
        int orderItemId,
        int quantityReturned,
        String itemReason,
        int quantityReceived,
        int quantityRestocked,
        BigDecimal refundAmount
    ) {
        String sql = """
            INSERT INTO return_request_item (
                return_request_id,
                order_item_id,
                quantity_returned,
                item_reason,
                quantity_received,
                quantity_restocked,
                refund_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """;

        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(con -> {
            PreparedStatement ps = con.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, returnRequestId);
            ps.setInt(2, orderItemId);
            ps.setInt(3, quantityReturned);
            ps.setString(4, itemReason);
            ps.setInt(5, quantityReceived);
            ps.setInt(6, quantityRestocked);
            ps.setBigDecimal(7, refundAmount != null ? refundAmount : BigDecimal.ZERO);
            return ps;
        }, keyHolder);

        Number key = keyHolder.getKey();
        return key != null ? key.intValue() : 0;
    }

    // ==========================================
    // QUERY RETURN REQUESTS
    // ==========================================

    public List<ReturnRequestResponse> findReturnRequests(String status, String search, int offset, int limit) {
        StringBuilder sql = new StringBuilder("""
            SELECT 
                rr.return_request_id,
                rr.order_id,
                o.order_number,
                rr.user_id,
                rr.customer_name,
                rr.customer_phone,
                rr.reason,
                rr.status,
                rr.request_type,
                rr.requested_at,
                rr.processed_at,
                rr.created_by,
                cu.full_name AS created_by_name,
                rr.processed_by,
                pu.full_name AS processed_by_name,
                COALESCE((SELECT SUM(rri.refund_amount) FROM return_request_item rri WHERE rri.return_request_id = rr.return_request_id), 0) AS total_refund_amount
            FROM return_request rr
            JOIN orders o ON rr.order_id = o.order_id
            LEFT JOIN user cu ON rr.created_by = cu.user_id
            LEFT JOIN user pu ON rr.processed_by = pu.user_id
            WHERE 1=1
            """);

        List<Object> params = new ArrayList<>();

        if (status != null && !status.isBlank() && !"ALL".equalsIgnoreCase(status)) {
            sql.append(" AND rr.status = ? ");
            params.add(status.toUpperCase());
        }

        if (search != null && !search.isBlank()) {
            sql.append(" AND (o.order_number LIKE ? OR rr.customer_name LIKE ? OR rr.customer_phone LIKE ? OR rr.return_request_id = ?) ");
            String searchPattern = "%" + search.trim() + "%";
            params.add(searchPattern);
            params.add(searchPattern);
            params.add(searchPattern);
            try {
                params.add(Integer.parseInt(search.trim()));
            } catch (NumberFormatException e) {
                params.add(-1);
            }
        }

        sql.append(" ORDER BY rr.requested_at DESC LIMIT ? OFFSET ? ");
        params.add(limit);
        params.add(offset);

        List<ReturnRequestResponse> list = jdbcTemplate.query(sql.toString(), (rs, rowNum) -> {
            ReturnRequestResponse res = new ReturnRequestResponse();
            res.setReturnRequestId(rs.getInt("return_request_id"));
            res.setOrderId(rs.getInt("order_id"));
            res.setOrderNumber(rs.getString("order_number"));
            int uId = rs.getInt("user_id");
            res.setUserId(rs.wasNull() ? null : uId);
            res.setCustomerName(rs.getString("customer_name"));
            res.setCustomerPhone(rs.getString("customer_phone"));
            res.setReason(rs.getString("reason"));
            res.setStatus(rs.getString("status"));
            res.setRequestType(rs.getString("request_type"));

            Timestamp reqTs = rs.getTimestamp("requested_at");
            res.setRequestedAt(reqTs != null ? reqTs.toLocalDateTime() : null);

            Timestamp procTs = rs.getTimestamp("processed_at");
            res.setProcessedAt(procTs != null ? procTs.toLocalDateTime() : null);

            res.setCreatedBy(rs.getInt("created_by"));
            res.setCreatedByName(rs.getString("created_by_name"));

            int procBy = rs.getInt("processed_by");
            res.setProcessedBy(rs.wasNull() ? null : procBy);
            res.setProcessedByName(rs.getString("processed_by_name"));

            res.setTotalRefundAmount(rs.getBigDecimal("total_refund_amount"));
            return res;
        }, params.toArray());

        for (ReturnRequestResponse item : list) {
            item.setItems(findItemsByReturnRequestId(item.getReturnRequestId()));
        }

        return list;
    }

    public int countReturnRequests(String status, String search) {
        StringBuilder sql = new StringBuilder("""
            SELECT COUNT(*)
            FROM return_request rr
            JOIN orders o ON rr.order_id = o.order_id
            WHERE 1=1
            """);

        List<Object> params = new ArrayList<>();

        if (status != null && !status.isBlank() && !"ALL".equalsIgnoreCase(status)) {
            sql.append(" AND rr.status = ? ");
            params.add(status.toUpperCase());
        }

        if (search != null && !search.isBlank()) {
            sql.append(" AND (o.order_number LIKE ? OR rr.customer_name LIKE ? OR rr.customer_phone LIKE ? OR rr.return_request_id = ?) ");
            String searchPattern = "%" + search.trim() + "%";
            params.add(searchPattern);
            params.add(searchPattern);
            params.add(searchPattern);
            try {
                params.add(Integer.parseInt(search.trim()));
            } catch (NumberFormatException e) {
                params.add(-1);
            }
        }

        Integer count = jdbcTemplate.queryForObject(sql.toString(), Integer.class, params.toArray());
        return count != null ? count : 0;
    }

    public Optional<ReturnRequestResponse> findReturnRequestById(int returnRequestId) {
        String sql = """
            SELECT 
                rr.return_request_id,
                rr.order_id,
                o.order_number,
                rr.user_id,
                rr.customer_name,
                rr.customer_phone,
                rr.reason,
                rr.status,
                rr.request_type,
                rr.requested_at,
                rr.processed_at,
                rr.created_by,
                cu.full_name AS created_by_name,
                rr.processed_by,
                pu.full_name AS processed_by_name,
                COALESCE((SELECT SUM(rri.refund_amount) FROM return_request_item rri WHERE rri.return_request_id = rr.return_request_id), 0) AS total_refund_amount
            FROM return_request rr
            JOIN orders o ON rr.order_id = o.order_id
            LEFT JOIN user cu ON rr.created_by = cu.user_id
            LEFT JOIN user pu ON rr.processed_by = pu.user_id
            WHERE rr.return_request_id = ?
            """;

        try {
            ReturnRequestResponse res = jdbcTemplate.queryForObject(sql, (rs, rowNum) -> {
                ReturnRequestResponse r = new ReturnRequestResponse();
                r.setReturnRequestId(rs.getInt("return_request_id"));
                r.setOrderId(rs.getInt("order_id"));
                r.setOrderNumber(rs.getString("order_number"));
                int uId = rs.getInt("user_id");
                r.setUserId(rs.wasNull() ? null : uId);
                r.setCustomerName(rs.getString("customer_name"));
                r.setCustomerPhone(rs.getString("customer_phone"));
                r.setReason(rs.getString("reason"));
                r.setStatus(rs.getString("status"));
                r.setRequestType(rs.getString("request_type"));

                Timestamp reqTs = rs.getTimestamp("requested_at");
                r.setRequestedAt(reqTs != null ? reqTs.toLocalDateTime() : null);

                Timestamp procTs = rs.getTimestamp("processed_at");
                r.setProcessedAt(procTs != null ? procTs.toLocalDateTime() : null);

                r.setCreatedBy(rs.getInt("created_by"));
                r.setCreatedByName(rs.getString("created_by_name"));

                int procBy = rs.getInt("processed_by");
                r.setProcessedBy(rs.wasNull() ? null : procBy);
                r.setProcessedByName(rs.getString("processed_by_name"));

                r.setTotalRefundAmount(rs.getBigDecimal("total_refund_amount"));
                return r;
            }, returnRequestId);

            if (res != null) {
                res.setItems(findItemsByReturnRequestId(returnRequestId));
            }

            return Optional.ofNullable(res);
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    public List<ReturnRequestResponse.ItemDetail> findItemsByReturnRequestId(int returnRequestId) {
        String sql = """
            SELECT 
                rri.return_request_item_id,
                rri.order_item_id,
                oi.detail_id,
                oi.product_name_snapshot,
                oi.size_snapshot,
                oi.color_snapshot,
                oi.unit_price,
                oi.quantity AS quantity_purchased,
                rri.quantity_returned,
                rri.item_reason,
                rri.quantity_received,
                rri.quantity_restocked,
                rri.refund_amount
            FROM return_request_item rri
            JOIN order_item oi ON rri.order_item_id = oi.order_item_id
            WHERE rri.return_request_id = ?
            """;

        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            ReturnRequestResponse.ItemDetail item = new ReturnRequestResponse.ItemDetail();
            item.setReturnRequestItemId(rs.getInt("return_request_item_id"));
            item.setOrderItemId(rs.getInt("order_item_id"));
            item.setDetailId(rs.getInt("detail_id"));
            item.setProductName(rs.getString("product_name_snapshot"));
            item.setSize(rs.getString("size_snapshot"));
            item.setColor(rs.getString("color_snapshot"));
            item.setUnitPrice(rs.getBigDecimal("unit_price"));
            item.setQuantityPurchased(rs.getInt("quantity_purchased"));
            item.setQuantityReturned(rs.getInt("quantity_returned"));
            item.setItemReason(rs.getString("item_reason"));
            item.setQuantityReceived(rs.getInt("quantity_received"));
            item.setQuantityRestocked(rs.getInt("quantity_restocked"));
            item.setRefundAmount(rs.getBigDecimal("refund_amount"));
            return item;
        }, returnRequestId);
    }

    // ==========================================
    // STATUS & RESTOCK UPDATES
    // ==========================================

    public void updateReturnRequestStatus(int returnRequestId, String status, Integer processedBy, LocalDateTime processedAt) {
        String sql = """
            UPDATE return_request
            SET status = ?,
                processed_by = ?,
                processed_at = ?
            WHERE return_request_id = ?
            """;

        jdbcTemplate.update(
            sql,
            status,
            processedBy,
            processedAt != null ? Timestamp.valueOf(processedAt) : Timestamp.valueOf(LocalDateTime.now()),
            returnRequestId
        );
    }

    public void updateReturnRequestItem(int returnRequestItemId, int quantityReceived, int quantityRestocked, BigDecimal refundAmount) {
        String sql = """
            UPDATE return_request_item
            SET quantity_received = ?,
                quantity_restocked = ?,
                refund_amount = ?
            WHERE return_request_item_id = ?
            """;

        jdbcTemplate.update(
            sql,
            quantityReceived,
            quantityRestocked,
            refundAmount != null ? refundAmount : BigDecimal.ZERO,
            returnRequestItemId
        );
    }

    public void restockProductDetail(int detailId, int quantityRestocked) {
        String sql = """
            UPDATE product_detail
            SET stock_quantity = stock_quantity + ?
            WHERE detail_id = ?
            """;

        jdbcTemplate.update(sql, quantityRestocked, detailId);
    }

    public void insertStockAdjustmentRestock(
        int detailId,
        int quantity,
        int adjustedBy,
        String reason,
        Integer returnRequestItemId,
        String idempotencyKey
    ) {
        String sql = """
            INSERT INTO stock_adjustment (
                detail_id,
                movement_type,
                movement_quantity,
                quantity_change,
                adjusted_at,
                adjusted_by,
                reason,
                return_request_item_id,
                idempotency_key
            ) VALUES (?, 'RESTOCK', ?, ?, NOW(), ?, ?, ?, ?)
            """;

        jdbcTemplate.update(
            sql,
            detailId,
            quantity,
            quantity,
            adjustedBy,
            reason,
            (returnRequestItemId != null && returnRequestItemId > 0) ? returnRequestItemId : null,
            idempotencyKey
        );
    }

    public void updatePaymentRefund(int orderId, BigDecimal refundAmount) {
        // Update payment table if records exist for this order
        // Note: payment.payment_status only allows 'PENDING','SUCCESS','FAILED','EXPIRED' per ck_payment_2
        String sqlPayment = """
            UPDATE payment
            SET refunded_amount = LEAST(amount, refunded_amount + ?)
            WHERE order_id = ?
            """;

        jdbcTemplate.update(sqlPayment, refundAmount, orderId);

        // Update orders payment_status
        String sqlOrder = """
            UPDATE orders
            SET payment_status = CASE 
                WHEN total_amount <= (
                    SELECT COALESCE(SUM(rri.refund_amount), 0) 
                    FROM return_request_item rri 
                    JOIN return_request rr ON rri.return_request_id = rr.return_request_id 
                    WHERE rr.order_id = ? AND rr.status = 'COMPLETED'
                ) THEN 'REFUNDED' 
                ELSE 'PARTIALLY_REFUNDED' 
            END
            WHERE order_id = ?
            """;

        jdbcTemplate.update(sqlOrder, orderId, orderId);
    }

    // ==========================================
    // SAMPLE SEEDER FOR TESTING
    // ==========================================

    public Map<String, Object> seedSampleOrder(int sellerUserId) {
        // Check if there is an active product with variants
        List<Map<String, Object>> variants = jdbcTemplate.queryForList("""
            SELECT pd.detail_id, pd.price, pd.size, pd.color, p.product_name 
            FROM product_detail pd 
            JOIN product p ON pd.product_id = p.product_id 
            WHERE p.status = 'ACTIVE' AND pd.status = 'ACTIVE' 
            LIMIT 2
            """);

        if (variants.isEmpty()) {
            throw new IllegalStateException("Không tìm thấy biến thể sản phẩm hoạt động nào để tạo đơn hàng mẫu.");
        }

        String orderNumber = "ORD-" + System.currentTimeMillis();
        BigDecimal totalAmount = BigDecimal.ZERO;

        KeyHolder keyHolder = new GeneratedKeyHolder();
        String sqlOrder = """
            INSERT INTO orders (
                order_number, order_type, user_id, delivery_name, delivery_phone,
                delivery_address, order_date, order_status, total_amount, created_by,
                confirmed_by, confirmed_at, stock_deducted_at, payment_method,
                payment_status, items_amount
            ) VALUES (?, 'In-Store', ?, 'Khách Mua Mẫu', '0987654321', 'Tại quầy THORS',
                      NOW(), 'COMPLETED', 0, ?, ?, NOW(), NOW(), 'CASH', 'PAID', 0)
            """;

        jdbcTemplate.update(con -> {
            PreparedStatement ps = con.prepareStatement(sqlOrder, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, orderNumber);
            ps.setInt(2, sellerUserId);
            ps.setInt(3, sellerUserId);
            ps.setInt(4, sellerUserId);
            return ps;
        }, keyHolder);

        Number key = keyHolder.getKey();
        int orderId = key != null ? key.intValue() : 0;

        for (Map<String, Object> v : variants) {
            int detailId = ((Number) v.get("detail_id")).intValue();
            BigDecimal price = v.get("price") != null ? new BigDecimal(v.get("price").toString()) : new BigDecimal("250000");
            String pName = (String) v.get("product_name");
            String size = (String) v.get("size");
            String color = (String) v.get("color");

            int qty = 3;
            totalAmount = totalAmount.add(price.multiply(BigDecimal.valueOf(qty)));

            jdbcTemplate.update("""
                INSERT INTO order_item (
                    order_id, detail_id, quantity, unit_price,
                    product_name_snapshot, size_snapshot, color_snapshot, reserved_quantity
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                """, orderId, detailId, qty, price, pName, size, color);

            // Trừ kho khi xuất bán đơn hàng mẫu (để khi hoàn hàng nhập lại thì tồn kho cân bằng hoàn hảo, không bị tăng ảo)
            jdbcTemplate.update("""
                UPDATE product_detail 
                SET stock_quantity = GREATEST(0, stock_quantity - ?) 
                WHERE detail_id = ?
                """, qty, detailId);

            String idempotencyKey = "ORDER_OUT:" + orderNumber + ":" + detailId;
            jdbcTemplate.update("""
                INSERT INTO stock_adjustment (
                    detail_id, movement_type, quantity_change, movement_quantity,
                    adjusted_at, adjusted_by, reason, idempotency_key
                ) VALUES (?, 'ORDER_OUT', ?, ?, NOW(), ?, ?, ?)
                """, detailId, -qty, qty, sellerUserId, "Xuất kho cho đơn bán hàng mẫu " + orderNumber, idempotencyKey);
        }

        jdbcTemplate.update("""
            UPDATE orders 
            SET total_amount = ?, items_amount = ? 
            WHERE order_id = ?
            """, totalAmount, totalAmount, orderId);

        // Also insert sample payment
        jdbcTemplate.update("""
            INSERT INTO payment (
                order_id, transaction_ref, payment_method, payment_status,
                amount, attempted_at, paid_at, refunded_amount
            ) VALUES (?, ?, 'CASH', 'SUCCESS', ?, NOW(), NOW(), 0)
            """, orderId, "PAY-" + System.currentTimeMillis(), totalAmount);

        return Map.of(
            "orderId", orderId,
            "orderNumber", orderNumber,
            "totalAmount", totalAmount,
            "message", "Đã tạo đơn hàng mẫu thành công để kiểm thử hoàn hàng!"
        );
    }
}


