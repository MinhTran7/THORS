package com.thors.module.order.repository;

import java.sql.ResultSet;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Minh chứng giao hàng (bảng order_delivery_proof, migration 2026-11-13_order_delivery_proof.sql).
 *
 * <p>Nhóm dùng chung một database và mỗi người tự chạy migration. Chưa có bảng thì {@link #ready()} trả
 * false và luồng giao hàng chạy như cũ (không bắt buộc ảnh). Chạy migration xong, tính năng tự bật trong
 * vòng {@link #RECHECK_MS} ms, không cần khởi động lại server.
 */
@Repository
public class DeliveryProofRepository {
    private static final Logger log = LoggerFactory.getLogger(DeliveryProofRepository.class);
    static final long RECHECK_MS = 60_000;

    private static final String CHECK_SQL =
            "SELECT COUNT(*) FROM information_schema.tables"
                    + " WHERE table_schema = DATABASE() AND LOWER(table_name) = 'order_delivery_proof'";

    /** Ảnh, ghi chú, thời điểm và người xác nhận đã giao. */
    public record Proof(List<String> imageUrls, String note, LocalDateTime createdAt, String createdByName) {}

    private final JdbcTemplate db;
    private volatile boolean ready;
    private volatile long checkedAt;

    public DeliveryProofRepository(JdbcTemplate db) {
        this.db = db;
    }

    /** true nếu DB đã có bảng order_delivery_proof. Có rồi thì nhớ luôn; chưa thì kiểm tra lại sau mỗi phút. */
    public boolean ready() {
        if (ready) return true;
        long now = System.currentTimeMillis();
        if (now - checkedAt < RECHECK_MS) return false;
        synchronized (this) {
            if (ready || now - checkedAt < RECHECK_MS) return ready;
            checkedAt = now;
            try {
                Integer found = db.queryForObject(CHECK_SQL, Integer.class);
                ready = found != null && found == 1;
            } catch (RuntimeException e) {
                ready = false;
            }
            if (!ready)
                log.info("Minh chứng giao hàng đang tắt: database chưa chạy migration 2026-11-13_order_delivery_proof.sql");
            return ready;
        }
    }

    public void insert(int orderId, List<String> imageUrls, String note, int createdBy) {
        db.update(
                "INSERT INTO order_delivery_proof (order_id, image_urls, note, created_by) VALUES (?, ?, ?, ?)",
                orderId,
                String.join("\n", imageUrls),
                note,
                createdBy);
    }

    public Optional<Proof> find(int orderId) {
        if (!ready()) return Optional.empty();
        return db.query(
                        """
                        SELECT p.image_urls, p.note, p.created_at, u.full_name
                        FROM order_delivery_proof p
                        LEFT JOIN `user` u ON u.user_id = p.created_by
                        WHERE p.order_id = ?
                        """,
                        (ResultSet rs, int i) ->
                                new Proof(
                                        Arrays.stream(rs.getString("image_urls").split("\n"))
                                                .filter(s -> !s.isBlank())
                                                .toList(),
                                        rs.getString("note"),
                                        rs.getObject("created_at", LocalDateTime.class),
                                        rs.getString("full_name")),
                        orderId)
                .stream()
                .findFirst();
    }
}
