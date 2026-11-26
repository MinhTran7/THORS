package com.thors.module.shippingaddress.repository;

import com.thors.module.shippingaddress.entity.ShippingAddress;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

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
            rs.getBoolean("is_default"));

    private static final String COLUMNS = """
            address_id, user_id, recipient_name, phone, province_code, province_name,
            ward_code, ward_name, address_detail, is_default
            """;

    private final JdbcTemplate jdbc;

    public ShippingAddressRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // Khóa dòng của khách tới hết transaction: các thao tác địa chỉ của cùng một khách chạy lần lượt,
    // tránh vượt giới hạn số địa chỉ hoặc có hai địa chỉ mặc định khi gửi yêu cầu đồng thời
    public void lockCustomer(int userId) {
        jdbc.queryForList("SELECT user_id FROM `user` WHERE user_id = ? FOR UPDATE", Integer.class, userId);
    }

    public int count(int userId) {
        return jdbc.queryForObject(
                "SELECT COUNT(*) FROM shipping_address WHERE user_id = ? AND is_deleted = 0", Integer.class, userId);
    }

    public List<ShippingAddress> findAll(int userId) {
        return jdbc.query("SELECT " + COLUMNS + """
                FROM shipping_address
                WHERE user_id = ? AND is_deleted = 0
                ORDER BY is_default DESC, created_at DESC, address_id DESC
                """, MAPPER, userId);
    }

    public Optional<ShippingAddress> findById(int userId, int addressId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM shipping_address WHERE user_id = ? AND address_id = ? AND is_deleted = 0",
                MAPPER, userId, addressId).stream().findFirst();
    }

    public void insert(ShippingAddress a) {
        jdbc.update("""
                INSERT INTO shipping_address (user_id, recipient_name, phone, province_code, province_name,
                    ward_code, ward_name, address_detail, is_default)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, a.userId(), a.recipientName(), a.phone(), a.provinceCode(), a.provinceName(),
                a.wardCode(), a.wardName(), a.addressDetail(), a.isDefault());
    }

    // Không đổi is_default ở đây: đặt mặc định luôn đi qua clearDefault + markDefault
    public void update(ShippingAddress a) {
        jdbc.update("""
                UPDATE shipping_address
                SET recipient_name = ?, phone = ?, province_code = ?, province_name = ?,
                    ward_code = ?, ward_name = ?, address_detail = ?
                WHERE user_id = ? AND address_id = ? AND is_deleted = 0
                """, a.recipientName(), a.phone(), a.provinceCode(), a.provinceName(),
                a.wardCode(), a.wardName(), a.addressDetail(), a.userId(), a.addressId());
    }

    public void clearDefault(int userId) {
        jdbc.update("UPDATE shipping_address SET is_default = 0 WHERE user_id = ? AND is_default = 1", userId);
    }

    public void markDefault(int userId, int addressId) {
        jdbc.update("UPDATE shipping_address SET is_default = 1 WHERE user_id = ? AND address_id = ? AND is_deleted = 0",
                userId, addressId);
    }

    public void softDelete(int userId, int addressId) {
        jdbc.update("UPDATE shipping_address SET is_deleted = 1 WHERE user_id = ? AND address_id = ?", userId, addressId);
    }
}
