package com.thors.module.order.repository;

import com.thors.module.order.dto.OrderViews.*;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/** Dùng các bảng orders, order_item, product_detail, product_image và user. */
@Repository
public class OrderRepository {
    private final JdbcTemplate db;

    public OrderRepository(JdbcTemplate db) {
        this.db = db;
    }

    public record Slice(List<ListItem> items, long total) {}

    /** Đơn kèm chủ đơn và loại đơn để Service kiểm tra quyền xem. */
    public record Found(int userId, String orderType, Detail detail) {}

    private static LocalDateTime time(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toLocalDateTime();
    }

    private final RowMapper<ListItem> listMapper =
            (rs, i) ->
                    new ListItem(
                            rs.getInt("order_id"),
                            rs.getString("order_number"),
                            time(rs, "order_date"),
                            rs.getString("order_status"),
                            rs.getString("preparation_status"),
                            rs.getString("payment_method"),
                            rs.getString("payment_status"),
                            rs.getLong("total_amount"),
                            rs.getString("delivery_name"),
                            rs.getString("delivery_phone"),
                            rs.getLong("item_count"),
                            rs.getString("first_item"),
                            List.of());

    /**
     * Danh sách đơn online. customerId != null thì chỉ lấy đơn của khách đó (Customer xem đơn của mình);
     * null thì lấy mọi đơn online (Owner, Family Member, Staff).
     */
    public Slice search(
            Integer customerId, String orderType, List<String> statuses, String q, int page, int size) {
        var where = new StringBuilder(" WHERE o.order_type = ?");
        List<Object> args = new ArrayList<>();
        args.add(orderType);
        if (customerId != null) {
            where.append(" AND o.user_id = ?");
            args.add(customerId);
        }
        if (statuses != null && !statuses.isEmpty()) {
            where.append(" AND o.order_status IN (")
                    .append(String.join(",", Collections.nCopies(statuses.size(), "?")))
                    .append(")");
            args.addAll(statuses);
        }
        if (q != null) {
            String like =
                    "%"
                            + q.toLowerCase()
                            .replace("\\", "\\\\")
                            .replace("%", "\\%")
                            .replace("_", "\\_")
                            + "%";
            where.append(
                    " AND (LOWER(o.order_number) LIKE ? OR LOWER(o.delivery_name) LIKE ? OR o.delivery_phone LIKE ?"
                            + " OR EXISTS (SELECT 1 FROM order_item sx WHERE sx.order_id = o.order_id"
                            + " AND LOWER(sx.product_name_snapshot) LIKE ?))");
            args.add(like);
            args.add(like);
            args.add(like);
            args.add(like);
        }

        Long total =
                db.queryForObject("SELECT COUNT(*) FROM orders o" + where, Long.class, args.toArray());

        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(size);
        pageArgs.add((long) page * size);

        List<ListItem> items =
                db.query(
                        """
                        SELECT o.order_id, o.order_number, o.order_date, o.order_status, o.preparation_status,
                               o.payment_method, o.payment_status, o.total_amount,
                               o.delivery_name, o.delivery_phone,
                               (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_item oi
                                 WHERE oi.order_id = o.order_id) AS item_count,
                               (SELECT oi.product_name_snapshot FROM order_item oi
                                 WHERE oi.order_id = o.order_id ORDER BY oi.order_item_id LIMIT 1) AS first_item
                        FROM orders o
                        """
                                + where
                                + " ORDER BY o.order_date DESC, o.order_id DESC LIMIT ? OFFSET ?",
                        listMapper,
                        pageArgs.toArray());

        Map<Integer, List<Preview>> previews = previews(items.stream().map(ListItem::id).toList());
        List<ListItem> withLines =
                items.stream().map(it -> it.withLines(previews.getOrDefault(it.id(), List.of()))).toList();
        return new Slice(withLines, total == null ? 0 : total);
    }

