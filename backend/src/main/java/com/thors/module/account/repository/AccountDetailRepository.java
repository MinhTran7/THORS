package com.thors.module.account.repository;

import com.thors.common.ApiException;
import java.time.LocalDateTime;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Đọc các cột chi tiết của bảng user (address, created_at) mà Account không chứa. */
@Repository
public class AccountDetailRepository {
    public record Extra(String address, LocalDateTime createdAt, String createdByName) {}

    private final JdbcTemplate db;

    public AccountDetailRepository(JdbcTemplate db) {
        this.db = db;
    }

    /** createdBy là id người tạo (có thể null); tên người tạo lấy từ chính bảng user. */
    public Extra extra(int id, Integer createdBy) {
        return db
                .query(
                        "SELECT u.address, u.created_at, c.full_name AS creator_name"
                                + " FROM `user` u LEFT JOIN `user` c ON c.user_id = ?"
                                + " WHERE u.user_id = ?",
                        (rs, i) ->
                                new Extra(
                                        rs.getString("address"),
                                        rs.getObject("created_at", LocalDateTime.class),
                                        rs.getString("creator_name")),
                        createdBy,
                        id)
                .stream()
                .findFirst()
                .orElseThrow(
                        () -> new ApiException(404, "ACCOUNT_NOT_FOUND", "Không tìm thấy tài khoản."));
    }
}