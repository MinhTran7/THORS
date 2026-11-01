package com.thors.module.shippingaddress.repository;

import com.thors.common.ApiException;
import com.thors.module.shippingaddress.entity.ShippingAddress;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public class ShippingAddressRepository {

    private final JdbcTemplate jdbc;

    private static LocalDateTime toLocalDateTime(Timestamp ts) {
        return ts != null ? ts.toLocalDateTime() : LocalDateTime.now();
    }

    private final RowMapper<ShippingAddress> mapper = (rs, rowNum) -> new ShippingAddress(
            rs.getInt("address_id"),
            rs.getInt("user_id"),
            rs.getString("recipient_name"),
            rs.getString("phone"),
            rs.getString("province_code"),
            rs.getString("province_name"),
            rs.getString("district_code"),
            rs.getString("district_name"),
            rs.getString("ward_code"),
            rs.getString("ward_name"),
            rs.getString("address_detail"),
            rs.getBigDecimal("latitude"),
            rs.getBigDecimal("longitude"),
            rs.getBoolean("is_default"),
            toLocalDateTime(rs.getTimestamp("created_at")),
            toLocalDateTime(rs.getTimestamp("updated_at")));

    public ShippingAddressRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public int countActiveByUser(int userId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM shipping_address WHERE user_id = ? AND is_deleted = 0",
                Integer.class, userId);
        return count == null ? 0 : count;
    }

    public List<ShippingAddress> findAllActive(int userId) {
        return jdbc.query("""
                SELECT * FROM shipping_address
                WHERE user_id = ? AND is_deleted = 0
                ORDER BY is_default DESC, created_at DESC, address_id DESC
                """, mapper, userId);
    }

    public Optional<ShippingAddress> findActiveById(int userId, int addressId) {
        return jdbc.query("""
                SELECT * FROM shipping_address
                WHERE user_id = ? AND address_id = ? AND is_deleted = 0
                """, mapper, userId, addressId).stream().findFirst();
    }

    public void clearDefault(int userId) {
        jdbc.update("""
                UPDATE shipping_address SET is_default = 0
                WHERE user_id = ? AND is_deleted = 0
                """, userId);
    }

    public int insert(int userId, String recipientName, String phone,
                      String provinceCode, String provinceName,
                      String districtCode, String districtName,
                      String wardCode, String wardName, String addressDetail,
                      BigDecimal latitude, BigDecimal longitude, boolean isDefault) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO shipping_address (
                        user_id, recipient_name, phone,
                        province_code, province_name,
                        district_code, district_name,
                        ward_code, ward_name,
                        address_detail, latitude, longitude, is_default, is_deleted,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, userId);
            ps.setString(2, recipientName);
            ps.setString(3, phone);
            ps.setString(4, provinceCode);
            ps.setString(5, provinceName);
            ps.setString(6, districtCode);
            ps.setString(7, districtName);
            ps.setString(8, wardCode);
            ps.setString(9, wardName);
            ps.setString(10, addressDetail);
            ps.setBigDecimal(11, latitude);
            ps.setBigDecimal(12, longitude);
            ps.setBoolean(13, isDefault);
            return ps;
        }, keyHolder);

        Number key = keyHolder.getKey();
        if (key != null) {
            return key.intValue();
        }
        return findLatestId(userId)
                .orElseThrow(() -> new ApiException(500, "ADDRESS_CREATE_FAILED", "Không thể tạo địa chỉ giao hàng."));
    }

    public Optional<Integer> findLatestId(int userId) {
        return jdbc.query("""
                SELECT address_id FROM shipping_address
                WHERE user_id = ? ORDER BY address_id DESC LIMIT 1
                """, (rs, rowNum) -> rs.getInt("address_id"), userId).stream().findFirst();
    }

    public int update(int userId, int addressId, String recipientName, String phone,
                      String provinceCode, String provinceName,
                      String districtCode, String districtName,
                      String wardCode, String wardName, String addressDetail,
                      BigDecimal latitude, BigDecimal longitude) {
        return jdbc.update("""
                UPDATE shipping_address
                SET recipient_name = ?, phone = ?,
                    province_code = ?, province_name = ?,
                    district_code = ?, district_name = ?,
                    ward_code = ?, ward_name = ?, address_detail = ?,
                    latitude = ?, longitude = ?, updated_at = NOW()
                WHERE user_id = ? AND address_id = ? AND is_deleted = 0
                """, recipientName, phone,
                provinceCode, provinceName,
                districtCode, districtName,
                wardCode, wardName, addressDetail,
                latitude, longitude, userId, addressId);
    }

    public int setDefault(int userId, int addressId) {
        return jdbc.update("""
                UPDATE shipping_address SET is_default = 1
                WHERE user_id = ? AND address_id = ? AND is_deleted = 0
                """, userId, addressId);
    }

    public int softDelete(int userId, int addressId) {
        return jdbc.update("""
                UPDATE shipping_address SET is_deleted = 1
                WHERE user_id = ? AND address_id = ? AND is_deleted = 0 AND is_default = 0
                """, userId, addressId);
    }
}
