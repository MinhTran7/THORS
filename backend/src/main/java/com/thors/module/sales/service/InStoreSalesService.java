package com.thors.module.sales.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.payment.dto.CreatePaymentLinkRequest;
import com.thors.module.payment.dto.PaymentLinkResponse;
import com.thors.module.payment.service.PayOSService;
import com.thors.module.promotion.service.PromotionService;
import com.thors.module.sales.dto.CreateInStoreSaleRequest;
import com.thors.module.sales.dto.InStoreSaleDetailResponse;
import com.thors.module.sales.dto.InStoreSaleListItem;
import com.thors.module.sales.dto.InStoreSalePageResponse;
import com.thors.module.sales.dto.InStoreSaleResponse;
import com.thors.module.sales.dto.PendingTransfer;
import com.thors.module.sales.dto.PriceRange;
import com.thors.module.sales.dto.SellerOption;
import com.thors.module.sales.dto.VariantSale;
import com.thors.security.SessionAccess;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.BiFunction;

@Service
public class InStoreSalesService {

    private static final Logger log = LoggerFactory.getLogger(InStoreSalesService.class);
    private static final BigDecimal ZERO = BigDecimal.ZERO;
    // Phiếu giữ hàng bị bỏ quên (đóng trình duyệt khi đang hiện QR) quá thời gian này sẽ được dọn
    private static final int HOLD_MINUTES = 30;

    // Hàng đang giữ cho đơn khác: phần giữ của đơn Facebook/online và đơn online đang trong hạn thanh toán
    private static final String HELD_SQL = """
            (SELECT COALESCE(SUM(IF(oi.reserved_quantity > 0, oi.reserved_quantity, oi.quantity)), 0)
             FROM order_item oi
             JOIN orders o ON o.order_id = oi.order_id
             WHERE oi.detail_id = pd.detail_id
               AND (oi.reserved_quantity > 0
                    OR (o.order_type = 'Online'
                        AND o.order_status = 'AWAITING_PAYMENT'
                        AND o.payment_expires_at > NOW())))
            """;

    private final JdbcTemplate jdbc;
    private final SessionAccess sessionAccess;
    private final PromotionService promotionService;
    private final PayOSService payOSService;
    private final TransactionTemplate transactions;

    public InStoreSalesService(
            JdbcTemplate jdbc,
            SessionAccess sessionAccess,
            PromotionService promotionService,
            PayOSService payOSService,
            PlatformTransactionManager transactionManager
    ) {
        this.jdbc = jdbc;
        this.sessionAccess = sessionAccess;
        this.promotionService = promotionService;
        this.payOSService = payOSService;
        this.transactions = new TransactionTemplate(transactionManager);
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

                throw badRequest("Hóa đơn có sản phẩm hoặc số lượng không hợp lệ.");
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
        BiFunction<Integer, BigDecimal, BigDecimal> salePrice = promotionService.salePricer();

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
                        """ + HELD_SQL + """
                            AS held,
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
                                rs.getInt("held"),
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
                        "Có sản phẩm trong hóa đơn không còn tồn tại. "
                                + "Vui lòng xóa sản phẩm đó và thêm lại."
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

            // Không bán phần hàng đang giữ cho đơn khác
            if (line.quantity() > line.stockQuantity() - line.held()) {
                throw badRequest(
                        "Không đủ hàng cho " + line.productName()
                                + " (tồn " + line.stockQuantity()
                                + ", đang giữ cho đơn khác " + line.held()
                                + ", cần " + line.quantity() + ")."
                );
            }

            // Áp dụng khuyến mãi sản phẩm như bán online
            line = line.priced(salePrice.apply(line.productId(), line.price()));

            lines.add(line);
            subtotal = subtotal.add(line.lineTotal());
        }

