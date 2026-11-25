package com.thors.module.sales.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.promotion.service.PricingService;
import com.thors.module.sales.dto.CreateInStoreSaleRequest;
import com.thors.module.sales.dto.InStoreSaleDetailResponse;
import com.thors.module.sales.dto.InStoreSaleListItem;
import com.thors.module.sales.dto.InStoreSalePageResponse;
import com.thors.module.sales.dto.InStoreSaleResponse;
import com.thors.module.sales.dto.PriceRange;
import com.thors.module.sales.dto.SellerOption;
import com.thors.module.sales.dto.VariantSale;
import com.thors.security.SessionAccess;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.BiFunction;

@Service
public class InStoreSalesService {

    // Hàng đang giữ cho đơn khác: phần giữ của đơn Facebook/online và đơn online đang trong hạn thanh toán
    private static final String HELD_SQL = """
            (SELECT COALESCE(SUM(IF(oi.reserved_quantity > 0, oi.reserved_quantity, oi.quantity)), 0)
             FROM order_item oi JOIN orders o ON o.order_id = oi.order_id
             WHERE oi.detail_id = pd.detail_id
               AND (oi.reserved_quantity > 0
                    OR (o.order_type = 'Online' AND o.order_status = 'AWAITING_PAYMENT' AND o.payment_expires_at > NOW())))
            """;

    // Ảnh chính của sản phẩm (cần alias pd cho product_detail)
    private static final String IMAGE_SQL = """
            (SELECT pi.image_url FROM product_image pi
             WHERE pi.product_id = pd.product_id AND pi.deleted_at IS NULL
             ORDER BY pi.is_primary DESC, pi.image_id ASC LIMIT 1) AS image_url
            """;

    // Cột chung của đơn tại quầy (lịch sử, chi tiết)
    private static final String SALE_SQL = """
            SELECT o.order_id, o.order_number, i.invoice_number, o.order_date,
                   u.full_name AS seller_name, COALESCE(o.items_amount, o.total_amount) AS subtotal,
                   COALESCE(o.manual_discount_amount, 0) AS discount_amount, o.total_amount,
                   o.payment_method, o.payment_status
            FROM orders o
            LEFT JOIN invoice i ON i.order_id = o.order_id
            LEFT JOIN `user` u ON u.user_id = o.created_by
            """;

    private final JdbcTemplate jdbc;
    private final SessionAccess sessionAccess;
    private final PricingService pricing;

    public InStoreSalesService(JdbcTemplate jdbc, SessionAccess sessionAccess, PricingService pricing) {
        this.jdbc = jdbc;
        this.sessionAccess = sessionAccess;
        this.pricing = pricing;
    }

    // ---- Tạo hóa đơn ----

