package com.thors.module.auth.repository;

import java.time.LocalDateTime;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** One active email OTP per user using four persistent user fields and audit_log. */
@Repository
public class OtpRepository {
  private final JdbcTemplate db;
  public OtpRepository(JdbcTemplate db) { this.db=db; }
  /** One active code per account: UUID:HMAC in user.verification_code_hash. */
  public record Code(String id, int userId, String hash, LocalDateTime expires, int attempts) {}

  public Code lock(String token, int user) {
    // Purpose is authenticated by the HMAC in OtpService (and held in the HTTP session),
    // not stored as another database column.
    return db.query("SELECT verification_code_hash,verification_expires_at,verification_attempt_count"
                    + " FROM `user` WHERE user_id=? FOR UPDATE",
            (row, i) -> {
              String stored = row.getString("verification_code_hash");
              if (stored == null || !stored.startsWith(token + ":")) return null;
              return new Code(token, user, stored.substring(token.length() + 1),
                      row.getObject("verification_expires_at", LocalDateTime.class),
                      row.getInt("verification_attempt_count"));
            }, user).stream().filter(java.util.Objects::nonNull).findFirst().orElse(null);
  }

  /** The latest successful issue time is already recorded in the audit history. */
  public LocalDateTime lastSent(int user) {
    return db.query("SELECT performed_at FROM audit_log WHERE entity_affected='user'"
                            + " AND entity_id=? AND action_type='OTP_SENT' ORDER BY log_id DESC LIMIT 1",
                    (row, i) -> row.getObject(1, LocalDateTime.class), user)
            .stream().findFirst().orElse(null);
  }

  /** Persist an OTP lock via audit_log so it survives a server restart. */
  public boolean otpCoolingDown(int user) {
    var last = db.query("SELECT performed_at FROM audit_log WHERE entity_affected='user'"
                    + " AND entity_id=? AND action_type='OTP_LOCK' ORDER BY log_id DESC LIMIT 1",
            (row, i) -> row.getObject(1, LocalDateTime.class), user);
    return !last.isEmpty()
            && last.get(0).plusMinutes(15).isAfter(LocalDateTime.now(java.time.Clock.systemUTC()));
  }

  private record LoginEvent(String action, LocalDateTime time) {}
  private java.util.List<LoginEvent> loginEvents(int user) {
    return db.query("SELECT action_type,performed_at FROM audit_log WHERE entity_affected='user'"
            +" AND entity_id=? AND action_type IN ('LOGIN_FAILURE','LOGIN_SUCCESS','LOGIN_LOCK','PASSWORD_INVALIDATE')"
            +" ORDER BY log_id DESC LIMIT 6", (r,i)->new LoginEvent(r.getString(1),r.getObject(2,LocalDateTime.class)),user);
  }
  public boolean loginCoolingDown(int user) {
    var events=loginEvents(user);
    return !events.isEmpty() && "LOGIN_LOCK".equals(events.get(0).action())
            && events.get(0).time().plusMinutes(15).isAfter(LocalDateTime.now(java.time.Clock.systemUTC()));
  }
  public void loginFailure(int user) {
    int failures=0;
    for (var event:loginEvents(user)) {
      if (!"LOGIN_FAILURE".equals(event.action())) break;
      failures++;
    }
    loginAudit(user,"LOGIN_FAILURE");
    if (failures+1>=5) loginAudit(user,"LOGIN_LOCK");
  }
  public void loginSuccess(int user) { loginAudit(user,"LOGIN_SUCCESS"); }
  private void loginAudit(int user,String action) {
    db.update("INSERT INTO audit_log(user_id,action_type,entity_affected,entity_id,new_value,actor_type)"
                    +" VALUES(NULL,?,'user',?,?,'SYSTEM')",action,user,
            "LOGIN_LOCK".equals(action)?"Password login paused for 15 minutes":action);
  }
  public int sentLastHour(int user) {
    return db.queryForObject("SELECT COUNT(*) FROM audit_log WHERE entity_affected='user'"
                    +" AND entity_id=? AND action_type='OTP_SENT' AND performed_at>?",Integer.class,user,
            LocalDateTime.now(java.time.Clock.systemUTC()).minusHours(1));
  }
  public void invalidateAll(int user) {
    // Erasing HMAC makes an OTP single-use and revokes all earlier challenges.
    db.update("UPDATE `user` SET verification_code_hash=NULL, verification_expires_at=NULL,"
            + " verification_attempt_count=0 WHERE user_id=?", user);
  }

  public String create(int user, String purpose, String token, String hash, LocalDateTime expires) {
    db.update("UPDATE `user` SET verification_code_hash=?, verification_expires_at=?,"
                    + " verification_attempt_count=0 WHERE user_id=?",
            token + ":" + hash, expires, user);
    db.update("INSERT INTO audit_log(user_id,action_type,entity_affected,entity_id,new_value,actor_type)"
            + " VALUES(NULL,'OTP_SENT','user',?,?,'SYSTEM')", user, purpose);
    return token;
  }

  public void wrong(Code code) {
    int next = code.attempts() + 1;
    if (next >= 5) {
      db.update("UPDATE `user` SET verification_attempt_count=5,"
                      + " verification_code_hash=NULL, verification_expires_at=NULL"
                      + " WHERE user_id=? AND verification_code_hash LIKE ?",
              code.userId(), code.id() + ":%");
      db.update("INSERT INTO audit_log(user_id,action_type,entity_affected,entity_id,new_value,actor_type)"
                      + " VALUES(NULL,'OTP_LOCK','user',?,'15 minutes','SYSTEM')",
              code.userId());
    } else {
      db.update("UPDATE `user` SET verification_attempt_count=?"
                      + " WHERE user_id=? AND verification_code_hash LIKE ?",
              next, code.userId(), code.id() + ":%");
    }
  }

  public void used(Code code) {
    db.update("UPDATE `user` SET verification_code_hash=NULL,verification_expires_at=NULL,"
                    + " verification_attempt_count=0 WHERE user_id=? AND verification_code_hash LIKE ?",
            code.userId(), code.id() + ":%");
  }
}
