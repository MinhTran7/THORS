
package com.thors.module.category.mapper;

import com.thors.module.category.entity.Category;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;

public class CategoryMapper implements RowMapper<Category> {

    @Override
    public Category mapRow(ResultSet rs, int rowNum)
            throws SQLException {

        Category category = new Category();

        category.setCategoryId(rs.getInt("category_id"));
        category.setCategoryName(rs.getString("category_name"));
        category.setDescription(rs.getString("description"));
        category.setStatus(rs.getString("status"));

        // Các cột danh mục cha / đối tượng chỉ có khi đã chạy migration 2026-11-10_category_hierarchy.sql
        ResultSetMetaData meta = rs.getMetaData();
        if (hasColumn(meta, "parent_id")) {
            int parentId = rs.getInt("parent_id");
            category.setParentId(rs.wasNull() ? null : parentId);
        }
        if (hasColumn(meta, "parent_name")) {
            category.setParentName(rs.getString("parent_name"));
        }
        if (hasColumn(meta, "target_group")) {
            category.setTargetGroup(rs.getString("target_group"));
        }
        if (hasColumn(meta, "child_count")) {
            category.setChildCount(rs.getInt("child_count"));
        }

        return category;
    }

    private static boolean hasColumn(ResultSetMetaData meta, String name) throws SQLException {
        for (int i = 1; i <= meta.getColumnCount(); i++) {
            if (name.equalsIgnoreCase(meta.getColumnLabel(i))) {
                return true;
            }
        }
        return false;
    }
}
