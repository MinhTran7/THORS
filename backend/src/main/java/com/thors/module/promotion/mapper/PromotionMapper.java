
package com.thors.module.promotion.mapper;

import com.thors.module.promotion.entity.Promotion;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.SQLException;

public class PromotionMapper implements RowMapper<Promotion> {

    @Override
    public Promotion mapRow(ResultSet rs, int rowNum) throws SQLException {
        Integer usageLimit = rs.getObject("usage_limit", Integer.class);

        return new Promotion(
                rs.getInt("promotion_id"),
                rs.getString("name"),
                rs.getString("description"),
                rs.getBigDecimal("discount_value"),
                rs.getDate("start_date").toLocalDate(),
                rs.getDate("end_date").toLocalDate(),
                rs.getString("status"),
                rs.getInt("created_by"),
                rs.getString("discount_type"),
                rs.getBigDecimal("min_order_value"),
                rs.getBigDecimal("max_discount_amount"),
                usageLimit
        );
    }
}
