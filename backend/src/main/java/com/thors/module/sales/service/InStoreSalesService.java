package com.thors.module.sales.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.sales.dto.CreateInStoreSaleRequest;
import com.thors.module.sales.dto.InStoreSaleResponse;
import com.thors.security.SessionAccess;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class InStoreSalesService {

    private static final BigDecimal ZERO = BigDecimal.ZERO;

    private static final DateTimeFormatter NUMBER_TIME =
            DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final JdbcTemplate jdbc;
    private final SessionAccess sessionAccess;

    public InStoreSalesService(
            JdbcTemplate jdbc,
            SessionAccess sessionAccess
    ) {
        this.jdbc = jdbc;
        this.sessionAccess = sessionAccess;
    }

    /**
     * Tạo hóa đơn bán tại quầy.
     *
     * Toàn bộ thao tác tạo đơn, tạo chi tiết đơn, trừ kho,
     * ghi lịch sử kho, thanh toán và hóa đơn nằm trong một transaction.
     * Nếu một thao tác thất bại, transaction sẽ rollback.
     */
    @Transactional
    public InStoreSaleResponse createSale(
            CreateInStoreSaleRequest request
    ) {
        Account seller = sessionAccess.current();

        validateSeller(seller);
        validateRequest(request);

        // Gộp các dòng có cùng detailId để tránh xử lý trùng biến thể.
        Map<Integer, Integer> quantities = new LinkedHashMap<>();

        for (CreateInStoreSaleRequest.ItemRequest item : request.items()) {
            if (item == null
                    || item.detailId() == null
                    || item.detailId() <= 0
                    || item.quantity() == null
                    || item.quantity() <= 0) {

                throw badRequest(
                        "Mỗi sản phẩm phải có detailId hợp lệ "
                                + "và quantity lớn hơn 0."
                );
            }

            try {
                quantities.merge(
                        item.detailId(),
                        item.quantity(),
                        Math::addExact
                );
            } catch (ArithmeticException ex) {
                throw badRequest("Số lượng sản phẩm vượt giới hạn cho phép.");
            }
        }

        // Khóa các biến thể theo thứ tự ID nhất quán để giảm nguy cơ deadlock.
        List<Integer> detailIds = new ArrayList<>(quantities.keySet());
        detailIds.sort(Comparator.naturalOrder());

        List<SaleLine> lines = new ArrayList<>();
        BigDecimal subtotal = ZERO;

        /*
         * Khóa các dòng tồn kho trong database.
         * Transaction khác không thể đồng thời bán vượt số lượng
         * của cùng biến thể trong lúc transaction này đang xử lý.
         */
        for (Integer detailId : detailIds) {
            SaleLine line;

            try {
                line = jdbc.queryForObject(
                        """
                        SELECT
                            pd.detail_id,
                            pd.product_id,
                            pd.stock_quantity,
                            pd.price,
                            pd.size,
                            pd.color,
                            pd.status AS detail_status,
                            p.product_name,
                            p.status AS product_status
                        FROM product_detail pd
                        JOIN product p
                            ON p.product_id = pd.product_id
                        WHERE pd.detail_id = ?
                        FOR UPDATE
                        """,
                        (rs, rowNum) -> new SaleLine(
                                rs.getInt("detail_id"),
                                rs.getInt("product_id"),
                                rs.getInt("stock_quantity"),
                                rs.getBigDecimal("price"),
                                rs.getString("size"),
                                rs.getString("color"),
                                rs.getString("detail_status"),
                                rs.getString("product_name"),
                                rs.getString("product_status"),
                                quantities.get(detailId)
                        ),
                        detailId
                );

            } catch (EmptyResultDataAccessException ex) {
                throw badRequest(
                        "Không tìm thấy biến thể sản phẩm detailId="
                                + detailId + "."
                );
            }

            if (!"ACTIVE".equals(line.productStatus())
                    || !"ACTIVE".equals(line.detailStatus())) {

                throw badRequest(
                        "Sản phẩm hoặc biến thể đã ngừng hoạt động: "
                                + line.productName()
                );
            }

            if (line.price() == null
                    || line.price().compareTo(ZERO) < 0) {

                throw badRequest(
                        "Giá bán của sản phẩm không hợp lệ: "
                                + line.productName()
                );
            }

            if (line.stockQuantity() < 0
                    || line.quantity() > line.stockQuantity()) {

                throw badRequest(
                        "Không đủ tồn kho cho " + line.productName()
                                + " (còn " + line.stockQuantity()
                                + ", cần " + line.quantity() + ")."
                );
            }

            line = line.withLineTotal(
                    line.price().multiply(
                            BigDecimal.valueOf(line.quantity())
                    )
            );

            lines.add(line);
            subtotal = subtotal.add(line.lineTotal());
        }

        // Kiểm tra giảm giá trực tiếp bằng VNĐ.
        BigDecimal discount = request.discountAmount() == null
                ? ZERO
                : request.discountAmount();

        if (discount.compareTo(ZERO) < 0
                || (discount.stripTrailingZeros().scale() > 0)) {

            throw badRequest(
                    "Giảm giá phải là số VNĐ nguyên và không âm."
            );
        }

        try {
            discount = discount.setScale(0, RoundingMode.UNNECESSARY);
        } catch (ArithmeticException ex) {
            throw badRequest("Giảm giá phải là số VNĐ nguyên.");
        }

        if (discount.compareTo(subtotal) > 0) {
            throw badRequest(
                    "Giảm giá không được vượt tổng tiền hàng."
            );
        }

        String paymentMethod =
                normalizePaymentMethod(request.paymentMethod());

        BigDecimal total = subtotal.subtract(discount);

        LocalDateTime now = LocalDateTime.now();

        String orderNumber = makeNumber("POS");
        String invoiceNumber = makeNumber("INV");

        String customerName =
                normalizeCustomerName(request.customerName());

        // Dùng chung bảng orders với đơn hàng online.
        int orderId = insertOrder(
                seller.id(),
                customerName,
                orderNumber,
                paymentMethod,
                subtotal,
                discount,
                total,
                now
        );

        // Dùng chung bảng order_item với đơn hàng online.
        for (SaleLine line : lines) {
            int orderItemId = insertOrderItem(orderId, line);

            // Trừ tồn kho ngay trong cùng transaction.
            int updated = jdbc.update(
                    """
                    UPDATE product_detail
                    SET stock_quantity = stock_quantity - ?
                    WHERE detail_id = ?
                      AND stock_quantity >= ?
                      AND status = 'ACTIVE'
                    """,
                    line.quantity(),
                    line.detailId(),
                    line.quantity()
            );

            if (updated != 1) {
                throw badRequest(
                        "Tồn kho vừa thay đổi. "
                                + "Vui lòng tải lại sản phẩm và thử lại."
                );
            }

            // Ghi lịch sử xuất kho để truy vết.
            jdbc.update(
                    """
                    INSERT INTO stock_adjustment (
                        detail_id,
                        quantity_change,
                        reason,
                        adjusted_by,
                        movement_type,
                        movement_quantity,
                        order_item_id,
                        idempotency_key
                    )
                    VALUES (?, ?, ?, ?, 'ORDER_OUT', ?, ?, ?)
                    """,
                    line.detailId(),
                    -line.quantity(),
                    "Bán tại cửa hàng " + orderNumber,
                    seller.id(),
                    line.quantity(),
                    orderItemId,
                    UUID.randomUUID().toString()
            );
        }

        /*
         * Bảng payment yêu cầu amount > 0.
         * Nếu đơn được giảm giá 100%, không tạo payment 0 đồng.
         */
        if (total.compareTo(ZERO) > 0) {
            jdbc.update(
                    """
                    INSERT INTO payment (
                        order_id,
                        payment_method,
                        payment_status,
                        amount,
                        paid_at
                    )
                    VALUES (?, ?, 'SUCCESS', ?, ?)
                    """,
                    orderId,
                    paymentMethod,
                    total,
                    java.sql.Timestamp.valueOf(now)
            );
        }

        // Tạo hóa đơn cho đơn bán tại quầy.
        jdbc.update(
                """
                INSERT INTO invoice (
                    order_id,
                    invoice_number,
                    issued_at,
                    issued_by,
                    issuer_type
                )
                VALUES (?, ?, ?, ?, 'USER')
                """,
                orderId,
                invoiceNumber,
                java.sql.Timestamp.valueOf(now),
                seller.id()
        );

        return new InStoreSaleResponse(
                orderId,
                orderNumber,
                invoiceNumber,
                "COMPLETED",
                "PAID",
                paymentMethod,
                subtotal,
                discount,
                total
        );
    }

    /**
     * Tạo đơn bán tại quầy trong bảng orders dùng chung.
     */
    private int insertOrder(
            int sellerId,
            String customerName,
            String orderNumber,
            String paymentMethod,
            BigDecimal subtotal,
            BigDecimal discount,
            BigDecimal total,
            LocalDateTime now
    ) {
        KeyHolder keyHolder = new GeneratedKeyHolder();

        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    """
                    INSERT INTO orders (
                        order_number,
                        order_type,
                        user_id,
                        delivery_name,
                        order_date,
                        order_status,
                        total_amount,
                        created_by,
                        confirmed_by,
                        confirmed_at,
                        stock_deducted_at,
                        payment_method,
                        payment_status,
                        items_amount,
                        promotion_discount_amount,
                        coupon_discount_amount,
                        manual_discount_amount,
                        shipping_fee,
                        stock_hold_status,
                        stock_hold_closed_at,
                        stock_hold_close_reason
                    )
                    VALUES (
                        ?,
                        'In-Store',
                        ?,
                        ?,
                        ?,
                        'COMPLETED',
                        ?,
                        ?,
                        NULL,
                        NULL,
                        ?,
                        ?,
                        'PAID',
                        ?,
                        0,
                        0,
                        ?,
                        0,
                        'NONE',
                        ?,
                        ?
                    )
                    """,
                    Statement.RETURN_GENERATED_KEYS
            );

            ps.setString(1, orderNumber);

            // Schema yêu cầu user_id NOT NULL.
            // Đơn tại quầy lưu ID người bán tạo đơn.
            ps.setInt(2, sellerId);

            // Tên khách hàng là tùy chọn.
            ps.setString(3, customerName);

            ps.setTimestamp(
                    4,
                    java.sql.Timestamp.valueOf(now)
            );

            ps.setBigDecimal(5, total);
            ps.setInt(6, sellerId);

            // Đánh dấu kho đã được trừ ngay khi tạo đơn.
            ps.setTimestamp(
                    7,
                    java.sql.Timestamp.valueOf(now)
            );

            ps.setString(8, paymentMethod);
            ps.setBigDecimal(9, subtotal);
            ps.setBigDecimal(10, discount);

            ps.setTimestamp(
                    11,
                    java.sql.Timestamp.valueOf(now)
            );

            ps.setString(12, "IN_STORE_SALE");

            return ps;
        }, keyHolder);

        Number key = keyHolder.getKey();

        if (key == null) {
            throw new IllegalStateException(
                    "Không lấy được orderId sau khi tạo đơn."
            );
        }

        return key.intValue();
    }

    /**
     * Thêm chi tiết hóa đơn vào bảng order_item dùng chung.
     */
    private int insertOrderItem(
            int orderId,
            SaleLine line
    ) {
        KeyHolder keyHolder = new GeneratedKeyHolder();

        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    """
                    INSERT INTO order_item (
                        order_id,
                        detail_id,
                        quantity,
                        unit_price,
                        product_name_snapshot,
                        size_snapshot,
                        color_snapshot,
                        reserved_quantity
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                    """,
                    Statement.RETURN_GENERATED_KEYS
            );

            ps.setInt(1, orderId);
            ps.setInt(2, line.detailId());
            ps.setInt(3, line.quantity());
            ps.setBigDecimal(4, line.price());
            ps.setString(5, line.productName());
            ps.setString(6, line.size());
            ps.setString(7, line.color());

            return ps;
        }, keyHolder);

        Number key = keyHolder.getKey();

        if (key == null) {
            throw new IllegalStateException(
                    "Không lấy được orderItemId."
            );
        }

        return key.intValue();
    }

    /**
     * Chỉ OWNER và FAMILY_MEMBER được bán tại quầy.
     */
    private void validateSeller(Account seller) {
        if (!"OWNER".equals(seller.role())
                && !"FAMILY_MEMBER".equals(seller.role())) {

            throw new ApiException(
                    403,
                    "FORBIDDEN",
                    "Chỉ OWNER hoặc FAMILY_MEMBER được bán tại cửa hàng."
            );
        }
    }

    private void validateRequest(
            CreateInStoreSaleRequest request
    ) {
        if (request == null
                || request.items() == null
                || request.items().isEmpty()) {

            throw badRequest(
                    "Hóa đơn phải có ít nhất một sản phẩm."
            );
        }

        if (request.items().size() > 100) {
            throw badRequest(
                    "Một hóa đơn không được vượt quá 100 dòng sản phẩm."
            );
        }
    }

    /**
     * CASH: tiền mặt.
     * ONLINE: chuyển khoản theo quy ước hiện tại của schema.
     */
    private String normalizePaymentMethod(String method) {
        if (method == null) {
            throw badRequest(
                    "Vui lòng chọn phương thức thanh toán."
            );
        }

        return switch (method.trim().toUpperCase()) {
            case "CASH" -> "CASH";

            case "BANK TRANSFER",
                 "BANK_TRANSFER",
                 "BANKTRANSFER",
                 "ONLINE" -> "ONLINE";

            default -> throw badRequest(
                    "Phương thức thanh toán chỉ được là "
                            + "Cash hoặc Bank transfer."
            );
        };
    }

    private String normalizeCustomerName(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }

        String trimmed = name.trim();

        if (trimmed.length() > 100) {
            throw badRequest(
                    "Tên khách hàng không được vượt quá 100 ký tự."
            );
        }

        return trimmed;
    }

    private String makeNumber(String prefix) {
        return prefix
                + "-"
                + LocalDateTime.now().format(NUMBER_TIME)
                + "-"
                + UUID.randomUUID()
                .toString()
                .replace("-", "")
                .substring(0, 8)
                .toUpperCase();
    }

    private ApiException badRequest(String message) {
        return new ApiException(
                400,
                "INVALID_SALE",
                message
        );
    }

    /**
     * Dữ liệu một biến thể sản phẩm được đọc từ database.
     */
    private record SaleLine(
            int detailId,
            int productId,
            int stockQuantity,
            BigDecimal price,
            String size,
            String color,
            String detailStatus,
            String productName,
            String productStatus,
            int quantity,
            BigDecimal lineTotal
    ) {
        SaleLine(
                int detailId,
                int productId,
                int stockQuantity,
                BigDecimal price,
                String size,
                String color,
                String detailStatus,
                String productName,
                String productStatus,
                int quantity
        ) {
            this(
                    detailId,
                    productId,
                    stockQuantity,
                    price,
                    size,
                    color,
                    detailStatus,
                    productName,
                    productStatus,
                    quantity,
                    ZERO
            );
        }

        SaleLine withLineTotal(BigDecimal total) {
            return new SaleLine(
                    detailId,
                    productId,
                    stockQuantity,
                    price,
                    size,
                    color,
                    detailStatus,
                    productName,
                    productStatus,
                    quantity,
                    total
            );
        }
    }
}