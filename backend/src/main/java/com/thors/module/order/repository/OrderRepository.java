package com.thors.module.order.repository;

import com.thors.module.order.dto.OrderViews.*;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
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

    /** Giờ Việt Nam: khách lọc theo ngày VN, còn DB lưu giờ UTC. */
    private static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");

    /**
     * Đọc nguyên giá trị UTC trong DB. Không dùng getTimestamp().toLocalDateTime() vì nó đổi sang múi giờ
     * của máy chạy backend (máy dev ở VN sẽ lệch 7 tiếng khi frontend coi giá trị là UTC).
     */
    private static LocalDateTime time(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column, LocalDateTime.class);
    }

    /** 0h của ngày {@code day} theo giờ VN, đổi ra giờ UTC để so với cột trong DB. */
    private static LocalDateTime vnStartOfDayUtc(LocalDate day) {
        return day.atStartOfDay(VN).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
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
                            rs.getString("delivery_address"),
                            rs.getLong("item_count"),
                            rs.getString("first_item"),
                            rs.getString("shipping_carrier"),
                            List.of());

    /**
     * Danh sách đơn online. customerId != null thì chỉ lấy đơn của khách đó (Customer xem đơn của mình);
     * null thì lấy mọi đơn online (Owner, Family Member, Staff).
     *
     * <p>dateFrom / dateTo (có thể null): lọc theo ngày đặt, gồm cả hai ngày đầu cuối. paymentFilter
     * (có thể null): lọc đúng giá trị cột payment_method (COD, ONLINE, CASH).
     */
    public Slice search(
            Integer customerId,
            String orderType,
            List<String> statuses,
            String q,
            LocalDate dateFrom,
            LocalDate dateTo,
            String paymentFilter,
            int page,
            int size) {
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
        if (dateFrom != null) {
            where.append(" AND o.order_date >= ?");
            args.add(vnStartOfDayUtc(dateFrom));
        }
        if (dateTo != null) {
            // Nhỏ hơn 0h của ngày kế tiếp để lấy trọn cả ngày dateTo
            where.append(" AND o.order_date < ?");
            args.add(vnStartOfDayUtc(dateTo.plusDays(1)));
        }
        if (paymentFilter != null) {
            where.append(" AND o.payment_method = ?");
            args.add(paymentFilter);
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
                               o.delivery_name, o.delivery_phone, o.delivery_address, o.shipping_carrier,
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
    // Gửi vận đơn qua đơn vị vận chuyển (GHN)
    // ------------------------------------------------------------------

    /** Thông tin đơn cần để tạo vận đơn. */
    public record ShipInput(
            String orderNumber,
            String name,
            String phone,
            String address,
            Integer districtId,
            String wardCode,
            String paymentMethod,
            String paymentStatus,
            long totalAmount,
            Integer weightG) {}

    /** Một dòng hàng gửi kèm vận đơn. */
    public record ShipItem(String name, String code, int quantity, long price) {}

    public Optional<ShipInput> findShipInput(int orderId) {
        List<ShipInput> rows =
                db.query(
                        """
                        SELECT order_number, delivery_name, delivery_phone, delivery_address,
                               delivery_district_id, delivery_ward_code, payment_method, payment_status,
                               total_amount, package_weight_g
                        FROM orders WHERE order_id = ?
                        """,
                        (rs, i) ->
                                new ShipInput(
                                        rs.getString("order_number"),
                                        rs.getString("delivery_name"),
                                        rs.getString("delivery_phone"),
                                        rs.getString("delivery_address"),
                                        rs.getObject("delivery_district_id", Integer.class),
                                        rs.getString("delivery_ward_code"),
                                        rs.getString("payment_method"),
                                        rs.getString("payment_status"),
                                        rs.getLong("total_amount"),
                                        rs.getObject("package_weight_g", Integer.class)),
                        orderId);
        return rows.stream().findFirst();
    }

    public List<ShipItem> shipItems(int orderId) {
        return db.query(
                """
                SELECT oi.product_name_snapshot, oi.size_snapshot, oi.color_snapshot, oi.detail_id,
                       oi.quantity, oi.unit_price
                FROM order_item oi WHERE oi.order_id = ? ORDER BY oi.order_item_id
                """,
                (rs, i) -> {
                    StringBuilder name = new StringBuilder(rs.getString("product_name_snapshot"));
                    String size = rs.getString("size_snapshot");
                    String color = rs.getString("color_snapshot");
                    if (size != null && !size.isBlank()) name.append(" - ").append(size);
                    if (color != null && !color.isBlank()) name.append(" - ").append(color);
                    return new ShipItem(
                            name.toString(),
                            String.valueOf(rs.getInt("detail_id")),
                            rs.getInt("quantity"),
                            rs.getLong("unit_price"));
                },
                orderId);
    }

    /**
     * Lưu vận đơn thật của đơn vị vận chuyển. Đơn vẫn giữ trạng thái {@code from} (Chờ lấy hàng) cho tới
     * khi bên vận chuyển báo đã lấy hàng. Điều kiện order_status = from và chưa có mã vận đơn chống hai
     * người cùng gửi một đơn. Trả về false nếu không lưu được.
     */
    public boolean shipWithCarrier(
            int orderId,
            String from,
            String carrier,
            String trackingNumber,
            String serviceCode,
            long carrierFee,
            long codAmount,
            int weightG,
            int districtId,
            String wardCode) {
        return db.update(
                        """
                        UPDATE orders SET shipping_carrier = ?,
                               tracking_number = ?, provider_shipment_id = ?, shipping_service_code = ?,
                               carrier_shipping_fee = ?, cod_amount = ?, package_weight_g = ?,
                               delivery_district_id = ?, delivery_ward_code = ?,
                               shipment_status = 'CREATED', shipment_created_at = NOW(),
                               shipment_picked_up_at = NULL, shipment_updated_at = NOW()
                        WHERE order_id = ? AND order_status = ? AND tracking_number IS NULL
                        """,
                        carrier,
                        trackingNumber,
                        trackingNumber,
                        serviceCode,
                        carrierFee,
                        codAmount,
                        weightG,
                        districtId,
                        wardCode,
                        orderId,
                        from)
                > 0;
    }

    /** Đơn đã gửi đơn vị vận chuyển, dùng khi nhận cập nhật trạng thái giao từ bên đó. */
    public record Tracked(
            int orderId,
            int userId,
            String orderNumber,
            String orderStatus,
            String shipmentStatus,
            String lastEventId,
            LocalDateTime shipmentUpdatedAt) {}

    private final RowMapper<Tracked> trackedMapper =
            (rs, i) ->
                    new Tracked(
                            rs.getInt("order_id"),
                            rs.getInt("user_id"),
                            rs.getString("order_number"),
                            rs.getString("order_status"),
                            rs.getString("shipment_status"),
                            rs.getString("shipment_last_event_id"),
                            time(rs, "shipment_updated_at"));

    private static final String TRACKED_COLUMNS =
            "order_id, user_id, order_number, order_status, shipment_status, shipment_last_event_id,"
                    + " shipment_updated_at";

    /** Khóa dòng (FOR UPDATE) để hai cập nhật cùng lúc của một vận đơn không ghi đè nhau. */
    public Optional<Tracked> findByTrackingForUpdate(String carrier, String trackingNumber) {
        return db.query(
                        "SELECT " + TRACKED_COLUMNS
                                + " FROM orders WHERE shipping_carrier = ? AND tracking_number = ? FOR UPDATE",
                        trackedMapper,
                        carrier,
                        trackingNumber)
                .stream()
                .findFirst();
    }

    /** Mã vận đơn của các đơn đang giao qua carrier mà trạng thái giao chưa kết thúc. */
    public List<String> activeTrackingNumbers(String carrier) {
        return db.queryForList(
                """
                SELECT tracking_number FROM orders
                WHERE shipping_carrier = ? AND tracking_number IS NOT NULL
                  AND order_status IN ('AWAITING_PICKUP', 'SHIPPING', 'DELIVERED')
                  AND (shipment_status IS NULL OR shipment_status NOT IN ('DELIVERED', 'RETURNED', 'CANCELLED'))
                ORDER BY shipment_updated_at
                """,
                String.class,
                carrier);
    }

    /**
     * Ghi trạng thái giao mới. pickedUp / delivered = true thì ghi mốc lấy hàng / giao thành công (chỉ
     * ghi lần đầu).
     */
    public void applyShipmentEvent(
            int orderId,
            String shipmentStatus,
            String eventId,
            LocalDateTime eventTime,
            boolean pickedUp,
            boolean delivered) {
        // eventTime là giờ UTC; truyền LocalDateTime để driver ghi nguyên giá trị, không đổi theo múi giờ máy
        LocalDateTime at = eventTime;
        db.update(
                """
                UPDATE orders SET shipment_status = ?, shipment_last_event_id = ?, shipment_updated_at = ?,
                       shipment_picked_up_at = IF(? AND shipment_picked_up_at IS NULL, ?, shipment_picked_up_at),
                       shipment_delivered_at = IF(? AND shipment_delivered_at IS NULL, ?, shipment_delivered_at)
                WHERE order_id = ?
                """,
                shipmentStatus,
                eventId,
                at,
                pickedUp,
                at,
                delivered,
                at,
                orderId);
    }

    /** Đơn vị vận chuyển báo đã lấy hàng: AWAITING_PICKUP -> SHIPPING. */
    public boolean markShippingByCarrier(int orderId) {
        return db.update(
                        "UPDATE orders SET order_status = 'SHIPPING' WHERE order_id = ? AND order_status = 'AWAITING_PICKUP'",
                        orderId)
                > 0;
    }

    /**
     * Đơn vị vận chuyển báo đã giao: AWAITING_PICKUP / SHIPPING -> DELIVERED (có thể lỡ sự kiện lấy
     * hàng), đơn COD coi như đã thu tiền.
     */
    public boolean markDeliveredByCarrier(int orderId) {
        return db.update(
                        """
                        UPDATE orders SET order_status = 'DELIVERED',
                               payment_status = IF(payment_method = 'COD', 'PAID', payment_status)
                        WHERE order_id = ? AND order_status IN ('AWAITING_PICKUP', 'SHIPPING')
                        """,
                        orderId)
                > 0;
    }

    /** Đơn vị vận chuyển hủy vận đơn: đơn đang chờ lấy / đang giao chuyển sang CANCELLED. */
    public boolean markCancelledByCarrier(int orderId, String reason) {
        return db.update(
                        """
                        UPDATE orders SET order_status = 'CANCELLED', cancel_reason = ?, cancelled_at = NOW()
                        WHERE order_id = ? AND order_status IN ('AWAITING_PICKUP', 'SHIPPING')
                        """,
                        reason,
                        orderId)
                > 0;
    }

    /** Đơn vị vận chuyển của đơn (null nếu chưa gửi). */
    public Optional<String> carrierOf(int orderId) {
        return db.queryForList("SELECT shipping_carrier FROM orders WHERE order_id = ?", String.class, orderId)
                .stream()
                .filter(java.util.Objects::nonNull)
                .findFirst();
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
            case "REJECTED", "CANCELLED", "EXPIRED" -> {
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
        boolean changed =
                db.update("UPDATE orders SET " + set + " WHERE order_id = ? AND order_status = ?", args.toArray())
                        > 0;
        // Đơn đóng mà chưa trừ kho: trả lại phần hàng đang giữ (order_item.reserved_quantity, vd. đơn Facebook
        // giữ hàng khi chốt) để màn hình Tồn kho / đơn khác bán được. Đơn đã trừ kho thì phần giữ đã về 0.
        if (changed && ("REJECTED".equals(to) || "CANCELLED".equals(to) || "EXPIRED".equals(to)))
            db.update("UPDATE order_item SET reserved_quantity = 0 WHERE order_id = ?", orderId);
        return changed;
    }

    // ------------------------------------------------------------------
    // Trừ kho khi Owner xác nhận đơn online
    // ------------------------------------------------------------------

    /** Dòng hàng cần xuất kho của một đơn: số lượng và phần đang giữ chỗ cho chính dòng đó. */
    public record StockLine(int orderItemId, int detailId, int quantity, int reserved) {}

    /**
     * Các dòng của đơn chưa trừ kho: đơn đã đánh dấu trừ kho trả về rỗng, dòng đã có thẻ kho "Xuất bán"
     * (vd. đơn Facebook đã trừ khi tạo) cũng bỏ qua, để không trừ hai lần.
     */
    public List<StockLine> unshippedLines(int orderId) {
        return db.query(
                "SELECT oi.order_item_id, oi.detail_id, oi.quantity, oi.reserved_quantity"
                        + " FROM order_item oi JOIN orders o ON o.order_id = oi.order_id"
                        + " WHERE oi.order_id = ? AND o.stock_deducted_at IS NULL"
                        + " AND NOT EXISTS (SELECT 1 FROM stock_adjustment sa"
                        + "   WHERE sa.order_item_id = oi.order_item_id AND sa.movement_type = 'ORDER_OUT')"
                        + " ORDER BY oi.order_item_id",
                (rs, i) ->
                        new StockLine(
                                rs.getInt("order_item_id"),
                                rs.getInt("detail_id"),
                                rs.getInt("quantity"),
                                rs.getInt("reserved_quantity")),
                orderId);
    }

    /** Đánh dấu đơn đã trừ kho; phần giữ chỗ (nếu có) đã được dùng hết. */
    public void markStockDeducted(int orderId) {
        db.update("UPDATE order_item SET reserved_quantity = 0 WHERE order_id = ?", orderId);
        db.update(
                "UPDATE orders SET stock_deducted_at = NOW(),"
                        + " stock_hold_status = IF(stock_hold_status IN ('TEMPORARY','PAID'), 'CONSUMED', stock_hold_status),"
                        + " stock_hold_closed_at = IF(stock_hold_status = 'CONSUMED' AND stock_hold_closed_at IS NULL,"
                        + " NOW(), stock_hold_closed_at)"
                        + " WHERE order_id = ? AND stock_deducted_at IS NULL",
                orderId);
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

    // ------------------------------------------------------------------
    // Việc chạy nền: đơn hết hạn thanh toán, đơn đã giao quá lâu
    // ------------------------------------------------------------------

    /** Đơn cần xử lý nền: mã, chủ đơn và số đơn để gửi thông báo. */
    public record Due(int orderId, int userId, String orderNumber) {}

    /** Đơn online chờ thanh toán đã quá payment_expires_at. */
    public List<Due> expiredUnpaid() {
        return db.query(
                """
                SELECT order_id, user_id, order_number FROM orders
                WHERE order_type = 'Online' AND order_status = 'AWAITING_PAYMENT'
                  AND payment_expires_at IS NOT NULL AND payment_expires_at < NOW()
                """,
                (rs, i) -> new Due(rs.getInt("order_id"), rs.getInt("user_id"), rs.getString("order_number")));
    }

    /** Đơn online đã giao quá {@code days} ngày mà khách chưa xác nhận đã nhận hàng. */
    public List<Due> deliveredLongAgo(int days) {
        return db.query(
                """
                SELECT order_id, user_id, order_number FROM orders
                WHERE order_type = 'Online' AND order_status = 'DELIVERED'
                  AND shipment_delivered_at IS NOT NULL
                  AND shipment_delivered_at < DATE_SUB(NOW(), INTERVAL ? DAY)
                """,
                (rs, i) -> new Due(rs.getInt("order_id"), rs.getInt("user_id"), rs.getString("order_number")),
                days);
    }

    // ------------------------------------------------------------------
    // Ghi nhận thanh toán online (PayOS)
    // ------------------------------------------------------------------

    /** Đơn đang chờ ghi nhận thanh toán: trạng thái trước khi ghi nhận để biết cần báo gì. */
    public record Payable(int orderId, int userId, String orderNumber, String orderStatus, String paymentStatus) {}

    /** Khóa dòng (FOR UPDATE) để webhook và lần kiểm tra trạng thái chạy cùng lúc không báo trùng. */
    public Optional<Payable> findPayableForUpdate(int orderId) {
        return db.query(
                        "SELECT order_id, user_id, order_number, order_status, payment_status"
                                + " FROM orders WHERE order_id = ? FOR UPDATE",
                        (rs, i) ->
                                new Payable(
                                        rs.getInt("order_id"),
                                        rs.getInt("user_id"),
                                        rs.getString("order_number"),
                                        rs.getString("order_status"),
                                        rs.getString("payment_status")),
                        orderId)
                .stream()
                .findFirst();
    }

    /** Đánh dấu đã thanh toán; đơn đang chờ thanh toán thì chuyển sang chờ xác nhận. */
    public void markOnlinePaid(int orderId) {
        db.update(
                """
                UPDATE orders
                SET payment_status = 'PAID',
                    order_status = CASE WHEN order_status = 'AWAITING_PAYMENT'
                                        THEN 'PENDING_CONFIRMATION' ELSE order_status END
                WHERE order_id = ?
                """,
                orderId);
    }

    private record StatusCount(String status, long count) {}

    /** Số đơn theo từng trạng thái; customerId = null thì tính mọi đơn của loại đó. */
    public Map<String, Long> countByStatus(Integer customerId, String orderType) {
        String sql =
                "SELECT order_status, COUNT(*) AS n FROM orders WHERE order_type = ?"
                        + (customerId != null ? " AND user_id = ?" : "")
                        + " GROUP BY order_status";
        Object[] args = customerId != null ? new Object[] {orderType, customerId} : new Object[] {orderType};
        Map<String, Long> out = new HashMap<>();
        for (StatusCount c :
                db.query(sql, (rs, i) -> new StatusCount(rs.getString("order_status"), rs.getLong("n")), args)) {
            out.put(c.status(), c.count());
        }
        return out;
    }
}