    /** includeStaffInfo = true thì kèm thông tin khách và người xác nhận (không trả cho Customer). */
    public Optional<Found> find(int orderId, boolean includeStaffInfo) {
        List<Found> rows =
                db.query(
                        """
                        SELECT o.*, cu.full_name AS customer_name, cu.email AS customer_email,
                               cu.phone AS customer_phone, cf.full_name AS confirmed_by_name
                        FROM orders o
                        JOIN `user` cu ON cu.user_id = o.user_id
                        LEFT JOIN `user` cf ON cf.user_id = o.confirmed_by
                        WHERE o.order_id = ?
                        """,
                        (rs, i) -> {
                            String carrier = rs.getString("shipping_carrier");
                            String tracking = rs.getString("tracking_number");
                            String shipStatus = rs.getString("shipment_status");
                            Shipment shipment =
                                    carrier == null && tracking == null && shipStatus == null
                                            ? null
                                            : new Shipment(
                                            carrier,
                                            tracking,
                                            shipStatus,
                                            time(rs, "shipment_created_at"),
                                            time(rs, "shipment_picked_up_at"),
                                            time(rs, "shipment_delivered_at"));
                            Customer customer =
                                    includeStaffInfo
                                            ? new Customer(
                                            rs.getInt("user_id"),
                                            rs.getString("customer_name"),
                                            rs.getString("customer_email"),
                                            rs.getString("customer_phone"))
                                            : null;
                            Detail detail =
                                    new Detail(
                                            rs.getInt("order_id"),
                                            rs.getString("order_number"),
                                            time(rs, "order_date"),
                                            rs.getString("order_status"),
                                            rs.getString("preparation_status"),
                                            rs.getString("payment_method"),
                                            rs.getString("payment_status"),
                                            time(rs, "payment_expires_at"),
                                            rs.getLong("items_amount"),
                                            rs.getString("promotion_name_snapshot"),
                                            rs.getLong("promotion_discount_amount"),
                                            rs.getString("coupon_code_snapshot"),
                                            rs.getLong("coupon_discount_amount"),
                                            rs.getLong("shipping_fee"),
                                            rs.getLong("total_amount"),
                                            rs.getString("delivery_name"),
                                            rs.getString("delivery_phone"),
                                            rs.getString("delivery_address"),
                                            time(rs, "confirmed_at"),
                                            includeStaffInfo ? rs.getString("confirmed_by_name") : null,
                                            time(rs, "cancelled_at"),
                                            rs.getString("cancel_reason"),
                                            shipment,
                                            customer,
                                            List.of());
                            return new Found(rs.getInt("user_id"), rs.getString("order_type"), detail);
                        },
                        orderId);

        if (rows.isEmpty()) return Optional.empty();
        Found found = rows.get(0);
        Detail d = found.detail();
        Detail withLines =
                new Detail(
                        d.id(),
                        d.orderNumber(),
                        d.orderDate(),
                        d.orderStatus(),
                        d.preparationStatus(),
                        d.paymentMethod(),
                        d.paymentStatus(),
                        d.paymentExpiresAt(),
                        d.itemsAmount(),
                        d.promotionName(),
                        d.promotionDiscountAmount(),
                        d.couponCode(),
                        d.couponDiscountAmount(),
                        d.shippingFee(),
                        d.totalAmount(),
                        d.deliveryName(),
                        d.deliveryPhone(),
                        d.deliveryAddress(),
                        d.confirmedAt(),
                        d.confirmedByName(),
                        d.cancelledAt(),
                        d.cancelReason(),
                        d.shipment(),
                        d.customer(),
                        lines(orderId));
        return Optional.of(new Found(found.userId(), found.orderType(), withLines));
    }

