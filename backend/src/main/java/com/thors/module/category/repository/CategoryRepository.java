
package com.thors.module.category.repository;

import com.thors.module.category.entity.Category;
import com.thors.module.category.mapper.CategoryMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.List;

@Repository
public class CategoryRepository {

    private final JdbcTemplate jdbcTemplate;

    public CategoryRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<Category> findAll() {

        String sql = """
                SELECT category_id,
                       category_name,
                       description,
                       status
                FROM category
                ORDER BY category_id DESC
                """;

        return jdbcTemplate.query(sql, new CategoryMapper());
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

    public Optional<Category> findById(int categoryId) {
        String sql = """
            SELECT category_id, category_name, description, status
            FROM category
            WHERE category_id = ?
            """;

        return jdbcTemplate.query(
                sql,
                new CategoryMapper(),
                categoryId
        ).stream().findFirst();
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

    public int updateStatus(int categoryId, String status) {
        String sql = """
        UPDATE category
        SET status = ?
        WHERE category_id = ?
        """;

        return jdbcTemplate.update(sql, status, categoryId);
    }


}
