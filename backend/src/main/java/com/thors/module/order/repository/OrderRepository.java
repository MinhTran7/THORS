package com.thors.module.order.repository;

import com.thors.module.order.dto.OrderViews.*;
import java.sql.ResultSet;
import java.sql.SQLException;
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

    /** Cột có trong kết quả không (cột refund_* chỉ có sau migration 2026-11-11_refund_bank_account.sql). */
    private static boolean hasColumn(ResultSet rs, String column) throws SQLException {
        var meta = rs.getMetaData();
        for (int i = 1; i <= meta.getColumnCount(); i++)
            if (column.equalsIgnoreCase(meta.getColumnLabel(i))) return true;
        return false;
    }

    private static BankAccount refundAccount(ResultSet rs) throws SQLException {
        if (!hasColumn(rs, "refund_account_number")) return null;
        String number = rs.getString("refund_account_number");
        if (number == null || number.isBlank()) return null;
        return new BankAccount(
                rs.getString("refund_bank_bin"),
                rs.getString("refund_bank_name"),
                number,
                rs.getString("refund_account_name"));
    }

    /** Tài khoản khách đã chuyển khoản cho đơn (lần thanh toán thành công gần nhất); null nếu PayOS không gửi. */
    public BankAccount payerAccount(int orderId) {
        try {
            List<BankAccount> rows =
                    db.query(
                            """
                            SELECT payer_bank_bin, payer_bank_name, payer_account_number, payer_account_name
                            FROM payment
                            WHERE order_id = ? AND payment_status = 'SUCCESS'
                              AND payer_account_number IS NOT NULL AND payer_account_number <> ''
                            ORDER BY paid_at DESC, payment_id DESC
                            LIMIT 1
                            """,
                            (rs, i) ->
                                    new BankAccount(
                                            rs.getString("payer_bank_bin"),
                                            rs.getString("payer_bank_name"),
                                            rs.getString("payer_account_number"),
                                            rs.getString("payer_account_name")),
                            orderId);
            return rows.isEmpty() ? null : rows.get(0);
        } catch (org.springframework.jdbc.BadSqlGrammarException e) {
            return null; // chưa chạy migration
        }
    }

    /** Lưu tài khoản nhận tiền hoàn của đơn. false = DB chưa có cột (chưa chạy migration). */
    public boolean saveRefundAccount(int orderId, BankAccount account) {
        try {
            db.update(
                    "UPDATE orders SET refund_bank_bin = ?, refund_bank_name = ?, refund_account_number = ?,"
                            + " refund_account_name = ? WHERE order_id = ?",
                    account.bankBin(),
                    account.bankName(),
                    account.accountNumber(),
                    account.accountName(),
                    orderId);
            return true;
        } catch (org.springframework.jdbc.BadSqlGrammarException e) {
            return false;
        }
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
                            List.of(),
                            null,
                            null);

    /**
     * Danh sách đơn online. customerId != null thì chỉ lấy đơn của khách đó (Customer xem đơn của mình);
     * null thì lấy mọi đơn online (Owner, Family Member, Staff).
     *
     * <p>dateFrom / dateTo (có thể null): lọc theo ngày đặt, gồm cả hai ngày đầu cuối. paymentFilter
     * (có thể null): lọc đúng giá trị cột payment_method (COD, ONLINE, CASH).
     *
     * <p>sourceFilter (có thể null): WEB hoặc FACEBOOK. Bảng orders không lưu nguồn đơn, nên suy từ
     * tài khoản gắn với đơn giống DashboardService: khách tự đặt trên web thì user_id là tài khoản
     * CUSTOMER; đơn Social POS do nhân viên tạo nên user_id là tài khoản nhân viên.
     */
    public Slice search(
            Integer customerId,
            String orderType,
            List<String> statuses,
            String q,
            LocalDate dateFrom,
            LocalDate dateTo,
            String paymentFilter,
            String sourceFilter,
            int page,
            int size) {
        return search(customerId, orderType, statuses, q, dateFrom, dateTo, paymentFilter, sourceFilter, null, page, size);
    }

    /**
     * Như trên; returnDays != null là tab "Trả hàng" của khách: chỉ lấy đơn đã giao / hoàn thành mà mốc giao
     * thành công chưa quá returnDays ngày (còn được yêu cầu trả hàng), cùng các đơn đã có yêu cầu trả hàng.
     */
    public Slice search(
            Integer customerId,
            String orderType,
            List<String> statuses,
            String q,
            LocalDate dateFrom,
            LocalDate dateTo,
            String paymentFilter,
            String sourceFilter,
            Integer returnDays,
            int page,
            int size) {
        var where = new StringBuilder(" WHERE o.order_type = ?");
        List<Object> args = new ArrayList<>();
        args.add(orderType);
        if (customerId != null) {
            where.append(" AND o.user_id = ?");
            args.add(customerId);
        }
        if (returnDays != null) {
            where.append(
                    " AND ((o.order_status IN ('DELIVERED', 'COMPLETED') AND o.shipment_delivered_at IS NOT NULL"
                            + " AND o.shipment_delivered_at >= DATE_SUB(NOW(), INTERVAL ? DAY))"
                            + " OR EXISTS (SELECT 1 FROM return_request rr WHERE rr.order_id = o.order_id))");
            args.add(returnDays);
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
        if (sourceFilter != null) {
            where.append(sourceFilter.equals("WEB") ? " AND EXISTS" : " AND NOT EXISTS")
                    .append(" (SELECT 1 FROM `user` su JOIN `role` sr ON sr.role_id = su.role_id")
                    .append(" WHERE su.user_id = o.user_id AND sr.role_name = 'CUSTOMER')");
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
        // Khách xem đơn của mình: kèm hạn trả hàng và trạng thái yêu cầu trả hàng để hiện trên thẻ đơn
        if (customerId != null) withLines = withReturnInfo(withLines, returnDays != null ? returnDays : RETURN_DAYS);
        return new Slice(withLines, total == null ? 0 : total);
    }

    /** Số ngày khách được yêu cầu trả hàng, tính từ lúc giao thành công (trùng mốc tự hoàn thành đơn). */
    public static final int RETURN_DAYS = 7;

    /**
     * Gắn hạn trả hàng (mốc giao thành công + days, chỉ khi đơn đã giao / hoàn thành và chưa quá hạn) và
     * trạng thái yêu cầu trả hàng mới nhất. Lỗi đọc (DB chưa có bảng return_request...) thì để trống,
     * danh sách đơn vẫn hiện bình thường.
     */
    private List<ListItem> withReturnInfo(List<ListItem> items, int days) {
        if (items.isEmpty()) return items;
        String in = String.join(",", Collections.nCopies(items.size(), "?"));
        Object[] ids = items.stream().map(ListItem::id).toArray();
        Map<Integer, LocalDateTime> deadlines = new HashMap<>();
        Map<Integer, String> statuses = new HashMap<>();
        try {
            db.query(
                    "SELECT order_id, shipment_delivered_at FROM orders WHERE order_id IN (" + in + ")"
                            + " AND order_status IN ('DELIVERED', 'COMPLETED') AND shipment_delivered_at IS NOT NULL",
                    rs -> {
                        LocalDateTime delivered = time(rs, "shipment_delivered_at");
                        LocalDateTime deadline = delivered == null ? null : delivered.plusDays(days);
                        if (deadline != null && deadline.isAfter(LocalDateTime.now(ZoneOffset.UTC)))
                            deadlines.put(rs.getInt("order_id"), deadline);
                    },
                    ids);
            db.query(
                    "SELECT rr.order_id, rr.status FROM return_request rr WHERE rr.order_id IN (" + in + ")"
                            + " ORDER BY rr.return_request_id",
                    rs -> {
                        statuses.put(rs.getInt("order_id"), rs.getString("status")); // dòng sau (mới hơn) ghi đè
                    },
                    ids);
        } catch (org.springframework.dao.DataAccessException e) {
            org.slf4j.LoggerFactory.getLogger(OrderRepository.class)
                    .warn("Không đọc được thông tin trả hàng cho danh sách đơn: {}", e.getMessage());
        }
        return items.stream().map(it -> it.withReturn(deadlines.get(it.id()), statuses.get(it.id()))).toList();
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
                                            List.of(),
                                            refundAccount(rs),
                                            null,
                                            null);
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
                        lines(orderId),
                        d.refundAccount(),
                        "ONLINE".equals(d.paymentMethod()) ? payerAccount(orderId) : null,
                        latestReturnStatus(orderId));
        return Optional.of(new Found(found.userId(), found.orderType(), withLines));
    }

    /**
     * Tên và email của khách đặt đơn, chỉ khi tài khoản gắn với đơn là Khách hàng (đơn Facebook do nhân viên tạo
     * gắn tài khoản nhân viên nên không có). Dùng để gửi email báo trạng thái đơn.
     */
    public Optional<com.thors.module.order.service.OrderMailService.Recipient> customerRecipient(int orderId) {
        List<com.thors.module.order.service.OrderMailService.Recipient> rows =
                db.query(
                        """
                        SELECT u.full_name, u.email FROM orders o
                        JOIN `user` u ON u.user_id = o.user_id
                        JOIN `role` r ON r.role_id = u.role_id
                        WHERE o.order_id = ? AND r.role_name = 'CUSTOMER' AND u.email IS NOT NULL AND u.email <> ''
                        """,
                        (rs, i) ->
                                new com.thors.module.order.service.OrderMailService.Recipient(
                                        rs.getString("full_name"), rs.getString("email")),
                        orderId);
        return rows.stream().findFirst();
    }

    /**
     * Tài khoản có phải Khách hàng không. Đơn Facebook (Social POS) gắn tài khoản nhân viên tạo đơn, khách
     * Facebook không có tài khoản web, nên thông báo "gửi khách" của các đơn này phải bỏ qua.
     */
    public boolean isCustomerAccount(int userId) {
        Integer n =
                db.queryForObject(
                        "SELECT COUNT(*) FROM `user` u JOIN `role` r ON r.role_id = u.role_id"
                                + " WHERE u.user_id = ? AND r.role_name = 'CUSTOMER'",
                        Integer.class,
                        userId);
        return n != null && n > 0;
    }

    /** Các tài khoản đang hoạt động xử lý đơn của cửa hàng (chủ shop và người nhà). */
    public List<Integer> storeUserIds() {
        return db.queryForList(
                "SELECT u.user_id FROM `user` u JOIN `role` r ON r.role_id = u.role_id"
                        + " WHERE r.role_name IN ('OWNER', 'FAMILY_MEMBER') AND u.account_status = 'ACTIVE'",
                Integer.class);
    }

    /** Trạng thái yêu cầu trả hàng mới nhất của đơn; null nếu chưa có (hoặc DB chưa có bảng return_request). */
    private String latestReturnStatus(int orderId) {
        try {
            List<String> rows =
                    db.queryForList(
                            "SELECT status FROM return_request WHERE order_id = ? ORDER BY return_request_id DESC LIMIT 1",
                            String.class,
                            orderId);
            return rows.isEmpty() ? null : rows.get(0);
        } catch (org.springframework.dao.DataAccessException e) {
            return null;
        }
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
    // Gửi vận đơn qua đơn vị vận chuyển (GHN)
    // ------------------------------------------------------------------

    /** Thông tin đơn cần để tạo vận đơn. */
    public record ShipInput(
            String orderNumber,
            String name,
            String phone,
            String address,
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
                               payment_method, payment_status, total_amount, package_weight_g
                        FROM orders WHERE order_id = ?
                        """,
                        (rs, i) ->
                                new ShipInput(
                                        rs.getString("order_number"),
                                        rs.getString("delivery_name"),
                                        rs.getString("delivery_phone"),
                                        rs.getString("delivery_address"),
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
     *
     * <p>provinceName / wardName: Tỉnh và Phường/Xã (địa giới mới) đã gửi cho GHN, lưu vào cột
     * ghn_province_name / ghn_ward_name (migration 2026-11-19_order_ghn_new_address.sql). DB chưa có 2 cột
     * này thì bỏ qua, vận đơn vẫn được lưu như bình thường.
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
            String provinceName,
            String wardName) {
        boolean names = hasGhnAddressColumns();
        List<Object> args = new ArrayList<>(List.of(carrier, trackingNumber, trackingNumber, serviceCode, carrierFee, codAmount, weightG));
        if (names) {
            args.add(provinceName);
            args.add(wardName);
        }
        args.add(orderId);
        args.add(from);
        return db.update(
                        "UPDATE orders SET shipping_carrier = ?,"
                                + " tracking_number = ?, provider_shipment_id = ?, shipping_service_code = ?,"
                                + " carrier_shipping_fee = ?, cod_amount = ?, package_weight_g = ?,"
                                + (names ? " ghn_province_name = ?, ghn_ward_name = ?," : "")
                                + " shipment_status = 'CREATED', shipment_created_at = NOW(),"
                                + " shipment_picked_up_at = NULL, shipment_updated_at = NOW()"
                                + " WHERE order_id = ? AND order_status = ? AND tracking_number IS NULL",
                        args.toArray())
                > 0;
    }

    /** Đã có cột ghn_ward_name chưa: có rồi thì nhớ luôn, chưa có thì hỏi lại sau mỗi phút. */
    private volatile boolean ghnAddressColumns;
    private volatile long ghnAddressCheckedAt;

    boolean hasGhnAddressColumns() {
        if (ghnAddressColumns) return true;
        long now = System.currentTimeMillis();
        if (now - ghnAddressCheckedAt < 60_000) return false;
        ghnAddressCheckedAt = now;
        try {
            Integer n =
                    db.queryForObject(
                            "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()"
                                    + " AND LOWER(table_name) = 'orders' AND LOWER(column_name) = 'ghn_ward_name'",
                            Integer.class);
            ghnAddressColumns = n != null && n > 0;
        } catch (RuntimeException e) {
            ghnAddressColumns = false;
        }
        return ghnAddressColumns;
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
                        "SELECT oi.order_id, oi.detail_id, oi.product_name_snapshot, oi.size_snapshot, oi.color_snapshot,"
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
                                                rs.getString("image_url"),
                                                rs.getInt("detail_id"))),
                        orderIds.toArray());
        for (PreviewRow r : rows) byOrder.computeIfAbsent(r.orderId(), k -> new ArrayList<>()).add(r.preview());
        return byOrder;
    }

    // ------------------------------------------------------------------
    // Việc chạy nền: đơn hết hạn thanh toán, đơn đã giao quá lâu
    // ------------------------------------------------------------------

    /**
     * Đơn online đã thanh toán (PayOS) mà bị hủy / từ chối: chuyển tiền sang "Chờ hoàn tiền" để chủ shop
     * hoàn lại cho khách. Trả về số dòng đổi (0 = đơn chưa thanh toán, không cần hoàn).
     */
    public int markRefundPendingIfPaid(int orderId) {
        return db.update(
                "UPDATE orders SET payment_status = 'REFUND_PENDING'"
                        + " WHERE order_id = ? AND payment_method = 'ONLINE' AND payment_status = 'PAID'"
                        + " AND order_status IN ('CANCELLED', 'REJECTED')",
                orderId);
    }

    /** Chủ shop đã chuyển khoản trả lại khách: "Chờ hoàn tiền" -> "Đã hoàn tiền". */
    public int markRefunded(int orderId) {
        return db.update(
                "UPDATE orders SET payment_status = 'REFUNDED'"
                        + " WHERE order_id = ? AND payment_status = 'REFUND_PENDING'",
                orderId);
    }

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