    @Transactional
    public InStoreSaleResponse createSale(CreateInStoreSaleRequest request) {
        Account seller = currentSeller();
        if (request == null || request.items() == null || request.items().isEmpty()) {
            throw badRequest("Hóa đơn phải có ít nhất một sản phẩm.");
        }
        if (request.items().size() > 100) {
            throw badRequest("Một hóa đơn không được vượt quá 100 dòng sản phẩm.");
        }

        // Gộp dòng cùng biến thể; TreeMap khóa biến thể theo thứ tự ID để tránh deadlock
        Map<Integer, Integer> quantities = new TreeMap<>();
        for (var item : request.items()) {
            if (item == null || item.detailId() == null || item.detailId() <= 0 || item.quantity() == null || item.quantity() <= 0) {
                throw badRequest("Hóa đơn có sản phẩm hoặc số lượng không hợp lệ.");
            }
            try {
                quantities.merge(item.detailId(), item.quantity(), Math::addExact);
            } catch (ArithmeticException ex) {
                throw badRequest("Số lượng sản phẩm vượt giới hạn cho phép.");
            }
        }

        BiFunction<Integer, BigDecimal, BigDecimal> salePrice = pricing.pricer();
        List<SaleLine> lines = new ArrayList<>();
        BigDecimal subtotal = BigDecimal.ZERO;
        for (var entry : quantities.entrySet()) {
            SaleLine line = lockLine(entry.getKey(), entry.getValue());
            line = line.priced(salePrice.apply(line.productId(), line.price()));
            lines.add(line);
            subtotal = subtotal.add(line.lineTotal());
        }

        // Khuyến mãi vừa bắt đầu/kết thúc: báo để thu ngân xem lại giá trước khi bán
        if (request.expectedSubtotal() != null && request.expectedSubtotal().compareTo(subtotal) != 0) {
            throw new ApiException(409, "PRICE_CHANGED",
                    "Giá sản phẩm vừa thay đổi do khuyến mãi. Đã cập nhật lại giá, vui lòng kiểm tra và thanh toán lại.");
        }

        BigDecimal discount = request.discountAmount() == null ? BigDecimal.ZERO : request.discountAmount();
        if (discount.signum() < 0 || discount.stripTrailingZeros().scale() > 0) {
            throw badRequest("Giảm giá phải là số VNĐ nguyên và không âm.");
        }
        discount = discount.setScale(0, RoundingMode.UNNECESSARY);
        if (discount.compareTo(subtotal) > 0) {
            throw badRequest("Giảm giá không được vượt tổng tiền hàng.");
        }

        String paymentMethod = normalizePaymentMethod(request.paymentMethod());
        BigDecimal total = subtotal.subtract(discount);
        LocalDateTime now = LocalDateTime.now();
        String orderNumber = makeNumber("POS");

        int orderId = insertOrder(seller.id(), orderNumber, paymentMethod, subtotal, discount, total, now);
        for (SaleLine line : lines) {
            deductStock(orderId, orderNumber, seller.id(), line);
        }

        // Bảng payment yêu cầu amount > 0: đơn giảm 100% không tạo payment
        if (total.signum() > 0) {
            jdbc.update("INSERT INTO payment (order_id, payment_method, payment_status, amount, paid_at) VALUES (?, ?, 'SUCCESS', ?, ?)",
                    orderId, paymentMethod, total, Timestamp.valueOf(now));
        }
        return new InStoreSaleResponse(orderId, orderNumber, insertInvoice(orderId, seller.id(), now), "PAID",
                paymentMethod, subtotal, discount, total);
    }

    // Khóa biến thể (FOR UPDATE) và kiểm tra trạng thái, giá, hàng còn bán được
    private SaleLine lockLine(int detailId, int quantity) {
        SaleLine line = jdbc.query(
                """
                SELECT pd.detail_id, pd.product_id, pd.stock_quantity, pd.price, pd.size, pd.color,
                       pd.status AS detail_status, p.product_name, p.status AS product_status,
                """ + HELD_SQL + """
                       AS held
                FROM product_detail pd JOIN product p ON p.product_id = pd.product_id
                WHERE pd.detail_id = ?
                FOR UPDATE
                """,
                (rs, i) -> new SaleLine(rs.getInt("detail_id"), rs.getInt("product_id"), rs.getInt("stock_quantity"),
                        rs.getInt("held"), rs.getBigDecimal("price"), rs.getString("size"), rs.getString("color"),
                        rs.getString("product_name"), quantity, BigDecimal.ZERO,
                        "ACTIVE".equals(rs.getString("detail_status")) && "ACTIVE".equals(rs.getString("product_status"))),
                detailId).stream().findFirst()
                .orElseThrow(() -> badRequest("Có sản phẩm trong hóa đơn không còn tồn tại. Vui lòng xóa sản phẩm đó và thêm lại."));

        if (!line.active()) {
            throw badRequest("Sản phẩm hoặc biến thể đã ngừng hoạt động: " + line.productName());
        }
        if (line.price() == null || line.price().signum() < 0) {
            throw badRequest("Giá bán của sản phẩm không hợp lệ: " + line.productName());
        }
        // Không bán phần hàng đang giữ cho đơn khác
        if (quantity > line.stockQuantity() - line.held()) {
            throw badRequest("Không đủ hàng cho " + line.productName() + " (tồn " + line.stockQuantity()
                    + ", đang giữ cho đơn khác " + line.held() + ", cần " + quantity + ").");
        }
        return line;
    }

