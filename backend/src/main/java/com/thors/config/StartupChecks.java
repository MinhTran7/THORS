package com.thors.config;

import com.thors.common.ContactNormalizer;
import com.thors.module.account.repository.AccountRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class StartupChecks implements ApplicationRunner {
  private final Settings settings;
  private final AccountRepository users;
  private final PasswordEncoder passwords;
  private final TransactionTemplate tx;
  private final JdbcTemplate db;

  public StartupChecks(
          Settings settings,
          AccountRepository users,
          PasswordEncoder passwords,
          TransactionTemplate tx,
          JdbcTemplate db) {
    this.settings = settings;
    this.users = users;
    this.passwords = passwords;
    this.tx = tx;
    this.db = db;
  }

  public void run(ApplicationArguments args) {
    if (settings.google().enabled()
            && (settings.google().clientId().isBlank() || settings.google().clientSecret().isBlank()))
      throw new IllegalStateException("Set Google OAuth credentials before enabling Google login.");
    try {
      db.queryForList("SELECT user_id,role_id,full_name,password_hash,email,phone,address,"
              + "account_status,created_at,avatar_url,updated_at FROM `user` WHERE 1=0");
      db.queryForList("SELECT log_id,user_id,action_type,entity_affected,entity_id,old_value,new_value,actor_type,performed_at FROM audit_log WHERE 1=0");
      db.queryForList("SELECT role_id,role_name FROM `role` WHERE 1=0");
    } catch (org.springframework.dao.DataAccessException e) {
      throw new IllegalStateException("Không đọc được schema THORS 29 bảng. Kiểm tra kết nối và dùng đúng database hiện tại; backend không tự sửa hoặc tạo bảng.",e);
    }
    if (settings.bootstrap().enabled())
      tx.executeWithoutResult(
              s -> {
                users.lockIdentityRegistry();
                db.queryForList("SELECT role_id FROM `role` WHERE role_name='ADMIN' FOR UPDATE");
                if (users.countAdmin() == 0) {
                  var b = settings.bootstrap();
                  ContactNormalizer.password(b.password());
                  users.create(
                          "ADMIN",
                          ContactNormalizer.name(b.name()),
                          passwords.encode(b.password()),
                          ContactNormalizer.email(b.email()),
                          ContactNormalizer.phone(b.phone()),
                          "ACTIVE",
                          null,
                          null,
                          false);
                }
              });
  }
}