    private List<Line> lines(int orderId) {
        return db.query(
                """
                SELECT oi.order_item_id, oi.detail_id, pd.product_id, oi.product_name_snapshot,
                       oi.size_snapshot, oi.color_snapshot, oi.quantity, oi.unit_price,
                       (SELECT pi.image_url FROM product_image pi
                         WHERE pi.product_id = pd.product_id AND pi.deleted_at IS NULL
                         ORDER BY pi.is_primary DESC, pi.image_id LIMIT 1) AS image_url
                FROM order_item oi
                JOIN product_detail pd ON pd.detail_id = oi.detail_id
                WHERE oi.order_id = ?
                ORDER BY oi.order_item_id
                """,
                (rs, i) -> {
                    int quantity = rs.getInt("quantity");
                    long unitPrice = rs.getLong("unit_price");
                    return new Line(
                            rs.getInt("order_item_id"),
                            rs.getInt("detail_id"),
                            rs.getObject("product_id", Integer.class),
                            rs.getString("product_name_snapshot"),
                            rs.getString("size_snapshot"),
                            rs.getString("color_snapshot"),
                            quantity,
                            unitPrice,
                            quantity * unitPrice,
                            rs.getString("image_url"));
                },
                orderId);
    }

    // ------------------------------------------------------------------
    // Phần dành cho đơn mẫu (chỉ dùng khi test)
    // ------------------------------------------------------------------

    /** Tìm user_id theo email (dùng cho đơn mẫu của tài khoản test). */
    public Optional<Integer> findUserIdByEmail(String email) {
        List<Integer> ids =
                db.queryForList("SELECT user_id FROM `user` WHERE email = ?", Integer.class, email);
        return ids.stream().findFirst();
    }

