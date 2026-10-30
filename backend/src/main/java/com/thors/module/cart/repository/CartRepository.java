package com.thors.module.cart.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;

@Repository
public class CartRepository {

    private static final String ITEM_SELECT = """
        SELECT
            ci.cart_item_id AS cartItemId,
            pd.detail_id AS detailId,
            p.product_id AS productId,
            p.product_name AS productName,
            pd.size AS size,
            pd.color AS color,
            pd.price AS price,
            ci.quantity AS quantity,
            (
                SELECT pi.image_url
                FROM product_image pi
                WHERE pi.product_id = p.product_id
                  AND pi.deleted_at IS NULL
                ORDER BY pi.is_primary DESC, pi.image_id ASC
                LIMIT 1
            ) AS imageUrl,
            (p.status = 'ACTIVE'
             AND pd.status = 'ACTIVE'
             AND pd.online_sales_enabled = 1) AS available
        FROM cart c
        INNER JOIN cart_item ci ON ci.cart_id = c.cart_id
        INNER JOIN product_detail pd ON pd.detail_id = ci.detail_id
        INNER JOIN product p ON p.product_id = pd.product_id
        WHERE c.user_id = ?
        """;

    private final JdbcTemplate jdbcTemplate;

    public CartRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<Map<String, Object>> findItems(int userId) {
        return jdbcTemplate.queryForList(
                ITEM_SELECT + " ORDER BY ci.cart_item_id DESC", userId);
    }

    /** Trả về null nếu món không thuộc giỏ của user này. */
    public Map<String, Object> findItem(int userId, int cartItemId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                ITEM_SELECT + " AND ci.cart_item_id = ?", userId, cartItemId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Thông tin một biến thể (để kiểm tra trước khi thêm vào giỏ). Null nếu không tồn tại. */
    public Map<String, Object> findDetail(int detailId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                   (p.status = 'ACTIVE'
                    AND pd.status = 'ACTIVE'
                    AND pd.online_sales_enabled = 1) AS available
            FROM product_detail pd
            INNER JOIN product p ON p.product_id = pd.product_id
            WHERE pd.detail_id = ?
            """, detailId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public int getOrCreateCartId(int userId) {
        jdbcTemplate.update("INSERT IGNORE INTO cart (user_id) VALUES (?)", userId);
        Integer id = jdbcTemplate.queryForObject(
                "SELECT cart_id FROM cart WHERE user_id = ?", Integer.class, userId);
        return id == null ? 0 : id;
    }

    /** Số lượng hiện có của biến thể trong giỏ, 0 nếu chưa có. */
    public int findQuantity(int cartId, int detailId) {
        List<Integer> rows = jdbcTemplate.queryForList(
                "SELECT quantity FROM cart_item WHERE cart_id = ? AND detail_id = ?",
                Integer.class, cartId, detailId);
        return rows.isEmpty() ? 0 : rows.get(0);
    }

    public void upsertItem(int cartId, int detailId, int quantity) {
        jdbcTemplate.update("""
            INSERT INTO cart_item (cart_id, detail_id, quantity)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)
            """, cartId, detailId, quantity);
    }

    public int updateQuantity(int userId, int cartItemId, int quantity) {
        return jdbcTemplate.update("""
            UPDATE cart_item
            SET quantity = ?
            WHERE cart_item_id = ?
              AND cart_id = (SELECT cart_id FROM cart WHERE user_id = ?)
            """, quantity, cartItemId, userId);
    }

    public int deleteItem(int userId, int cartItemId) {
        return jdbcTemplate.update("""
            DELETE FROM cart_item
            WHERE cart_item_id = ?
              AND cart_id = (SELECT cart_id FROM cart WHERE user_id = ?)
            """, cartItemId, userId);
    }
}