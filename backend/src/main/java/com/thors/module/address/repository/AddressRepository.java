package com.thors.module.address.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Map;

@Repository
public class AddressRepository {

    private static final String SELECT = """
        SELECT
            address_id AS id,
            recipient_name AS recipientName,
            phone AS phone,
            province_code AS provinceCode,
            province_name AS provinceName,
            ward_code AS wardCode,
            ward_name AS wardName,
            address_detail AS addressDetail,
            is_default AS isDefault
        FROM shipping_address
        WHERE user_id = ? AND is_deleted = 0
        """;

    private final JdbcTemplate jdbcTemplate;

    public AddressRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Địa chỉ của khách, mặc định đứng đầu, mới lưu đứng trước. */
    public List<Map<String, Object>> findByUser(int userId) {
        return jdbcTemplate.queryForList(SELECT + " ORDER BY is_default DESC, address_id DESC", userId);
    }

    /** Một địa chỉ của khách. Null nếu không tồn tại hoặc không thuộc khách này. */
    public Map<String, Object> findOne(int userId, int addressId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(SELECT + " AND address_id = ?", userId, addressId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public int countByUser(int userId) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM shipping_address WHERE user_id = ? AND is_deleted = 0",
                Integer.class, userId);
        return n == null ? 0 : n;
    }

    public void clearDefault(int userId) {
        jdbcTemplate.update("UPDATE shipping_address SET is_default = 0 WHERE user_id = ?", userId);
    }

    /** Thêm địa chỉ mới, trả về id vừa tạo. */
    public int insert(int userId, String recipientName, String phone,
                      String provinceCode, String provinceName,
                      String wardCode, String wardName,
                      String addressDetail, boolean isDefault) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                INSERT INTO shipping_address
                    (user_id, recipient_name, phone, province_code, province_name,
                     ward_code, ward_name, address_detail, is_default)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, userId);
            ps.setString(2, recipientName);
            ps.setString(3, phone);
            ps.setString(4, provinceCode);
            ps.setString(5, provinceName);
            ps.setString(6, wardCode);
            ps.setString(7, wardName);
            ps.setString(8, addressDetail);
            ps.setBoolean(9, isDefault);
            return ps;
        }, keyHolder);
        Number key = keyHolder.getKey();
        return key == null ? 0 : key.intValue();
    }
}