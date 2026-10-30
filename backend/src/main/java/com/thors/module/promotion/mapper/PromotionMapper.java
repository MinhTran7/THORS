
package com.thors.module.promotion.mapper;

import com.thors.module.promotion.entity.Promotion;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;

public class PromotionMapper implements RowMapper<Promotion> {

    @Override
    public Promotion mapRow(ResultSet rs, int rowNum) throws SQLException {
        Timestamp startTimestamp = rs.getTimestamp("start_date");
        Timestamp endTimestamp = rs.getTimestamp("end_date");

        return new Promotion(
                rs.getInt("promotion_id"),
                rs.getString("name"),
                rs.getString("description"),
                rs.getBigDecimal("discount_value"),
                startTimestamp == null ? null : startTimestamp.toLocalDateTime(),
                endTimestamp == null ? null : endTimestamp.toLocalDateTime(),
                rs.getString("status"),
                rs.getObject("created_by", Integer.class),
                rs.getString("discount_type"),
                rs.getBigDecimal("min_order_value"),
                rs.getBigDecimal("max_discount_amount"),
                rs.getObject("usage_limit", Integer.class)
        );
    }
}