        // Khuyến mãi vừa bắt đầu/kết thúc: báo để thu ngân xem lại giá trước khi bán
        if (request.expectedSubtotal() != null && request.expectedSubtotal().compareTo(subtotal) != 0) {
            throw new ApiException(409, "PRICE_CHANGED", "Giá sản phẩm vừa thay đổi do khuyến mãi. Đã cập nhật lại giá, vui lòng kiểm tra và thanh toán lại.");
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

        discount = discount.setScale(0, RoundingMode.UNNECESSARY);

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

        // Chuyển khoản: đơn chờ PayOS xác nhận, chưa tạo payment và hóa đơn
        boolean awaitingTransfer = "ONLINE".equals(paymentMethod) && total.compareTo(ZERO) > 0;

        // Dùng chung bảng orders với đơn hàng online.
        int orderId = insertOrder(
                seller.id(),
                orderNumber,
                paymentMethod,
                subtotal,
                discount,
                total,
                now,
                awaitingTransfer
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

        if (awaitingTransfer) {
            return new InStoreSaleResponse(
                    orderId,
                    orderNumber,
                    null,
                    "AWAITING_PAYMENT",
                    "UNPAID",
                    paymentMethod,
                    subtotal,
                    discount,
                    total
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

        String invoiceNumber = insertInvoice(orderId, seller.id(), now);

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
     * Hoàn tất đơn chuyển khoản sau khi PayOS báo đã nhận tiền.
     */
    @Transactional
    public InStoreSaleResponse completeTransfer(int orderId) {
        Account seller = sessionAccess.current();
        validateSeller(seller);

        TransferOrder order = lockOrder(orderId);
        String invoiceNumber = order.invoiceNumber();

        if (!"COMPLETED".equals(order.orderStatus())) {
            if (!"PAID".equals(order.paymentStatus())) {
                throw badRequest("Chưa nhận được tiền chuyển khoản cho đơn này.");
            }
            if (!"AWAITING_PAYMENT".equals(order.orderStatus())
                    && !"PENDING_CONFIRMATION".equals(order.orderStatus())) {
                throw badRequest("Đơn không ở trạng thái chờ thanh toán.");
            }

            invoiceNumber = markTransferPaid(orderId, order, seller.id());
        }

        return new InStoreSaleResponse(
                orderId,
                order.orderNumber(),
                invoiceNumber,
                "COMPLETED",
                "PAID",
                order.paymentMethod(),
                order.subtotal(),
                order.discount(),
                order.total()
        );
    }

    /**
     * Hủy chuyển khoản: hủy mã PayOS, trả hàng về kho và xóa phiếu giữ hàng.
     * Khách đã chuyển xong thì hoàn tất đơn thay vì hủy (trả về đơn đã hoàn tất, ngược lại null).
     */
    @Transactional
    public InStoreSaleResponse cancelTransfer(int orderId) {
        Account seller = sessionAccess.current();
        validateSeller(seller);

        Integer exists = jdbc.queryForObject("SELECT COUNT(*) FROM orders WHERE order_id = ?", Integer.class, orderId);
        if (exists == null || exists == 0) {
            return null;
        }

        boolean paid = payOSService.cancelPaymentLink(seller, orderId);
        TransferOrder order = lockOrder(orderId);

        if (paid || "PAID".equals(order.paymentStatus())) {
            return completeTransfer(orderId);
        }
        if (!"AWAITING_PAYMENT".equals(order.orderStatus())) {
            throw badRequest("Chỉ hủy được giao dịch đang chờ chuyển khoản.");
        }

        deleteHold(orderId);
        return null;
    }

    /**
     * Tự xử lý phiếu giữ hàng quá hạn: đã nhận tiền thì tạo hóa đơn, chưa thì xóa và trả hàng về kho.
     */
    @Scheduled(fixedDelay = 60_000L, initialDelay = 60_000L)
    public void releaseExpiredTransfers() {
        List<Integer> expired = jdbc.queryForList(
                """
                SELECT order_id
                FROM orders
                WHERE order_type = 'In-Store'
                  AND order_status IN ('AWAITING_PAYMENT', 'PENDING_CONFIRMATION')
                  AND order_date < ?
                """,
                Integer.class,
                java.sql.Timestamp.valueOf(LocalDateTime.now().minusMinutes(HOLD_MINUTES))
        );

        // Mỗi đơn một transaction: một đơn lỗi không làm hoàn tác các đơn khác, lượt sau thử lại
        for (Integer orderId : expired) {
            try {
                transactions.executeWithoutResult(status -> {
                    TransferOrder order = lockOrder(orderId);
                    if (!"AWAITING_PAYMENT".equals(order.orderStatus()) && !"PENDING_CONFIRMATION".equals(order.orderStatus())) {
                        return;
                    }
                    if ("PAID".equals(order.paymentStatus())) {
                        markTransferPaid(orderId, order, order.createdBy());
                    } else {
                        deleteHold(orderId);
                    }
                });
            } catch (RuntimeException ex) {
                log.warn("Không xử lý được phiếu giữ hàng quá hạn orderId={}: {}", orderId, ex.getMessage());
            }
        }
    }

    /**
     * Các đơn chuyển khoản đang chờ của thu ngân hiện tại, để mở lại tab khi tải lại trang.
     */
    @Transactional(readOnly = true)
    public List<PendingTransfer> pendingTransfers() {
        Account seller = sessionAccess.current();
        validateSeller(seller);

        List<PendingTransfer> result = jdbc.query(
                """
                SELECT order_id, order_number, order_status, payment_status, payment_method,
                       COALESCE(items_amount, total_amount) AS subtotal,
                       COALESCE(manual_discount_amount, 0) AS discount_amount,
                       total_amount
                FROM orders
                WHERE order_type = 'In-Store'
                  AND order_status IN ('AWAITING_PAYMENT', 'PENDING_CONFIRMATION')
                  AND created_by = ?
                ORDER BY order_id
                """,
                (rs, rowNum) -> new PendingTransfer(
                        new InStoreSaleResponse(
                                rs.getInt("order_id"),
                                rs.getString("order_number"),
                                null,
                                rs.getString("order_status"),
                                rs.getString("payment_status"),
                                rs.getString("payment_method"),
                                rs.getBigDecimal("subtotal"),
                                rs.getBigDecimal("discount_amount"),
                                rs.getBigDecimal("total_amount")
                        ),
                        new ArrayList<>()
                ),
                seller.id()
        );

        // Số lượng còn bán được tính cả phần của chính đơn này (dùng khi hủy chuyển khoản)
        for (PendingTransfer pending : result) {
            pending.items().addAll(jdbc.query(
                    """
                    SELECT p.product_id, pd.detail_id, oi.product_name_snapshot, oi.size_snapshot, oi.color_snapshot,
                           oi.unit_price, pd.price, oi.quantity,
                           GREATEST(pd.stock_quantity - """ + HELD_SQL + """
                           , 0) + oi.quantity AS available,
                           (SELECT pi.image_url FROM product_image pi
                            WHERE pi.product_id = pd.product_id AND pi.deleted_at IS NULL
                            ORDER BY pi.is_primary DESC, pi.image_id ASC LIMIT 1) AS image_url
                    FROM order_item oi
                    JOIN product_detail pd ON pd.detail_id = oi.detail_id
                    JOIN product p ON p.product_id = pd.product_id
                    WHERE oi.order_id = ?
                    ORDER BY oi.order_item_id
                    """,
                    (rs, rowNum) -> new PendingTransfer.Line(
                            rs.getInt("product_id"),
                            rs.getInt("detail_id"),
                            rs.getString("product_name_snapshot"),
                            rs.getString("image_url"),
                            rs.getString("size_snapshot"),
                            rs.getString("color_snapshot"),
                            rs.getBigDecimal("unit_price"),
                            rs.getBigDecimal("price"),
                            rs.getInt("quantity"),
                            rs.getInt("available")
                    ),
                    pending.sale().orderId()
            ));
        }
        return result;
    }

    /**
     * Tạo lại mã chuyển khoản cho đơn đang chờ (sau khi tải lại trang): hủy mã cũ để khách không trả trùng.
     * Khách đã trả thì báo lỗi nhưng vẫn giữ trạng thái đã thanh toán vừa ghi nhận.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public PaymentLinkResponse renewPaymentLink(int orderId) {
        Account seller = sessionAccess.current();
        validateSeller(seller);

        if (!"AWAITING_PAYMENT".equals(lockOrder(orderId).orderStatus()) || payOSService.cancelPaymentLink(seller, orderId)) {
            throw new ApiException(409, "TRANSFER_PAID", "Khách đã chuyển khoản, hệ thống đang hoàn tất hóa đơn.");
        }
        return payOSService.createPaymentLink(seller, new CreatePaymentLinkRequest(orderId, null, null));
    }

    private String markTransferPaid(int orderId, TransferOrder order, int issuedBy) {
        jdbc.update("UPDATE orders SET order_status = 'COMPLETED' WHERE order_id = ?", orderId);
        return order.invoiceNumber() != null
                ? order.invoiceNumber()
                : insertInvoice(orderId, issuedBy, LocalDateTime.now());
    }

    // Cộng lại tồn kho rồi xóa phiếu giữ hàng cùng dòng hàng, lịch sử kho và lần thanh toán PayOS
    private void deleteHold(int orderId) {
        List<Map<String, Object>> items = jdbc.queryForList(
                "SELECT detail_id, quantity FROM order_item WHERE order_id = ? AND detail_id IS NOT NULL ORDER BY detail_id",
                orderId
        );

        for (Map<String, Object> item : items) {
            jdbc.update(
                    "UPDATE product_detail SET stock_quantity = stock_quantity + ? WHERE detail_id = ?",
                    ((Number) item.get("quantity")).intValue(),
                    ((Number) item.get("detail_id")).intValue()
            );
        }

        jdbc.update(
                "DELETE FROM stock_adjustment WHERE order_item_id IN (SELECT order_item_id FROM order_item WHERE order_id = ?)",
                orderId
        );
        jdbc.update("DELETE FROM payment WHERE order_id = ?", orderId);
        jdbc.update("DELETE FROM order_item WHERE order_id = ?", orderId);
        jdbc.update("DELETE FROM orders WHERE order_id = ?", orderId);
    }

    /**
     * Lấy danh sách lịch sử bán hàng trực tiếp tại quầy (chỉ lấy order_type = 'In-Store').
     * Hỗ trợ tìm kiếm theo mã đơn, mã hóa đơn, tên khách hàng và lọc theo khoảng ngày.
     */
    @Transactional(readOnly = true)
    public InStoreSalePageResponse listSales(
            String q,
            LocalDate fromDate,
            LocalDate toDate,
            Integer sellerId,
            String paymentMethod,
            int page,
            int size
    ) {
        validateSeller(sessionAccess.current());

        if (fromDate != null && toDate != null && fromDate.isAfter(toDate)) {
            throw badRequest("Từ ngày không được sau đến ngày.");
        }

        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 50);

        // Chỉ hiện đơn đã bán thành công
        StringBuilder where = new StringBuilder(" WHERE o.order_type = 'In-Store' AND o.order_status = 'COMPLETED'");
        List<Object> args = new ArrayList<>();

        if (q != null && !q.trim().isEmpty()) {
            String like = "%" + q.trim().toLowerCase()
                    .replace("\\", "\\\\")
                    .replace("%", "\\%")
                    .replace("_", "\\_") + "%";
            where.append(" AND (LOWER(o.order_number) LIKE ? OR LOWER(COALESCE(i.invoice_number, '')) LIKE ? OR LOWER(COALESCE(o.delivery_name, '')) LIKE ? OR LOWER(COALESCE(u.full_name, '')) LIKE ?)");
            args.add(like);
            args.add(like);
            args.add(like);
            args.add(like);
        }

        if (fromDate != null) {
            where.append(" AND o.order_date >= ?");
            args.add(java.sql.Timestamp.valueOf(fromDate.atStartOfDay()));
        }

        if (toDate != null) {
            where.append(" AND o.order_date <= ?");
            args.add(java.sql.Timestamp.valueOf(toDate.atTime(23, 59, 59, 999_000_000)));
        }

        if (sellerId != null && sellerId > 0) {
            where.append(" AND o.created_by = ?");
            args.add(sellerId);
        }

        if (paymentMethod != null && !paymentMethod.trim().isEmpty()) {
            String pm = paymentMethod.trim().toUpperCase();
            where.append(" AND o.payment_method = ?");
            args.add("TRANSFER".equals(pm) || "BANK_TRANSFER".equals(pm) ? "ONLINE" : pm);
        }

        String countSql = "SELECT COUNT(*) FROM orders o LEFT JOIN invoice i ON i.order_id = o.order_id LEFT JOIN `user` u ON u.user_id = o.created_by" + where;
        Long total = jdbc.queryForObject(countSql, Long.class, args.toArray());
        long totalItems = total == null ? 0 : total;

        int totalPages = (int) Math.ceil((double) totalItems / safeSize);

        String selectSql = """
                SELECT
                    o.order_id,
                    o.order_number,
                    i.invoice_number,
                    o.order_date,
                    o.delivery_name AS customer_name,
                    u.full_name AS seller_name,
                    o.total_amount,
                    o.payment_method,
                    o.payment_status,
                    o.order_status
                FROM orders o
                LEFT JOIN invoice i ON i.order_id = o.order_id
                LEFT JOIN `user` u ON u.user_id = o.created_by
                """
                + where
                + " ORDER BY o.order_date DESC, o.order_id DESC LIMIT ? OFFSET ?";

        List<Object> queryArgs = new ArrayList<>(args);
        queryArgs.add(safeSize);
        queryArgs.add((long) safePage * safeSize);

        List<InStoreSaleListItem> items = jdbc.query(selectSql, (rs, rowNum) -> {
            java.sql.Timestamp ts = rs.getTimestamp("order_date");
            LocalDateTime orderDate = ts != null ? ts.toLocalDateTime() : null;
            return new InStoreSaleListItem(
                    rs.getInt("order_id"),
                    rs.getString("order_number"),
                    rs.getString("invoice_number"),
                    orderDate,
                    rs.getString("customer_name"),
                    rs.getString("seller_name"),
                    rs.getBigDecimal("total_amount"),
                    rs.getString("payment_method"),
                    rs.getString("payment_status"),
                    rs.getString("order_status")
            );
        }, queryArgs.toArray());

        return new InStoreSalePageResponse(items, safePage, safeSize, totalItems, totalPages);
    }

    /**
     * Giá sau khuyến mãi và số lượng còn bán được (đã trừ hàng giữ cho đơn khác) của từng biến thể.
     */
    @Transactional(readOnly = true)
    public Map<Integer, VariantSale> variantSales(int productId) {
        validateSeller(sessionAccess.current());

        Map<Integer, VariantSale> result = new LinkedHashMap<>();
        BiFunction<Integer, BigDecimal, BigDecimal> salePrice = promotionService.salePricer();
        jdbc.query(
                "SELECT pd.detail_id, pd.price, GREATEST(pd.stock_quantity - " + HELD_SQL + ", 0) AS available"
                        + " FROM product_detail pd WHERE pd.product_id = ? AND pd.price IS NOT NULL",
                rs -> {
                    result.put(rs.getInt("detail_id"), new VariantSale(
                            salePrice.apply(productId, rs.getBigDecimal("price")),
                            rs.getInt("available")
                    ));
                },
                productId
        );
        return result;
    }

    /**
     * Khoảng giá gốc và giá sau khuyến mãi của từng sản phẩm, dùng ở ô tìm kiếm.
     */
    @Transactional(readOnly = true)
    public Map<Integer, PriceRange> salePriceRanges() {
        validateSeller(sessionAccess.current());

        Map<Integer, PriceRange> ranges = new LinkedHashMap<>();
        BiFunction<Integer, BigDecimal, BigDecimal> salePrice = promotionService.salePricer();
        jdbc.query(
                """
                SELECT product_id, MIN(price) AS min_price, MAX(price) AS max_price
                FROM product_detail
                WHERE status = 'ACTIVE' AND price IS NOT NULL
                GROUP BY product_id
                """,
                rs -> {
                    int productId = rs.getInt("product_id");
                    BigDecimal min = rs.getBigDecimal("min_price");
                    BigDecimal max = rs.getBigDecimal("max_price");
                    ranges.put(productId, new PriceRange(
                            min,
                            max,
                            salePrice.apply(productId, min),
                            salePrice.apply(productId, max)
                    ));
                }
        );
        return ranges;
    }

    /**
     * Lấy danh sách thu ngân từng bán hàng tại quầy để phục vụ bộ lọc.
     */
    @Transactional(readOnly = true)
    public List<SellerOption> listSellers() {
        validateSeller(sessionAccess.current());

        String sql = """
                SELECT DISTINCT u.user_id, u.full_name
                FROM orders o
                JOIN `user` u ON u.user_id = o.created_by
                WHERE o.order_type = 'In-Store'
                  AND u.full_name IS NOT NULL
                ORDER BY u.full_name ASC
                """;
        return jdbc.query(sql, (rs, rowNum) -> new SellerOption(
                rs.getInt("user_id"),
                rs.getString("full_name")
        ));
    }

    /**
     * Lấy chi tiết hóa đơn bán hàng tại quầy kèm danh sách mặt hàng đã bán.
     */
    @Transactional(readOnly = true)
    public InStoreSaleDetailResponse getSaleDetail(int orderId) {
        validateSeller(sessionAccess.current());

        String orderSql = """
                SELECT
                    o.order_id,
                    o.order_number,
                    i.invoice_number,
                    o.order_date,
                    o.delivery_name AS customer_name,
                    u.full_name AS seller_name,
                    COALESCE(o.items_amount, o.total_amount) AS subtotal,
                    COALESCE(o.manual_discount_amount, 0) AS discount_amount,
                    o.total_amount,
                    o.payment_method,
                    o.payment_status,
                    o.order_status
                FROM orders o
                LEFT JOIN invoice i ON i.order_id = o.order_id
                LEFT JOIN `user` u ON u.user_id = o.created_by
                WHERE o.order_id = ? AND o.order_type = 'In-Store'
                """;

        List<InStoreSaleDetailResponse> ordersFound = jdbc.query(orderSql, (rs, rowNum) -> {
            java.sql.Timestamp ts = rs.getTimestamp("order_date");
            LocalDateTime orderDate = ts != null ? ts.toLocalDateTime() : null;
            return new InStoreSaleDetailResponse(
                    rs.getInt("order_id"),
                    rs.getString("order_number"),
                    rs.getString("invoice_number"),
                    orderDate,
                    rs.getString("customer_name"),
                    rs.getString("seller_name"),
                    rs.getBigDecimal("subtotal"),
                    rs.getBigDecimal("discount_amount"),
                    rs.getBigDecimal("total_amount"),
                    rs.getString("payment_method"),
                    rs.getString("payment_status"),
                    rs.getString("order_status"),
                    new ArrayList<>()
            );
        }, orderId);

        if (ordersFound.isEmpty()) {
            throw new ApiException(404, "NOT_FOUND", "Không tìm thấy hóa đơn bán hàng tại quầy.");
        }

        InStoreSaleDetailResponse base = ordersFound.get(0);

        String itemsSql = """
                SELECT
                    oi.order_item_id,
                    oi.detail_id,
                    oi.product_name_snapshot,
                    oi.size_snapshot,
                    oi.color_snapshot,
                    oi.quantity,
                    oi.unit_price,
                    (SELECT pi.image_url FROM product_image pi
                     WHERE pi.product_id = pd.product_id AND pi.deleted_at IS NULL
                     ORDER BY pi.is_primary DESC, pi.image_id ASC LIMIT 1) AS image_url
                FROM order_item oi
                LEFT JOIN product_detail pd ON pd.detail_id = oi.detail_id
                WHERE oi.order_id = ?
                ORDER BY oi.order_item_id ASC
                """;

        List<InStoreSaleDetailResponse.SaleItemDetail> items = jdbc.query(itemsSql, (rs, rowNum) -> {
            int qty = rs.getInt("quantity");
            BigDecimal unitPrice = rs.getBigDecimal("unit_price");
            BigDecimal lineTotal = unitPrice != null ? unitPrice.multiply(BigDecimal.valueOf(qty)) : BigDecimal.ZERO;
            return new InStoreSaleDetailResponse.SaleItemDetail(
                    rs.getInt("order_item_id"),
                    rs.getObject("detail_id") != null ? rs.getInt("detail_id") : null,
                    rs.getString("product_name_snapshot"),
                    rs.getString("size_snapshot"),
                    rs.getString("color_snapshot"),
                    qty,
                    unitPrice,
                    lineTotal,
                    rs.getString("image_url")
            );
        }, orderId);

        base.items().addAll(items);
        return base;
    }

    /**
     * Tạo đơn bán tại quầy trong bảng orders dùng chung.
     */
    private int insertOrder(
            int sellerId,
            String orderNumber,
            String paymentMethod,
            BigDecimal subtotal,
            BigDecimal discount,
            BigDecimal total,
            LocalDateTime now,
            boolean awaitingTransfer
    ) {
        KeyHolder keyHolder = new GeneratedKeyHolder();

        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    """
                    INSERT INTO orders (
                        order_number,
                        order_type,
                        user_id,
                        order_date,
                        order_status,
                        payment_expires_at,
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
                        ?,
                        ?,
                        ?,
                        NULL,
                        NULL,
                        ?,
                        ?,
                        ?,
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

            ps.setTimestamp(
                    3,
                    java.sql.Timestamp.valueOf(now)
            );

            ps.setString(4, awaitingTransfer ? "AWAITING_PAYMENT" : "COMPLETED");

            // Mã PayOS hết hạn cùng lúc với phiếu giữ hàng
            ps.setTimestamp(5, awaitingTransfer ? java.sql.Timestamp.valueOf(now.plusMinutes(HOLD_MINUTES)) : null);
            ps.setBigDecimal(6, total);
            ps.setInt(7, sellerId);

            // Đánh dấu kho đã được trừ ngay khi tạo đơn.
            ps.setTimestamp(8, java.sql.Timestamp.valueOf(now));
            ps.setString(9, paymentMethod);
            ps.setString(10, awaitingTransfer ? "UNPAID" : "PAID");
            ps.setBigDecimal(11, subtotal);
            ps.setBigDecimal(12, discount);
            ps.setTimestamp(13, java.sql.Timestamp.valueOf(now));
            ps.setString(14, "IN_STORE_SALE");

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
     * Tạo hóa đơn cho đơn bán tại quầy.
     */
    private String insertInvoice(int orderId, int sellerId, LocalDateTime now) {
        String invoiceNumber = makeNumber("INV");

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
                sellerId
        );

        return invoiceNumber;
    }

    /**
     * Khóa đơn tại quầy để hoàn tất hoặc hủy.
     */
    private TransferOrder lockOrder(int orderId) {
        List<TransferOrder> found = jdbc.query(
                """
                SELECT
                    o.order_number,
                    o.order_status,
                    o.payment_status,
                    o.payment_method,
                    COALESCE(o.items_amount, o.total_amount) AS subtotal,
                    COALESCE(o.manual_discount_amount, 0) AS discount_amount,
                    o.total_amount,
                    o.created_by,
                    (SELECT i.invoice_number FROM invoice i WHERE i.order_id = o.order_id) AS invoice_number
                FROM orders o
                WHERE o.order_id = ? AND o.order_type = 'In-Store'
                FOR UPDATE
                """,
                (rs, rowNum) -> new TransferOrder(
                        rs.getString("order_number"),
                        rs.getString("order_status"),
                        rs.getString("payment_status"),
                        rs.getString("payment_method"),
                        rs.getBigDecimal("subtotal"),
                        rs.getBigDecimal("discount_amount"),
                        rs.getBigDecimal("total_amount"),
                        rs.getInt("created_by"),
                        rs.getString("invoice_number")
                ),
                orderId
        );

        if (found.isEmpty()) {
            throw new ApiException(404, "NOT_FOUND", "Không tìm thấy hóa đơn bán hàng tại quầy.");
        }

        return found.get(0);
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

    private String makeNumber(String prefix) {
        String date = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase();
        return prefix + "-" + date + "-" + suffix;
    }

    private ApiException badRequest(String message) {
        return new ApiException(
                400,
                "INVALID_SALE",
                message
        );
    }

    /**
     * Thông tin đơn tại quầy khi hoàn tất hoặc hủy chuyển khoản.
     */
    private record TransferOrder(
            String orderNumber,
            String orderStatus,
            String paymentStatus,
            String paymentMethod,
            BigDecimal subtotal,
            BigDecimal discount,
            BigDecimal total,
            int createdBy,
            String invoiceNumber
    ) {
    }

    /**
     * Dữ liệu một biến thể sản phẩm được đọc từ database.
     */
    private record SaleLine(
            int detailId,
            int productId,
            int stockQuantity,
            int held,
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
                int held,
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
                    held,
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

        SaleLine priced(BigDecimal unitPrice) {
            return new SaleLine(
                    detailId,
                    productId,
                    stockQuantity,
                    held,
                    unitPrice,
                    size,
                    color,
                    detailStatus,
                    productName,
                    productStatus,
                    quantity,
                    unitPrice.multiply(BigDecimal.valueOf(quantity))
            );
        }
    }
}