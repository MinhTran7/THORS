package com.thors.module.chat;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Bảng chat_knowledge (migration 2026-11-24_chat_rag.sql): các đoạn kiến thức và vector embedding của trợ lý AI.
 *
 * <p>Nhóm dùng chung một database và mỗi người tự chạy migration. Chưa có bảng thì {@link #ready()} = false và
 * trợ lý chạy như cũ (tìm theo tên); chạy migration xong thì tự nhận trong vòng {@link ChatRepository#RECHECK_MS} ms.
 */
@Repository
public class ChatKnowledgeRepository {

    /** Một dòng đã lưu: loại, khóa, nội dung, hash và vector. */
    public record Stored(String type, String key, String content, String hash, float[] vector) {
        public String id() {
            return type + ":" + key;
        }
    }

    /** Một sản phẩm đang bán, để lập đoạn kiến thức. */
    public record ProductDoc(int id, String name, String category, String description) {}

    private final JdbcTemplate db;
    private volatile boolean ready;
    private volatile long checkedAt;

    public ChatKnowledgeRepository(JdbcTemplate db) {
        this.db = db;
    }

    /** true nếu DB đã có bảng chat_knowledge. Có rồi thì nhớ luôn; chưa thì kiểm tra lại sau mỗi phút. */
    public boolean ready() {
        if (ready) return true;
        long now = System.currentTimeMillis();
        if (now - checkedAt < ChatRepository.RECHECK_MS) return false;
        synchronized (this) {
            if (ready) return true;
            checkedAt = now;
            try {
                Integer n = db.queryForObject(
                        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()"
                                + " AND LOWER(table_name) = 'chat_knowledge'",
                        Integer.class);
                ready = n != null && n == 1;
            } catch (RuntimeException e) {
                ready = false;
            }
            return ready;
        }
    }

    public List<Stored> loadAll() {
        return db.query(
                "SELECT source_type, source_key, content, content_hash, embedding FROM chat_knowledge",
                (rs, i) -> new Stored(
                        rs.getString("source_type"),
                        rs.getString("source_key"),
                        rs.getString("content"),
                        rs.getString("content_hash"),
                        ChatKnowledge.fromBytes(rs.getBytes("embedding"))));
    }

    public void upsert(String type, String key, String content, String hash, float[] vector, String model) {
        db.update(
                "INSERT INTO chat_knowledge (source_type, source_key, content, content_hash, embedding, model, updated_at)"
                        + " VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())"
                        + " ON DUPLICATE KEY UPDATE content = VALUES(content), content_hash = VALUES(content_hash),"
                        + " embedding = VALUES(embedding), model = VALUES(model), updated_at = UTC_TIMESTAMP()",
                type, key, content, hash, ChatKnowledge.toBytes(vector), model);
    }

    /** Xóa các dòng không còn trong keep (dạng "TYPE:key"), ví dụ sản phẩm đã ngừng bán; trả số dòng đã xóa. */
    public int deleteExcept(Set<String> keep) {
        List<Object[]> gone = new ArrayList<>();
        for (Stored s : db.query(
                "SELECT source_type, source_key FROM chat_knowledge",
                (rs, i) -> new Stored(rs.getString(1), rs.getString(2), null, null, null)))
            if (!keep.contains(s.id())) gone.add(new Object[] {s.type(), s.key()});
        if (gone.isEmpty()) return 0;
        db.batchUpdate("DELETE FROM chat_knowledge WHERE source_type = ? AND source_key = ?", gone);
        return gone.size();
    }

    /** Sản phẩm đang bán online (cùng điều kiện với trang cửa hàng). */
    public List<ProductDoc> productsForIndex() {
        return db.query(
                "SELECT p.product_id, p.product_name, c.category_name, p.description"
                        + " FROM product p"
                        + " INNER JOIN category c ON c.category_id = p.category_id AND c.status = 'ACTIVE'"
                        + " WHERE p.status = 'ACTIVE' AND EXISTS (SELECT 1 FROM product_detail pd"
                        + "   WHERE pd.product_id = p.product_id AND pd.status = 'ACTIVE' AND pd.online_sales_enabled = 1)"
                        + " ORDER BY p.product_id",
                (rs, i) -> new ProductDoc(
                        rs.getInt("product_id"),
                        rs.getString("product_name"),
                        rs.getString("category_name"),
                        rs.getString("description")));
    }
}
