package com.thors.module.account.repository;

import com.thors.common.ApiException;
import com.thors.common.ContactNormalizer;
import com.thors.module.account.entity.Account;
import java.sql.*;
import java.time.LocalDateTime;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.jdbc.core.*;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** Uses only the existing user, role and audit_log tables in the supplied 29-table schema. */
@Repository
public class AccountRepository {
  private final JdbcTemplate db;
  public AccountRepository(JdbcTemplate db) { this.db = db; }

  // Computed aliases, NOT extra columns. Retain the audit history used by Authentication.
  private static final String SELECT = """
      SELECT u.*, r.role_name,
        (SELECT a.new_value FROM audit_log a WHERE a.entity_affected='user'
          AND a.entity_id=u.user_id AND a.action_type='GOOGLE_LINK'
          ORDER BY a.log_id DESC LIMIT 1) AS linked_google_key,
        (SELECT COALESCE(MAX(a.log_id),0) FROM audit_log a WHERE a.entity_affected='user'
          AND a.entity_id=u.user_id AND a.action_type IN ('PASSWORD_INVALIDATE','STATUS_INVALIDATE')) AS session_revision,
        (SELECT a.user_id FROM audit_log a WHERE a.entity_affected='user'
          AND a.entity_id=u.user_id AND a.action_type='ACCOUNT_CREATE'
          ORDER BY a.log_id ASC LIMIT 1) AS account_creator
      FROM `user` u JOIN `role` r ON r.role_id=u.role_id
      """;
  private final RowMapper<Account> mapper = (rs, i) -> new Account(
      rs.getInt("user_id"), rs.getString("role_name"), rs.getString("full_name"),
      rs.getString("username"), rs.getString("password_hash"), rs.getString("email"),
      rs.getString("phone"), rs.getString("account_status"), time(rs,"email_verified_at"),
      time(rs,"phone_verified_at"), rs.getString("linked_google_key"),
      rs.getLong("session_revision"), rs.getObject("account_creator",Integer.class));