    // Ghi dòng hàng, trừ kho và ghi thẻ kho "Xuất bán" trong cùng transaction
    private void deductStock(int orderId, String orderNumber, int sellerId, SaleLine line) {
        int orderItemId = insertAndGetKey(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO order_item (order_id, detail_id, quantity, unit_price, product_name_snapshot,
                                            size_snapshot, color_snapshot, reserved_quantity)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, orderId);
            ps.setInt(2, line.detailId());
            ps.setInt(3, line.quantity());
            ps.setBigDecimal(4, line.price());
            ps.setString(5, line.productName());
            ps.setString(6, line.size());
            ps.setString(7, line.color());
            return ps;
        });

        int updated = jdbc.update(
                "UPDATE product_detail SET stock_quantity = stock_quantity - ? WHERE detail_id = ? AND stock_quantity >= ? AND status = 'ACTIVE'",
                line.quantity(), line.detailId(), line.quantity());
        if (updated != 1) {
            throw badRequest("Tồn kho vừa thay đổi. Vui lòng tải lại sản phẩm và thử lại.");
        }

        jdbc.update("""
                INSERT INTO stock_adjustment (detail_id, quantity_change, reason, adjusted_by, movement_type,
                                              movement_quantity, order_item_id, idempotency_key)
                VALUES (?, ?, ?, ?, 'ORDER_OUT', ?, ?, ?)
                """,
                line.detailId(), -line.quantity(), "Bán tại cửa hàng " + orderNumber, sellerId,
                line.quantity(), orderItemId, UUID.randomUUID().toString());
    }

    // Đơn tại quầy dùng chung bảng orders; user_id NOT NULL nên lưu người bán
    private int insertOrder(int sellerId, String orderNumber, String paymentMethod, BigDecimal subtotal,
                            BigDecimal discount, BigDecimal total, LocalDateTime now) {
        Timestamp time = Timestamp.valueOf(now);
        return insertAndGetKey(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO orders (order_number, order_type, user_id, order_date, order_status, payment_expires_at,
                                        total_amount, created_by, stock_deducted_at, payment_method, payment_status,
                                        items_amount, promotion_discount_amount, coupon_discount_amount, manual_discount_amount,
                                        shipping_fee, stock_hold_status, stock_hold_closed_at, stock_hold_close_reason)
                    VALUES (?, 'In-Store', ?, ?, 'COMPLETED', NULL, ?, ?, ?, ?, 'PAID', ?, 0, 0, ?, 0, 'NONE', ?, 'IN_STORE_SALE')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, orderNumber);
            ps.setInt(2, sellerId);
            ps.setTimestamp(3, time);
            ps.setBigDecimal(4, total);
            ps.setInt(5, sellerId);
            ps.setTimestamp(6, time);
            ps.setString(7, paymentMethod);
            ps.setBigDecimal(8, subtotal);
            ps.setBigDecimal(9, discount);
            ps.setTimestamp(10, time);
            return ps;
        });
    }

    private String insertInvoice(int orderId, int sellerId, LocalDateTime now) {
        String invoiceNumber = makeNumber("INV");
        jdbc.update("INSERT INTO invoice (order_id, invoice_number, issued_at, issued_by, issuer_type) VALUES (?, ?, ?, ?, 'USER')",
                orderId, invoiceNumber, Timestamp.valueOf(now), sellerId);
        return invoiceNumber;
    }

    // ---- Lịch sử, giá, thu ngân ----

    // Lịch sử bán tại quầy (chỉ đơn đã hoàn tất): tìm theo mã đơn, mã hóa đơn, thu ngân; lọc ngày, thu ngân, phương thức
    @Transactional(readOnly = true)
    public InStoreSalePageResponse listSales(String q, LocalDate fromDate, LocalDate toDate, Integer sellerId,
                                             String paymentMethod, int page, int size) {
        currentSeller();
        if (fromDate != null && toDate != null && fromDate.isAfter(toDate)) {
            throw badRequest("Từ ngày không được sau đến ngày.");
        }
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 50);

        StringBuilder where = new StringBuilder(" WHERE o.order_type = 'In-Store' AND o.order_status = 'COMPLETED'");
        List<Object> args = new ArrayList<>();
        if (q != null && !q.isBlank()) {
            String like = "%" + q.trim().toLowerCase().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
            where.append(" AND (LOWER(o.order_number) LIKE ? OR LOWER(COALESCE(i.invoice_number, '')) LIKE ?")
                    .append(" OR LOWER(COALESCE(u.full_name, '')) LIKE ?)");
            args.addAll(List.of(like, like, like));
        }
        if (fromDate != null) {
            where.append(" AND o.order_date >= ?");
            args.add(Timestamp.valueOf(fromDate.atStartOfDay()));
        }
        if (toDate != null) {
            where.append(" AND o.order_date < ?");
            args.add(Timestamp.valueOf(toDate.plusDays(1).atStartOfDay()));
        }
        if (sellerId != null && sellerId > 0) {
            where.append(" AND o.created_by = ?");
            args.add(sellerId);
        }
        if (paymentMethod != null && !paymentMethod.isBlank()) {
            where.append(" AND o.payment_method = ?");
            args.add(normalizePaymentMethod(paymentMethod));
        }

        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM orders o LEFT JOIN invoice i ON i.order_id = o.order_id"
                + " LEFT JOIN `user` u ON u.user_id = o.created_by" + where, Long.class, args.toArray());
        long totalItems = total == null ? 0 : total;

        args.add(safeSize);
        args.add((long) safePage * safeSize);
        List<InStoreSaleListItem> items = jdbc.query(SALE_SQL + where + " ORDER BY o.order_date DESC, o.order_id DESC LIMIT ? OFFSET ?",
                (rs, i) -> new InStoreSaleListItem(rs.getInt("order_id"), rs.getString("order_number"),
                        rs.getString("invoice_number"), orderDate(rs), rs.getString("seller_name"),
                        rs.getBigDecimal("total_amount"), rs.getString("payment_method")),
                args.toArray());

        return new InStoreSalePageResponse(items, totalItems, (int) Math.ceil((double) totalItems / safeSize));
    }

    // Chi tiết hóa đơn tại quầy kèm các mặt hàng đã bán
    @Transactional(readOnly = true)
    public InStoreSaleDetailResponse getSaleDetail(int orderId) {
        currentSeller();
        // Kiểm tra đơn trước, sau đó mới đọc các mặt hàng
        List<InStoreSaleDetailResponse.SaleItemDetail> items = new ArrayList<>();
        InStoreSaleDetailResponse sale = jdbc.query(SALE_SQL + " WHERE o.order_id = ? AND o.order_type = 'In-Store'",
                (rs, i) -> new InStoreSaleDetailResponse(rs.getInt("order_id"), rs.getString("order_number"),
                        rs.getString("invoice_number"), orderDate(rs), rs.getString("seller_name"),
                        rs.getBigDecimal("subtotal"), rs.getBigDecimal("discount_amount"), rs.getBigDecimal("total_amount"),
                        rs.getString("payment_method"), rs.getString("payment_status"), items),
                orderId).stream().findFirst()
                .orElseThrow(InStoreSalesService::notFound);

        items.addAll(jdbc.query(
                """
                SELECT oi.order_item_id, oi.product_name_snapshot, oi.size_snapshot, oi.color_snapshot,
                       oi.quantity, oi.unit_price,
                """ + IMAGE_SQL + """
                FROM order_item oi
                LEFT JOIN product_detail pd ON pd.detail_id = oi.detail_id
                WHERE oi.order_id = ?
                ORDER BY oi.order_item_id
                """,
                (rs, i) -> {
                    BigDecimal unitPrice = rs.getBigDecimal("unit_price");
                    int quantity = rs.getInt("quantity");
                    return new InStoreSaleDetailResponse.SaleItemDetail(rs.getInt("order_item_id"),
                            rs.getString("product_name_snapshot"),
                            rs.getString("size_snapshot"), rs.getString("color_snapshot"), quantity, unitPrice,
                            unitPrice != null ? unitPrice.multiply(BigDecimal.valueOf(quantity)) : BigDecimal.ZERO, rs.getString("image_url"));
                },
                orderId));
        return sale;
    }

    // Giá sau khuyến mãi và số còn bán được (đã trừ hàng giữ cho đơn khác) của từng biến thể
    @Transactional(readOnly = true)
    public Map<Integer, VariantSale> variantSales(int productId) {
        currentSeller();
        BiFunction<Integer, BigDecimal, BigDecimal> salePrice = pricing.pricer();
        Map<Integer, VariantSale> result = new LinkedHashMap<>();
        jdbc.query("SELECT pd.detail_id, pd.price, GREATEST(pd.stock_quantity - " + HELD_SQL + ", 0) AS available"
                        + " FROM product_detail pd WHERE pd.product_id = ? AND pd.price IS NOT NULL",
                rs -> {
                    result.put(rs.getInt("detail_id"),
                            new VariantSale(salePrice.apply(productId, rs.getBigDecimal("price")), rs.getInt("available")));
                },
                productId);
        return result;
    }

    // Khoảng giá gốc và giá sau khuyến mãi của từng sản phẩm, dùng ở ô tìm kiếm
    @Transactional(readOnly = true)
    public Map<Integer, PriceRange> salePriceRanges() {
        currentSeller();
        BiFunction<Integer, BigDecimal, BigDecimal> salePrice = pricing.pricer();
        Map<Integer, PriceRange> ranges = new LinkedHashMap<>();
        jdbc.query("SELECT product_id, MIN(price) AS min_price, MAX(price) AS max_price FROM product_detail"
                        + " WHERE status = 'ACTIVE' AND price IS NOT NULL GROUP BY product_id",
                rs -> {
                    int productId = rs.getInt("product_id");
                    BigDecimal min = rs.getBigDecimal("min_price");
                    BigDecimal max = rs.getBigDecimal("max_price");
                    ranges.put(productId, new PriceRange(min, max, salePrice.apply(productId, min), salePrice.apply(productId, max)));
                });
        return ranges;
    }

    // Thu ngân từng bán tại quầy, cho bộ lọc lịch sử
    @Transactional(readOnly = true)
    public List<SellerOption> listSellers() {
        currentSeller();
        return jdbc.query("""
                SELECT DISTINCT u.user_id, u.full_name
                FROM orders o JOIN `user` u ON u.user_id = o.created_by
                WHERE o.order_type = 'In-Store' AND u.full_name IS NOT NULL
                ORDER BY u.full_name
                """,
                (rs, i) -> new SellerOption(rs.getInt("user_id"), rs.getString("full_name")));
    }

    // ---- Tiện ích ----

    // Chỉ OWNER và FAMILY_MEMBER được bán tại quầy
    private Account currentSeller() {
        Account seller = sessionAccess.current();
        if (!"OWNER".equals(seller.role()) && !"FAMILY_MEMBER".equals(seller.role())) {
            throw new ApiException(403, "FORBIDDEN", "Chỉ OWNER hoặc FAMILY_MEMBER được bán tại cửa hàng.");
        }
        return seller;
    }

    // CASH: tiền mặt; ONLINE: chuyển khoản (theo quy ước của schema)
    private static String normalizePaymentMethod(String method) {
        if (method == null) {
            throw badRequest("Vui lòng chọn phương thức thanh toán.");
        }
        return switch (method.trim().toUpperCase()) {
            case "CASH" -> "CASH";
            case "BANK_TRANSFER", "TRANSFER" -> "ONLINE";
            default -> throw badRequest("Phương thức thanh toán chỉ được là Cash hoặc Bank transfer.");
        };
    }

    private int insertAndGetKey(PreparedStatementCreator creator) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(creator, keyHolder);
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("Không lấy được ID vừa tạo.");
        }
        return key.intValue();
    }

    private static LocalDateTime orderDate(ResultSet rs) throws SQLException {
        Timestamp ts = rs.getTimestamp("order_date");
        return ts != null ? ts.toLocalDateTime() : null;
    }

    private static String makeNumber(String prefix) {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase();
        return prefix + "-" + LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE) + "-" + suffix;
    }

    private static ApiException badRequest(String message) {
        return new ApiException(400, "INVALID_SALE", message);
    }

    private static ApiException notFound() {
        return new ApiException(404, "NOT_FOUND", "Không tìm thấy hóa đơn bán hàng tại quầy.");
    }

    // Một biến thể trong hóa đơn; price là giá sau khuyến mãi sau khi gọi priced
    private record SaleLine(int detailId, int productId, int stockQuantity, int held, BigDecimal price, String size,
                            String color, String productName, int quantity, BigDecimal lineTotal, boolean active) {
        SaleLine priced(BigDecimal unitPrice) {
            return new SaleLine(detailId, productId, stockQuantity, held, unitPrice, size, color, productName, quantity,
                    unitPrice.multiply(BigDecimal.valueOf(quantity)), active);
        }
    }
}
