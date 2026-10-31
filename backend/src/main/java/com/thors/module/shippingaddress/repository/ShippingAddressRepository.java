package com.thors.module.shippingaddress.repository;

import com.thors.module.shippingaddress.entity.ShippingAddress;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Repository
public class ShippingAddressRepository {

    private final JdbcTemplate jdbc;

    private final RowMapper<ShippingAddress> mapper = (rs, rowNum) -> new ShippingAddress(
            rs.getInt("address_id"),
            rs.getInt("user_id"),
            rs.getString("recipient_name"),
            rs.getString("phone"),
            rs.getString("province_code"),
            rs.getString("province_name"),
            rs.getString("ward_code"),
            rs.getString("ward_name"),
            rs.getString("address_detail"),
            rs.getBigDecimal("latitude"),
            rs.getBigDecimal("longitude"),
            rs.getBoolean("is_default"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime());

    public ShippingAddressRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Khóa dòng user để tuần tự hóa thao tác thêm/đổi địa chỉ của cùng một Customer. */
    public void lockCustomer(int userId) {
        Integer found = jdbc.queryForObject(
                "SELECT user_id FROM `user` WHERE user_id = ? FOR UPDATE",
                Integer.class, userId);
        if (found == null) {
            throw new IllegalStateException("Customer account was not found.");
        }
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
                      String wardCode, String wardName, String addressDetail,
                      BigDecimal latitude, BigDecimal longitude, boolean isDefault) {
        return jdbc.update("""
                INSERT INTO shipping_address (
                    user_id, recipient_name, phone,
                    province_code, province_name, ward_code, ward_name,
                    address_detail, latitude, longitude, is_default, is_deleted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                """, userId, recipientName, phone, provinceCode, provinceName,
                wardCode, wardName, addressDetail, latitude, longitude, isDefault);
    }

    public Optional<Integer> findLatestId(int userId) {
        return jdbc.query("""
                SELECT address_id FROM shipping_address
                WHERE user_id = ? ORDER BY address_id DESC LIMIT 1
                """, (rs, rowNum) -> rs.getInt("address_id"), userId).stream().findFirst();
    }

    public int update(int userId, int addressId, String recipientName, String phone,
                      String provinceCode, String provinceName,
                      String wardCode, String wardName, String addressDetail,
                      BigDecimal latitude, BigDecimal longitude) {
        return jdbc.update("""
                UPDATE shipping_address
                SET recipient_name = ?, phone = ?, province_code = ?, province_name = ?,
                    ward_code = ?, ward_name = ?, address_detail = ?,
                    latitude = ?, longitude = ?
                WHERE user_id = ? AND address_id = ? AND is_deleted = 0
                """, recipientName, phone, provinceCode, provinceName, wardCode,
                wardName, addressDetail, latitude, longitude, userId, addressId);
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
