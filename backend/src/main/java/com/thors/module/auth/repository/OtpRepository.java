package com.thors.module.auth.repository;

import java.time.LocalDateTime;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** One active OTP per user, stored only in the supplied verification_* columns. */
@Repository
public class OtpRepository {
  private final JdbcTemplate db;
  public OtpRepository(JdbcTemplate db) { this.db=db; }
  public record Code(String id,int userId,String hash,LocalDateTime expires,boolean used,int attempts) {}
  public Code lock(String token,int user,String purpose) {
    return db.query("SELECT verification_code_hash,verification_expires_at,verification_used_at,"
        +"verification_attempt_count FROM `user` WHERE user_id=? AND verification_purpose=? FOR UPDATE",
        (r,i) -> {
          String stored=r.getString("verification_code_hash");
          if (stored==null || !stored.startsWith(token+":")) return null;
          return new Code(token,user,stored.substring(token.length()+1),
              r.getObject("verification_expires_at",LocalDateTime.class),
              r.getObject("verification_used_at")!=null,r.getInt("verification_attempt_count"));
        },user,purpose).stream().filter(java.util.Objects::nonNull).findFirst().orElse(null);
  }
  public LocalDateTime lastSent(int user) {
    return db.query("SELECT verification_sent_at FROM `user` WHERE user_id=?",
        (r,i)->r.getObject(1,LocalDateTime.class),user).get(0);
  }
  public int sentLastHour(int user) {
    return db.queryForObject("SELECT COUNT(*) FROM audit_log WHERE entity_affected='user'"
        +" AND entity_id=? AND action_type='OTP_SENT' AND performed_at>?",Integer.class,user,
        LocalDateTime.now(java.time.Clock.systemUTC()).minusHours(1));
  }
  public void invalidateAll(int user) {
    db.update("UPDATE `user` SET verification_used_at=CURRENT_TIMESTAMP WHERE user_id=?"
        +" AND verification_code_hash IS NOT NULL AND verification_used_at IS NULL",user);
  }
  public String create(int user,String purpose,String token,String hash,LocalDateTime expires) {
    db.update("UPDATE `user` SET verification_code_hash=?,verification_purpose=?,"
        +"verification_expires_at=?,verification_sent_at=?,verification_used_at=NULL,"
        +"verification_attempt_count=0 WHERE user_id=?",token+":"+hash,purpose,expires,
        LocalDateTime.now(java.time.Clock.systemUTC()),user);
    db.update("INSERT INTO audit_log(user_id,action_type,entity_affected,entity_id,new_value,actor_type)"
        +" VALUES(NULL,'OTP_SENT','user',?,?,'SYSTEM')",user,purpose);
    return token;
  }
  public void wrong(Code c) {
    db.update("UPDATE `user` SET verification_attempt_count=?,verification_used_at=?"
        +" WHERE user_id=? AND verification_code_hash LIKE ?",c.attempts()+1,
        c.attempts()+1>=5?LocalDateTime.now(java.time.Clock.systemUTC()):null,c.userId(),c.id()+":%");
  }
  public void used(Code c) {
    db.update("UPDATE `user` SET verification_used_at=CURRENT_TIMESTAMP WHERE user_id=?"
        +" AND verification_code_hash LIKE ?",c.userId(),c.id()+":%");
  }
}
