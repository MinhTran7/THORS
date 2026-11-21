
package com.thors.module.category.repository;

import com.thors.module.category.entity.Category;
import com.thors.module.category.mapper.CategoryMapper;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.List;

/**
 * Danh mục sản phẩm. Các cột parent_id / target_group đến từ migration 2026-11-10_category_hierarchy.sql;
 * nếu DB chưa chạy migration thì đọc theo câu lệnh cũ (mọi danh mục là danh mục gốc, chưa gắn đối tượng).
 */
@Repository
public class CategoryRepository {

    private final JdbcTemplate jdbcTemplate;

    public CategoryRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Như SELECT_WITH_HIERARCHY + cột icon (migration 2026-11-11_category_icon.sql). */
    private static final String SELECT_WITH_ICON = """
            SELECT c.category_id,
                   c.category_name,
                   c.description,
                   c.status,
                   c.parent_id,
                   c.target_group,
                   c.icon,
                   p.category_name AS parent_name,
                   (SELECT COUNT(*) FROM category ch WHERE ch.parent_id = c.category_id) AS child_count
            FROM category c
            LEFT JOIN category p ON p.category_id = c.parent_id
            """;

    private static final String SELECT_WITH_HIERARCHY = """
            SELECT c.category_id,
                   c.category_name,
                   c.description,
                   c.status,
                   c.parent_id,
                   c.target_group,
                   p.category_name AS parent_name,
                   (SELECT COUNT(*) FROM category ch WHERE ch.parent_id = c.category_id) AS child_count
            FROM category c
            LEFT JOIN category p ON p.category_id = c.parent_id
            """;

    private static final String SELECT_LEGACY = """
            SELECT c.category_id,
                   c.category_name,
                   c.description,
                   c.status
            FROM category c
            """;

    public List<Category> findAll() {
        try {
            return jdbcTemplate.query(
                    SELECT_WITH_ICON + " ORDER BY c.category_id DESC",
                    new CategoryMapper());
        } catch (BadSqlGrammarException ignored) {
            // DB chưa có cột icon -> đọc như trước
        }
        try {
            return jdbcTemplate.query(
                    SELECT_WITH_HIERARCHY + " ORDER BY c.category_id DESC",
                    new CategoryMapper());
        } catch (BadSqlGrammarException e) {
            return jdbcTemplate.query(
                    SELECT_LEGACY + " ORDER BY c.category_id DESC",
                    new CategoryMapper());
        }
    }

    /** DB đã có cột parent_id / target_group chưa (đã chạy migration chưa). */
    public boolean supportsHierarchy() {
        try {
            jdbcTemplate.queryForList("SELECT parent_id, target_group FROM category WHERE 1 = 0");
            return true;
        } catch (BadSqlGrammarException e) {
            return false;
        }
    }


    /** DB đã có cột icon chưa (đã chạy migration 2026-11-11_category_icon.sql chưa). */
    public boolean supportsIcon() {
        try {
            jdbcTemplate.queryForList("SELECT icon FROM category WHERE 1 = 0");
            return true;
        } catch (BadSqlGrammarException e) {
            return false;
        }
    }

    /** Gán icon theo id (null = về icon mặc định). */
    public int updateIcon(int categoryId, String icon) {
        return jdbcTemplate.update("UPDATE category SET icon = ? WHERE category_id = ?", icon, categoryId);
    }

    /** Gán icon cho danh mục vừa tạo (tên danh mục là duy nhất, không phân biệt hoa/thường). */
    public int updateIconByName(String categoryName, String icon) {
        return jdbcTemplate.update(
                "UPDATE category SET icon = ? WHERE LOWER(category_name) = LOWER(?)", icon, categoryName);
    }

    public boolean existsByName(String categoryName) {
        String sql = """
            SELECT COUNT(*)
            FROM category
            WHERE LOWER(category_name) = LOWER(?)
            """;

        Integer count = jdbcTemplate.queryForObject(
                sql,
                Integer.class,
                categoryName
        );

        return count != null && count > 0;
    }

    public int insert(String categoryName, String description) {
        String sql = """
            INSERT INTO category (
                category_name,
                description,
                status
            )
            VALUES (?, ?, 'ACTIVE')
            """;

        return jdbcTemplate.update(
                sql,
                categoryName,
                description
        );
    }

    /** Thêm danh mục kèm danh mục cha / đối tượng (cần migration). */
    public int insert(String categoryName, String description, Integer parentId, String targetGroup) {
        String sql = """
            INSERT INTO category (
                category_name,
                description,
                parent_id,
                target_group,
                status
            )
            VALUES (?, ?, ?, ?, 'ACTIVE')
            """;

        return jdbcTemplate.update(sql, categoryName, description, parentId, targetGroup);
    }

    public Optional<Category> findById(int categoryId) {
        try {
            return jdbcTemplate.query(
                    SELECT_WITH_ICON + " WHERE c.category_id = ?",
                    new CategoryMapper(),
                    categoryId
            ).stream().findFirst();
        } catch (BadSqlGrammarException ignored) {
            // DB chưa có cột icon -> đọc như trước
        }
        try {
            return jdbcTemplate.query(
                    SELECT_WITH_HIERARCHY + " WHERE c.category_id = ?",
                    new CategoryMapper(),
                    categoryId
            ).stream().findFirst();
        } catch (BadSqlGrammarException e) {
            return jdbcTemplate.query(
                    SELECT_LEGACY + " WHERE c.category_id = ?",
                    new CategoryMapper(),
                    categoryId
            ).stream().findFirst();
        }
    }

    public boolean existsByNameExceptId(
            String categoryName,
            int categoryId) {

        String sql = """
            SELECT COUNT(*)
            FROM category
            WHERE LOWER(category_name) = LOWER(?)
              AND category_id <> ?
            """;

        Integer count = jdbcTemplate.queryForObject(
                sql,
                Integer.class,
                categoryName,
                categoryId
        );

        return count != null && count > 0;
    }

    public int update(
            int categoryId,
            String categoryName,
            String description) {

        String sql = """
            UPDATE category
            SET category_name = ?,
                description = ?
            WHERE category_id = ?
            """;

        return jdbcTemplate.update(
                sql,
                categoryName,
                description,
                categoryId
        );
    }

    /** Cập nhật kèm danh mục cha / đối tượng (cần migration). */
    public int update(
            int categoryId,
            String categoryName,
            String description,
            Integer parentId,
            String targetGroup) {

        String sql = """
            UPDATE category
            SET category_name = ?,
                description = ?,
                parent_id = ?,
                target_group = ?
            WHERE category_id = ?
            """;

        return jdbcTemplate.update(sql, categoryName, description, parentId, targetGroup, categoryId);
    }

    public int updateStatus(int categoryId, String status) {
        String sql = """
        UPDATE category
        SET status = ?
        WHERE category_id = ?
        """;

        return jdbcTemplate.update(sql, status, categoryId);
    }

    /** Số danh mục con đang hoạt động (0 nếu DB chưa có cột parent_id). */
    public int countActiveChildren(int categoryId) {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM category WHERE parent_id = ? AND status = 'ACTIVE'",
                    Integer.class,
                    categoryId);
            return count == null ? 0 : count;
        } catch (BadSqlGrammarException e) {
            return 0;
        }
    }

}
