package com.thors.module.auth.repository;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Mỗi người dùng có tối đa một OTP đang hoạt động, giữ trong bộ nhớ của backend (không lưu vào DB).
 * Hệ quả: khởi động lại backend thì OTP chưa dùng bị mất, và chưa hỗ trợ chạy nhiều backend cùng lúc.
 * Chỉ bộ đếm giới hạn gửi lại (OTP_SENT) vẫn ghi vào audit_log.
 */
@Repository
public class OtpRepository {
  private final JdbcTemplate db;
  private final Map<Integer, Entry> entries = new ConcurrentHashMap<>();

  public OtpRepository(JdbcTemplate db) {
    this.db = db;
  }

  public record Code(
          String id, int userId, String hash, LocalDateTime expires, boolean used, int attempts) {}

  private record Entry(
          String token,
          String purpose,
          String hash,
          LocalDateTime expires,
          LocalDateTime sent,
          boolean used,
          int attempts) {}

  public synchronized Code lock(String token, int user, String purpose) {
    var e = entries.get(user);
    if (e == null || !Objects.equals(e.purpose(), purpose) || !Objects.equals(e.token(), token))
      return null;
    return new Code(token, user, e.hash(), e.expires(), e.used(), e.attempts());
  }

  public synchronized LocalDateTime lastSent(int user) {
    var e = entries.get(user);
    return e == null ? null : e.sent();
  }

  public int sentLastHour(int user) {
    return db.queryForObject(
            "SELECT COUNT(*) FROM audit_log WHERE entity_affected='user'"
                    + " AND entity_id=? AND action_type='OTP_SENT' AND performed_at>?",
            Integer.class,
            user,
            LocalDateTime.now(Clock.systemUTC()).minusHours(1));
  }

  public synchronized void invalidateAll(int user) {
    var e = entries.get(user);
    if (e != null && !e.used())
      entries.put(
              user,
              new Entry(e.token(), e.purpose(), e.hash(), e.expires(), e.sent(), true, e.attempts()));
  }

  public synchronized String create(
          int user, String purpose, String token, String hash, LocalDateTime expires) {
    entries.put(
            user,
            new Entry(token, purpose, hash, expires, LocalDateTime.now(Clock.systemUTC()), false, 0));
    db.update(
            "INSERT INTO audit_log(user_id,action_type,entity_affected,entity_id,new_value,actor_type)"
                    + " VALUES(NULL,'OTP_SENT','user',?,?,'SYSTEM')",
            user,
            purpose);
    return token;
  }

  public synchronized void wrong(Code c) {
    var e = entries.get(c.userId());
    if (e == null || !Objects.equals(e.token(), c.id())) return;
    int attempts = e.attempts() + 1;
    entries.put(
            c.userId(),
            new Entry(
                    e.token(), e.purpose(), e.hash(), e.expires(), e.sent(), attempts >= 5, attempts));
  }

  public synchronized void used(Code c) {
    var e = entries.get(c.userId());
    if (e == null || !Objects.equals(e.token(), c.id())) return;
    entries.put(
            c.userId(),
            new Entry(e.token(), e.purpose(), e.hash(), e.expires(), e.sent(), true, e.attempts()));
  }
}