    /**
     * Tạo một đơn Online mẫu (1 dòng sản phẩm lấy ngẫu nhiên). Trả về order_id, hoặc empty nếu
     * chưa có product_detail nào để tạo đơn.
     */
    public Optional<Integer> createSampleOrder(int userId, String orderNumber, int quantity) {
        // Ưu tiên biến thể đang bật bán online, nếu không có thì lấy biến thể bất kỳ
        List<Map<String, Object>> picked =
                db.queryForList(
                        """
                        SELECT pd.detail_id, p.product_name, pd.size, pd.color, pd.price
                        FROM product_detail pd
                        JOIN product p ON p.product_id = pd.product_id
                        ORDER BY pd.online_sales_enabled DESC, RAND() LIMIT 1
                        """);
        if (picked.isEmpty()) return Optional.empty();
        Map<String, Object> row = picked.get(0);
        long unitPrice = ((Number) row.get("price")).longValue();
        long items = unitPrice * quantity;
        long shipping = 30000;
        long total = items + shipping;

        KeyHolder keys = new GeneratedKeyHolder();
        db.update(
                con -> {
                    var ps =
                            con.prepareStatement(
                                    """
                                    INSERT INTO orders (user_id, created_by, order_number, order_type, order_date,
                                        order_status, preparation_status, payment_method, payment_status,
                                        items_amount, promotion_discount_amount, coupon_discount_amount,
                                        shipping_fee, total_amount,
                                        delivery_name, delivery_phone, delivery_address)
                                    VALUES (?, ?, ?, 'Online', NOW(), 'PENDING_CONFIRMATION', 'NOT_STARTED',
                                        'COD', 'UNPAID', ?, 0, 0, ?, ?,
                                        'Khách Mua Mẫu', '0987654321', '123 Đường Test, Hà Nội')
                                    """,
                                    Statement.RETURN_GENERATED_KEYS);
                    ps.setInt(1, userId);
                    ps.setInt(2, userId); // created_by: với đơn Online là chính khách đặt đơn
                    ps.setString(3, orderNumber);
                    ps.setLong(4, items);
                    ps.setLong(5, shipping);
                    ps.setLong(6, total);
                    return ps;
                },
                keys);
        int orderId = keys.getKey().intValue();

        db.update(
                """
                INSERT INTO order_item (order_id, detail_id, product_name_snapshot, size_snapshot,
                                        color_snapshot, quantity, unit_price)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                orderId,
                row.get("detail_id"),
                row.get("product_name"),
                row.get("size"),
                row.get("color"),
                quantity,
                unitPrice);
        return Optional.of(orderId);
    }

    // ------------------------------------------------------------------
    // Chuyển trạng thái đơn
    // ------------------------------------------------------------------

    /**
     * Chuyển đơn từ trạng thái {@code from} sang {@code to}, kèm các cột đi theo từng bước. Điều kiện
     * {@code order_status = from} trong WHERE chống hai người cùng đổi một đơn. Trả về false nếu đơn
     * không còn ở trạng thái {@code from}.
     */
    public boolean transition(
            int orderId, String from, String to, Integer actorId, String reason, String carrier) {
        var set = new StringBuilder("order_status = ?");
        List<Object> args = new ArrayList<>();
        args.add(to);
        switch (to) {
            case "AWAITING_PICKUP" -> {
                set.append(", confirmed_by = ?, confirmed_at = NOW()");
                args.add(actorId);
            }
            case "REJECTED", "CANCELLED" -> {
                set.append(", cancel_reason = ?, cancelled_at = NOW()");
                args.add(reason);
            }
            case "SHIPPING" -> {
                // SELF = cửa hàng tự giao (không có mã vận đơn); còn lại là đơn vị vận chuyển bên thứ ba
                boolean self = "SELF".equals(carrier);
                set.append(
                        ", shipping_carrier = ?, tracking_number = "
                                + (self ? "NULL" : "CONCAT('TRK-', order_number)")
                                + ", shipment_status = 'IN_TRANSIT', shipment_created_at = NOW(),"
                                + " shipment_picked_up_at = NOW(), shipment_updated_at = NOW()");
                args.add(carrier);
            }
            case "DELIVERED" ->
                    set.append(
                            ", shipment_status = 'DELIVERED', shipment_delivered_at = NOW(),"
                                    + " shipment_updated_at = NOW(),"
                                    + " payment_status = IF(payment_method = 'COD', 'PAID', payment_status)");
            default -> {}
        }
        args.add(orderId);
        args.add(from);
        return db.update("UPDATE orders SET " + set + " WHERE order_id = ? AND order_status = ?", args.toArray())
                > 0;
    }

    // ------------------------------------------------------------------
    // Dòng sản phẩm rút gọn cho danh sách đơn
    // ------------------------------------------------------------------

    private record PreviewRow(int orderId, Preview preview) {}

    /** Các dòng sản phẩm của nhiều đơn trong một truy vấn (hiện ảnh, tên, phân loại trong danh sách đơn). */
    private Map<Integer, List<Preview>> previews(List<Integer> orderIds) {
        Map<Integer, List<Preview>> byOrder = new HashMap<>();
        if (orderIds.isEmpty()) return byOrder;
        String marks = String.join(",", Collections.nCopies(orderIds.size(), "?"));
        List<PreviewRow> rows =
                db.query(
                        "SELECT oi.order_id, oi.product_name_snapshot, oi.size_snapshot, oi.color_snapshot,"
                                + " oi.quantity, oi.unit_price,"
                                + " (SELECT pi.image_url FROM product_image pi"
                                + "   WHERE pi.product_id = pd.product_id AND pi.deleted_at IS NULL"
                                + "   ORDER BY pi.is_primary DESC, pi.image_id LIMIT 1) AS image_url"
                                + " FROM order_item oi JOIN product_detail pd ON pd.detail_id = oi.detail_id"
                                + " WHERE oi.order_id IN (" + marks + ")"
                                + " ORDER BY oi.order_id, oi.order_item_id",
                        (rs, i) ->
                                new PreviewRow(
                                        rs.getInt("order_id"),
                                        new Preview(
                                                rs.getString("product_name_snapshot"),
                                                rs.getString("size_snapshot"),
                                                rs.getString("color_snapshot"),
                                                rs.getInt("quantity"),
                                                rs.getLong("unit_price"),
                                                rs.getString("image_url"))),
                        orderIds.toArray());
        for (PreviewRow r : rows) byOrder.computeIfAbsent(r.orderId(), k -> new ArrayList<>()).add(r.preview());
        return byOrder;
    }
}