  private static LocalDateTime time(ResultSet r, String col) throws SQLException {
    return r.getObject(col, LocalDateTime.class);
  }
  public Optional<Account> byId(int id) {
    return db.query(SELECT + " WHERE u.user_id=?", mapper, id).stream().findFirst();
  }
  public Account lock(int id) {
    // Lock user separately: do not implicitly lock the joined role and invert lock order.
    var rows = db.queryForList("SELECT user_id FROM `user` WHERE user_id=? FOR UPDATE", id);
    if (rows.isEmpty()) throw new ApiException(404,"ACCOUNT_NOT_FOUND","Không tìm thấy tài khoản.");
    return byId(id).orElseThrow();
  }
  /** Serialize identity allocation on an existing role row, without adding a table or index. */
  public void lockIdentityRegistry() {
    var rows = db.queryForList("SELECT role_id FROM `role` WHERE role_name='CUSTOMER' FOR UPDATE");
    if (rows.size()!=1) throw new IllegalStateException("Database thiếu role CUSTOMER.");
  }
  public Optional<Account> byIdentifier(String value) {
    value = ContactNormalizer.identifier(value);
    final String identity = value;
    List<Account> found;
    if (value.contains("@")) {
      found = db.query(SELECT + " WHERE LOWER(TRIM(u.email))=?", mapper, value);
    } else {
      // Match legacy VN formats without changing existing records.
      found = db.query(SELECT + " WHERE u.phone IS NOT NULL", mapper).stream()
          .filter(a -> identity.equals(normalizedPhone(a.phone()))).toList();
    }
    if (found.size()>1) throw new ApiException(409,"IDENTIFIER_AMBIGUOUS",
        "Số điện thoại được dùng bởi nhiều tài khoản. Hãy đăng nhập bằng email và liên hệ quản trị.");
    return found.stream().findFirst();
  }
  private String normalizedPhone(String value) {
    try { return ContactNormalizer.phone(value); } catch (ApiException e) { return null; }
  }
  private void ensurePhoneAvailable(String phone, Integer exclude) {
    if (phone==null) return;
    boolean exists = db.query(SELECT + " WHERE u.phone IS NOT NULL", mapper).stream()
        .anyMatch(a -> !Objects.equals(a.id(),exclude) && phone.equals(normalizedPhone(a.phone())));
    if (exists) throw new ApiException(409,"PHONE_IN_USE","Số điện thoại đã được sử dụng.");
  }
  public String googleKey(String sub) {
    try {
      return "google:" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
          .digest(sub.getBytes(StandardCharsets.UTF_8)));
    } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
  }
  public Optional<Account> byGoogle(String sub) {
    var found = db.query(SELECT + " WHERE EXISTS (SELECT 1 FROM audit_log a"
        + " WHERE a.entity_affected='user' AND a.entity_id=u.user_id"
        + " AND a.action_type='GOOGLE_LINK' AND a.new_value=?)", mapper,googleKey(sub));
    if (found.size()>1) throw new ApiException(409,"GOOGLE_IN_USE","Liên kết Google không hợp lệ.");
    return found.stream().findFirst();
  }
  public int countAdmin() {
    return db.queryForObject("SELECT COUNT(*) FROM `user` u JOIN `role` r ON r.role_id=u.role_id"
        + " WHERE r.role_name='ADMIN'",Integer.class);
  }
  @Transactional
  public Account create(String role, String name, String hash, String email, String phone,
      String status, Integer creator, String subject, boolean emailVerified) {
    lockIdentityRegistry();
    final String normalizedEmail = ContactNormalizer.email(email);
    String normalized = ContactNormalizer.phone(phone);
    ensurePhoneAvailable(normalized,null);
    if (byIdentifier(normalizedEmail).isPresent()) throw new ApiException(409,"EMAIL_IN_USE","Email đã được sử dụng.");
    Integer roleId = db.queryForObject("SELECT role_id FROM `role` WHERE role_name=?",Integer.class,role);
    var keys = new GeneratedKeyHolder();
    db.update(c -> {
      var s = c.prepareStatement("INSERT INTO `user`"
          + "(role_id,full_name,username,password_hash,email,phone,account_status,email_verified_at)"
          + " VALUES(?,?,?,?,?,?,?,?)",new String[]{"user_id"});
      s.setInt(1,roleId); s.setString(2,name);
      s.setString(3,"u_"+UUID.randomUUID().toString().replace("-",""));
      s.setString(4,hash); s.setString(5,normalizedEmail); s.setString(6,normalized);
      s.setString(7,status); s.setObject(8,emailVerified?LocalDateTime.now(java.time.Clock.systemUTC()):null);
      return s;
    },keys);
    int id = Objects.requireNonNull(keys.getKey()).intValue();
    audit(creator,"ACCOUNT_CREATE",id,role);
    if (subject!=null) linkGoogle(id,subject);
    return byId(id).orElseThrow();
  }
  public void verify(int id,String channel,boolean activate) {
    String field="EMAIL".equals(channel)?"email_verified_at":"phone_verified_at";
    db.update("UPDATE `user` SET "+field+"=CURRENT_TIMESTAMP"
        +(activate?",account_status='ACTIVE'":"")+" WHERE user_id=?",id);
  }
  @Transactional
  public void password(int id,String hash,boolean pending) {
    lock(id);
    db.update("UPDATE `user` SET password_hash=?"
        +(pending?",account_status='PENDING_VERIFICATION'":"")+" WHERE user_id=?",hash,id);
    audit(null,"PASSWORD_INVALIDATE",id,"Existing sessions and reset grants revoked");
  }
  @Transactional
  public void linkGoogle(int id,String sub) {
    lockIdentityRegistry();
    var a=lock(id);
    String key=googleKey(sub);
    var existing=byGoogle(sub);
    if (existing.isPresent() && existing.get().id()!=id)
      throw new ApiException(409,"GOOGLE_IN_USE","Google đã liên kết với tài khoản khác.");
    if (a.googleSubject()!=null && !a.googleSubject().equals(key))
      throw new ApiException(409,"GOOGLE_ALREADY_LINKED","Tài khoản đã liên kết Google khác.");
    if (a.googleSubject()==null) audit(id,"GOOGLE_LINK",id,key);
  }
  public void addPhone(int id,String phone) {
    ensurePhoneAvailable(phone,id);
    db.update("UPDATE `user` SET phone=?,phone_verified_at=NULL WHERE user_id=?",phone,id);
  }
  public void name(int id,String name) { db.update("UPDATE `user` SET full_name=? WHERE user_id=?",name,id); }
  @Transactional
  public void status(int id,String status) {
    lock(id);
    db.update("UPDATE `user` SET account_status=? WHERE user_id=?",status,id);
    audit(null,"STATUS_INVALIDATE",id,status);
  }
  public List<Account> managed(Account actor) {
    return "ADMIN".equals(actor.role()) ? db.query(SELECT+" ORDER BY u.user_id DESC",mapper)
        : db.query(SELECT+" WHERE r.role_name IN ('STAFF','FAMILY_MEMBER') AND EXISTS"
            +" (SELECT 1 FROM audit_log a WHERE a.entity_affected='user' AND a.entity_id=u.user_id"
            +" AND a.action_type='ACCOUNT_CREATE' AND a.user_id=?) ORDER BY u.user_id DESC",mapper,actor.id());
  }
  public void audit(Integer actor,String action,int target,String detail) {
    db.update("INSERT INTO audit_log(user_id,action_type,entity_affected,entity_id,new_value,actor_type)"
        +" VALUES(?,?,'user',?,?,?)",actor,action,target,detail,actor==null?"SYSTEM":"USER");
  }
}
