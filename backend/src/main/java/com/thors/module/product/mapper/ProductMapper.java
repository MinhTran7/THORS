
package com.thors.module.product.mapper;

import com.thors.module.product.entity.Product;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

public class ProductMapper implements RowMapper<Product> {

    @Override
    public Product mapRow(ResultSet rs, int rowNum)
            throws SQLException {

        Product product = new Product();

        // Thông tin sản phẩm
        product.setProductId(rs.getInt("product_id"));
        product.setCategoryId(rs.getInt("category_id"));
        product.setCategoryName(rs.getString("category_name"));
        product.setProductName(rs.getString("product_name"));
        product.setDescription(rs.getString("description"));
        product.setStatus(rs.getString("status"));

        // Ảnh đại diện
        product.setPrimaryImageUrl(
                rs.getString("primary_image_url")
        );

        // Giá bán của các biến thể
        product.setMinPrice(
                rs.getBigDecimal("min_price")
        );
        product.setMaxPrice(
                rs.getBigDecimal("max_price")
        );

        // Tổng tồn kho
        product.setTotalStock(
                rs.getInt("total_stock")
        );

        // Tổng số biến thể
        product.setVariantCount(
                rs.getInt("variant_count")
        );

        // Số biến thể đang bật bán online
        product.setOnlineVariantCount(
                rs.getInt("online_variant_count")
        );

        // Các cột chỉ có ở truy vấn danh sách (findAll); truy vấn chi tiết không có thì bỏ qua
        Set<String> columns = columns(rs);
        if (columns.contains("sku")) {
            product.setSku(rs.getString("sku"));
        }
        if (columns.contains("active_variant_count")) {
            product.setActiveVariantCount(rs.getInt("active_variant_count"));
            product.setSellableStock(rs.getInt("sellable_stock"));
            product.setOutOfStockVariantCount(rs.getInt("out_variant_count"));
            product.setLowStockVariantCount(rs.getInt("low_variant_count"));
            product.setSearchText(rs.getString("search_text"));
        }

        return product;
    }

    private static Set<String> columns(ResultSet rs) throws SQLException {
        ResultSetMetaData meta = rs.getMetaData();
        Set<String> names = new HashSet<>();
        for (int i = 1; i <= meta.getColumnCount(); i++) {
            names.add(meta.getColumnLabel(i).toLowerCase(Locale.ROOT));
        }
        return names;
    }
}
