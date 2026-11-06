package com.thors.module.shippingaddress.repository;

import com.thors.module.shippingaddress.dto.ShippingAddressRequest;
import com.thors.module.shippingaddress.entity.ShippingAddress;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Optional;

@Repository
public class ShippingAddressRepository {

    private static final RowMapper<ShippingAddress> MAPPER = (rs, rowNum) -> new ShippingAddress(
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

    private final JdbcTemplate jdbc;

    public ShippingAddressRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public int count(int userId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM shipping_address WHERE user_id = ? AND is_deleted = 0",
                Integer.class, userId);
        return count == null ? 0 : count;
    }

    public List<ShippingAddress> findAll(int userId) {
        return jdbc.query("""
                SELECT * FROM shipping_address
                WHERE user_id = ? AND is_deleted = 0
                ORDER BY is_default DESC, created_at DESC, address_id DESC
                """, MAPPER, userId);
    }

    public Optional<ShippingAddress> findById(int userId, int addressId) {
        return jdbc.query("""
                SELECT * FROM shipping_address
                WHERE user_id = ? AND address_id = ? AND is_deleted = 0
                """, MAPPER, userId, addressId).stream().findFirst();
    }

    public int insert(int userId, ShippingAddressRequest a, boolean isDefault) {
        Object[] values = {userId, a.recipientName(), a.phone(), a.provinceCode(), a.provinceName(),
                a.wardCode(), a.wardName(), a.addressDetail(), a.latitude(), a.longitude(), isDefault};
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO shipping_address (user_id, recipient_name, phone, province_code, province_name,
                        ward_code, ward_name, address_detail, latitude, longitude, is_default)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            for (int i = 0; i < values.length; i++) ps.setObject(i + 1, values[i]);
            return ps;
        }, keyHolder);
        return keyHolder.getKey().intValue();
    }

    public void update(int userId, int addressId, ShippingAddressRequest a) {
        jdbc.update("""
                UPDATE shipping_address
                SET recipient_name = ?, phone = ?, province_code = ?, province_name = ?,
                    ward_code = ?, ward_name = ?, address_detail = ?, latitude = ?, longitude = ?
                WHERE user_id = ? AND address_id = ? AND is_deleted = 0
                """, a.recipientName(), a.phone(), a.provinceCode(), a.provinceName(),
                a.wardCode(), a.wardName(), a.addressDetail(), a.latitude(), a.longitude(),
                userId, addressId);
    }

    public void clearDefault(int userId) {
        jdbc.update("UPDATE shipping_address SET is_default = 0 WHERE user_id = ? AND is_default = 1", userId);
    }

    public void setDefault(int userId, int addressId) {
        jdbc.update("UPDATE shipping_address SET is_default = 1 WHERE user_id = ? AND address_id = ? AND is_deleted = 0",
                userId, addressId);
    }

    public void softDelete(int userId, int addressId) {
        jdbc.update("UPDATE shipping_address SET is_deleted = 1 WHERE user_id = ? AND address_id = ?",
                userId, addressId);
    }
}
