package com.thors.module.promotion.mapper;

import com.thors.module.promotion.entity.Promotion;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;

public class PromotionMapper implements RowMapper<Promotion> {

    @Override
    public Promotion mapRow(ResultSet rs, int rowNum) throws SQLException {
        Timestamp start = rs.getTimestamp("start_date");
        Timestamp end = rs.getTimestamp("end_date");

        return new Promotion(
                rs.getInt("promotion_id"),
                rs.getString("promotion_type"),
                rs.getString("name"),
                rs.getString("description"),
                rs.getString("discount_type"),
                rs.getBigDecimal("discount_value"),
                rs.getBigDecimal("min_order_value"),
                rs.getObject("usage_limit", Integer.class),
                rs.getInt("used_count"),
                rs.getString("apply_scope"),
                List.of(),
                start == null ? null : start.toLocalDateTime(),
                end == null ? null : end.toLocalDateTime(),
                rs.getString("status"),
                rs.getObject("created_by", Integer.class)
        );
    }
}
