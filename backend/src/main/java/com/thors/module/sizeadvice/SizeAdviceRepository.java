package com.thors.module.sizeadvice;

import com.thors.module.sizeadvice.SizeAdvisor.FitStats;
import com.thors.module.sizeadvice.SizeAdvisor.Peer;
import com.thors.module.sizeadvice.SizeAdvisor.Profile;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Đọc/ghi số đo, đánh giá Chật/Vừa/Rộng và dữ liệu đơn hàng cho việc gợi ý size. */
@Repository
public class SizeAdviceRepository {
    private final JdbcTemplate db;

    public SizeAdviceRepository(JdbcTemplate db) {
        this.db = db;
    }

    /** Một dòng đơn online đã nhận của khách. returnReason != null nếu món này có yêu cầu đổi trả (chưa bị từ chối). */
    public record PurchasedItem(
            int orderItemId,
            int productId,
            String categoryName,
            String size,
            String fit,
            String returnReason) {}

    /** Một dòng của đơn để hiện nút đánh giá: kèm trạng thái đơn. */
    public record OrderLine(int orderItemId, String categoryName, String size, String fit, String orderStatus) {}

    public Profile profile(int userId) {
        return db.queryForObject(
                "SELECT height_cm, weight_kg, foot_length_mm, fit_preference FROM `user` WHERE user_id=?",
                (rs, i) -> new Profile(
                        rs.getObject("height_cm", Integer.class),
                        rs.getObject("weight_kg", Integer.class),
                        rs.getObject("foot_length_mm", Integer.class),
                        rs.getString("fit_preference")),
                userId);
    }

    /** Tên danh mục của sản phẩm đang bán; rỗng nếu không có sản phẩm. */
    public Optional<String> categoryOf(int productId) {
        return db.query(
                        """
                        SELECT c.category_name FROM product p JOIN category c ON c.category_id = p.category_id
                        WHERE p.product_id = ?
                        """,
                        (rs, i) -> rs.getString(1),
                        productId)
                .stream()
                .findFirst();
    }

    /** Tồn có thể bán theo size (cộng mọi màu), cùng cách tính với trang sản phẩm của shop. */
    public Map<String, Integer> stockBySize(int productId) {
        Map<String, Integer> result = new LinkedHashMap<>();
        db.query(
                """
                SELECT pd.size,
                       SUM(GREATEST(pd.stock_quantity - COALESCE((
                           SELECT SUM(oi.reserved_quantity) FROM order_item oi
                           JOIN orders o ON o.order_id = oi.order_id
                           WHERE oi.detail_id = pd.detail_id AND o.stock_hold_status IN ('TEMPORARY', 'PAID')
                       ), 0), 0)) AS stock
                FROM product_detail pd
                WHERE pd.product_id = ? AND pd.status = 'ACTIVE' AND pd.online_sales_enabled = 1
                GROUP BY pd.size
                ORDER BY MIN(pd.detail_id)
                """,
                rs -> {
                    result.put(rs.getString("size"), rs.getInt("stock"));
                },
                productId);
        return result;
    }

    /** 60 món gần nhất khách đã nhận qua đơn online. */
    public List<PurchasedItem> purchasedItems(int userId) {
        return db.query(
                """
                SELECT oi.order_item_id, pd.product_id, c.category_name, oi.size_snapshot, f.fit,
                       (SELECT CONCAT_WS(' ', rr.reason, rri.item_reason)
                          FROM return_request_item rri
                          JOIN return_request rr ON rr.return_request_id = rri.return_request_id
                         WHERE rri.order_item_id = oi.order_item_id AND rr.status <> 'REJECTED'
                         ORDER BY rr.return_request_id DESC LIMIT 1) AS return_reason
                FROM order_item oi
                JOIN orders o ON o.order_id = oi.order_id
                JOIN product_detail pd ON pd.detail_id = oi.detail_id
                JOIN product p ON p.product_id = pd.product_id
                JOIN category c ON c.category_id = p.category_id
                LEFT JOIN order_item_fit_feedback f ON f.order_item_id = oi.order_item_id
                WHERE o.user_id = ? AND o.order_type = 'Online' AND o.order_status IN ('DELIVERED', 'COMPLETED')
                ORDER BY o.order_date DESC, oi.order_item_id
                LIMIT 60
                """,
                (rs, i) -> new PurchasedItem(
                        rs.getInt("order_item_id"),
                        rs.getInt("product_id"),
                        rs.getString("category_name"),
                        rs.getString("size_snapshot"),
                        rs.getString("fit"),
                        rs.getString("return_reason")),
                userId);
    }

