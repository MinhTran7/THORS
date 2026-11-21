package com.thors.module.account.repository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Tài khoản phải đổi mật khẩu ở lần đăng nhập tới (bảng user_password_change_required, migration
 * 2026-11-18_password_change_required.sql).
 *
 * <p>Nhóm dùng chung một database và mỗi người tự chạy migration. Chưa có bảng thì {@link #ready()} trả
 * false: không đánh dấu, không chặn ai, mọi thứ chạy như cũ. Chạy migration xong, tính năng tự bật trong
 * vòng {@link #RECHECK_MS} ms, không cần khởi động lại server.
 */
@Repository
public class PasswordChangeRequirementRepository {
  private static final Logger log = LoggerFactory.getLogger(PasswordChangeRequirementRepository.class);
  static final long RECHECK_MS = 60_000;

  private static final String CHECK_SQL =
          "SELECT COUNT(*) FROM information_schema.tables"
                  + " WHERE table_schema = DATABASE() AND LOWER(table_name) = 'user_password_change_required'";

  private final JdbcTemplate db;
  private volatile boolean ready;
  private volatile long checkedAt;

  public PasswordChangeRequirementRepository(JdbcTemplate db) {
    this.db = db;
  }

  /** true nếu DB đã có bảng. Có rồi thì nhớ luôn; chưa thì kiểm tra lại sau mỗi phút. */
  public boolean ready() {
    if (ready) return true;
    long now = System.currentTimeMillis();
    if (now - checkedAt < RECHECK_MS) return false;
    synchronized (this) {
      if (ready || now - checkedAt < RECHECK_MS) return ready;
      checkedAt = now;
      try {
        Integer found = db.queryForObject(CHECK_SQL, Integer.class);
        ready = found != null && found == 1;
      } catch (RuntimeException e) {
        ready = false;
      }
      if (!ready)
        log.info("Bắt buộc đổi mật khẩu lần đầu đang tắt: database chưa chạy migration"
                + " 2026-11-18_password_change_required.sql");
      return ready;
    }
  }

  /** Đánh dấu tài khoản phải đổi mật khẩu. Bảng chưa có thì bỏ qua. */
  public void require(int userId) {
    if (!ready()) return;
    db.update("INSERT IGNORE INTO user_password_change_required(user_id) VALUES(?)", userId);
  }

  public boolean required(int userId) {
    if (!ready()) return false;
    Integer n = db.queryForObject(
            "SELECT COUNT(*) FROM user_password_change_required WHERE user_id=?", Integer.class, userId);
    return n != null && n > 0;
  }

  public void clear(int userId) {
    if (!ready()) return;
    db.update("DELETE FROM user_password_change_required WHERE user_id=?", userId);
  }
}
