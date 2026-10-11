DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS `user`;
DROP TABLE IF EXISTS `role`;
CREATE TABLE `role` (
  `role_id` INT NOT NULL AUTO_INCREMENT,
  `role_name` VARCHAR(50) NOT NULL,
  PRIMARY KEY (`role_id`),
  UNIQUE (`role_name`),
  CONSTRAINT `ck_role_1` CHECK (role_name IN ('ADMIN', 'OWNER', 'FAMILY_MEMBER', 'STAFF', 'CUSTOMER'))
);
CREATE TABLE `user` (
  `user_id` INT NOT NULL AUTO_INCREMENT,
  `role_id` INT NOT NULL,
  `full_name` VARCHAR(100) NOT NULL,
  `username` VARCHAR(50) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `email` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(15) NULL,
  `address` VARCHAR(255) NULL,
  `account_status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `email_verified_at` DATETIME NULL,
  `phone_verified_at` DATETIME NULL,
  `avatar_url` VARCHAR(500) NULL,
  `avatar_public_id` VARCHAR(255) NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `verification_code_hash` VARCHAR(255) NULL,
  `verification_purpose` VARCHAR(30) NULL,
  `verification_expires_at` DATETIME NULL,
  `verification_sent_at` DATETIME NULL,
  `verification_used_at` DATETIME NULL,
  `verification_attempt_count` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`),
  UNIQUE (`username`),
  UNIQUE (`email`),
  CONSTRAINT `ck_user_1` CHECK (account_status IN ('PENDING_VERIFICATION', 'ACTIVE', 'LOCKED', 'DISABLED')),
  CONSTRAINT `ck_user_2` CHECK (verification_attempt_count BETWEEN 0 AND 5),
  CONSTRAINT `fk_user_role_id` FOREIGN KEY (`role_id`) REFERENCES `role` (`role_id`)
);
CREATE TABLE `audit_log` (
  `log_id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` INT NULL,
  `action_type` VARCHAR(50) NOT NULL,
  `entity_affected` VARCHAR(100) NOT NULL,
  `old_value` TEXT NULL,
  `new_value` TEXT NULL,
  `performed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `entity_id` BIGINT NULL,
  `actor_type` VARCHAR(20) NOT NULL,
  PRIMARY KEY (`log_id`),


  CONSTRAINT `ck_audit_log_1` CHECK (actor_type IN ('USER', 'SYSTEM')),
  CONSTRAINT `fk_audit_log_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
);
INSERT INTO `role` (role_name) VALUES ('ADMIN'),('OWNER'),('FAMILY_MEMBER'),('STAFF'),('CUSTOMER');