    /** Thống kê Chật/Vừa/Rộng theo từng sản phẩm. */
    public Map<Integer, FitStats> fitStats(Collection<Integer> productIds) {
        if (productIds.isEmpty()) return Map.of();
        String marks = productIds.stream().map(id -> "?").collect(Collectors.joining(","));
        Map<Integer, int[]> raw = new HashMap<>();
        db.query(
                "SELECT pd.product_id, f.fit, COUNT(*) AS n FROM order_item_fit_feedback f"
                        + " JOIN order_item oi ON oi.order_item_id = f.order_item_id"
                        + " JOIN product_detail pd ON pd.detail_id = oi.detail_id"
                        + " WHERE pd.product_id IN (" + marks + ") GROUP BY pd.product_id, f.fit",
                rs -> {
                    int[] c = raw.computeIfAbsent(rs.getInt("product_id"), k -> new int[3]);
                    int n = rs.getInt("n");
                    switch (rs.getString("fit")) {
                        case "TIGHT" -> c[0] += n;
                        case "TRUE" -> c[1] += n;
                        case "LOOSE" -> c[2] += n;
                        default -> {}
                    }
                },
                productIds.toArray());
        Map<Integer, FitStats> result = new HashMap<>();
        raw.forEach((id, c) -> result.put(id, new FitStats(c[0], c[1], c[2])));
        return result;
    }

    /** Khách khác đã mua sản phẩm này và đánh giá Vừa, kèm số đo lúc đánh giá. */
    public List<Peer> fittingPeers(int productId, int excludeUserId) {
        return db.query(
                """
                SELECT oi.size_snapshot, f.height_cm, f.weight_kg, f.foot_length_mm
                FROM order_item_fit_feedback f
                JOIN order_item oi ON oi.order_item_id = f.order_item_id
                JOIN product_detail pd ON pd.detail_id = oi.detail_id
                WHERE pd.product_id = ? AND f.fit = 'TRUE' AND f.user_id <> ?
                """,
                (rs, i) -> new Peer(
                        rs.getString("size_snapshot"),
                        rs.getObject("height_cm", Integer.class),
                        rs.getObject("weight_kg", Integer.class),
                        rs.getObject("foot_length_mm", Integer.class)),
                productId,
                excludeUserId);
    }

    /** Các dòng của một đơn online thuộc khách này (rỗng nếu đơn không phải của khách). */
    public List<OrderLine> orderLines(int orderId, int userId) {
        return db.query(
                """
                SELECT oi.order_item_id, c.category_name, oi.size_snapshot, f.fit, o.order_status
                FROM order_item oi
                JOIN orders o ON o.order_id = oi.order_id
                JOIN product_detail pd ON pd.detail_id = oi.detail_id
                JOIN product p ON p.product_id = pd.product_id
                JOIN category c ON c.category_id = p.category_id
                LEFT JOIN order_item_fit_feedback f ON f.order_item_id = oi.order_item_id
                WHERE o.order_id = ? AND o.user_id = ? AND o.order_type = 'Online'
                ORDER BY oi.order_item_id
                """,
                (rs, i) -> new OrderLine(
                        rs.getInt("order_item_id"),
                        rs.getString("category_name"),
                        rs.getString("size_snapshot"),
                        rs.getString("fit"),
                        rs.getString("order_status")),
                orderId,
                userId);
    }

    /** Dòng đơn thuộc khách này (để kiểm tra trước khi ghi đánh giá). */
    public Optional<OrderLine> orderLine(int orderItemId, int userId) {
        return db.query(
                        """
                        SELECT oi.order_item_id, c.category_name, oi.size_snapshot, f.fit, o.order_status
                        FROM order_item oi
                        JOIN orders o ON o.order_id = oi.order_id
                        JOIN product_detail pd ON pd.detail_id = oi.detail_id
                        JOIN product p ON p.product_id = pd.product_id
                        JOIN category c ON c.category_id = p.category_id
                        LEFT JOIN order_item_fit_feedback f ON f.order_item_id = oi.order_item_id
                        WHERE oi.order_item_id = ? AND o.user_id = ? AND o.order_type = 'Online'
                        """,
                        (rs, i) -> new OrderLine(
                                rs.getInt("order_item_id"),
                                rs.getString("category_name"),
                                rs.getString("size_snapshot"),
                                rs.getString("fit"),
                                rs.getString("order_status")),
                        orderItemId,
                        userId)
                .stream()
                .findFirst();
    }

    /** Ghi (hoặc ghi đè) đánh giá, kèm số đo hiện tại của khách. */
    public void saveFeedback(int orderItemId, int userId, String fit, Profile p) {
        db.update(
                """
                INSERT INTO order_item_fit_feedback (order_item_id, user_id, fit, height_cm, weight_kg, foot_length_mm)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE fit = VALUES(fit), height_cm = VALUES(height_cm),
                    weight_kg = VALUES(weight_kg), foot_length_mm = VALUES(foot_length_mm)
                """,
                orderItemId, userId, fit, p.heightCm(), p.weightKg(), p.footMm());
    }

    public void deleteFeedback(int orderItemId, int userId) {
        db.update("DELETE FROM order_item_fit_feedback WHERE order_item_id = ? AND user_id = ?", orderItemId, userId);
    }
}
