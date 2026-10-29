-- --------------------------------------------------------
-- Host:                         thors-thors.g.aivencloud.com
-- Server version:               8.4.11 - Source distribution
-- Server OS:                    Linux
-- HeidiSQL Version:             12.17.0.7270
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Dumping database structure for thors_restore
CREATE DATABASE IF NOT EXISTS `thors_restore` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `thors_restore`;

-- Dumping structure for table thors_restore.audit_log
CREATE TABLE IF NOT EXISTS `audit_log` (
  `log_id` bigint NOT NULL AUTO_INCREMENT COMMENT 'Bảng log lớn nhanh nên dùng BIGINT',
  `user_id` int DEFAULT NULL COMMENT 'NULL khi tác nhân là job hoặc callback hệ thống',
  `action_type` varchar(50) NOT NULL,
  `entity_affected` varchar(100) NOT NULL,
  `old_value` text,
  `new_value` text,
  `performed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `entity_id` bigint DEFAULT NULL COMMENT 'ID bản ghi bị tác động',
  `actor_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'USER / SYSTEM',
  PRIMARY KEY (`log_id`),
  KEY `ix_audit_log_1` (`entity_affected`,`entity_id`,`performed_at`),
  KEY `ix_audit_log_2` (`user_id`,`performed_at`),
  CONSTRAINT `fk_audit_log_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`),
  CONSTRAINT `ck_audit_log_1` CHECK ((`actor_type` in (_utf8mb4'USER',_utf8mb4'SYSTEM')))
) ENGINE=InnoDB AUTO_INCREMENT=245 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.audit_log: ~233 rows (approximately)
INSERT INTO `audit_log` (`log_id`, `user_id`, `action_type`, `entity_affected`, `old_value`, `new_value`, `performed_at`, `entity_id`, `actor_type`) VALUES
	(1, NULL, 'ACCOUNT_CREATE', 'user', NULL, 'CUSTOMER', '2026-10-12 18:53:17', 1, 'SYSTEM'),
	(2, NULL, 'OTP_SENT', 'user', NULL, 'REGISTER_EMAIL', '2026-10-12 18:53:18', 1, 'SYSTEM'),
	(3, NULL, 'OTP_SENT', 'user', NULL, 'REGISTER_EMAIL', '2026-10-12 18:54:40', 1, 'SYSTEM'),
	(4, 1, 'ACCOUNT_VERIFIED', 'user', NULL, 'EMAIL', '2026-10-12 18:55:04', 1, 'USER'),
	(5, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-12 18:55:18', 1, 'SYSTEM'),
	(6, NULL, 'ACCOUNT_CREATE', 'user', NULL, 'CUSTOMER', '2026-10-13 06:52:49', 2, 'SYSTEM'),
	(7, 2, 'GOOGLE_LINK', 'user', NULL, 'google:9142ddcfa7344c156aff4d031f172c69b4a0236b532227036a681407fb85e85c', '2026-10-13 06:52:49', 2, 'USER'),
	(8, NULL, 'LOGIN_FAILURE', 'user', NULL, 'LOGIN_FAILURE', '2026-10-13 06:53:42', 1, 'SYSTEM'),
	(9, NULL, 'OTP_SENT', 'user', NULL, 'RESET_EMAIL', '2026-10-13 06:54:08', 1, 'SYSTEM'),
	(10, NULL, 'PASSWORD_INVALIDATE', 'user', NULL, 'Existing sessions and reset grants revoked', '2026-10-13 06:55:10', 1, 'SYSTEM'),
	(11, 1, 'PASSWORD_RESET', 'user', NULL, 'Password replaced; sessions revoked', '2026-10-13 06:55:10', 1, 'USER'),
	(12, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-13 06:55:20', 1, 'SYSTEM'),
	(13, NULL, 'ACCOUNT_CREATE', 'user', NULL, 'ADMIN', '2026-10-16 10:42:06', 3, 'SYSTEM'),
	(14, NULL, 'ACCOUNT_CREATE', 'user', NULL, 'OWNER', '2026-10-16 10:42:06', 4, 'SYSTEM'),
	(16, 3, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-16 10:42:53', 3, 'USER'),
	(17, 3, 'PROFILE_UPDATE', 'user', NULL, 'Profile information updated', '2026-10-16 10:46:20', 3, 'USER'),
	(18, NULL, 'ACCOUNT_CREATE', 'user', NULL, 'CUSTOMER', '2026-10-16 10:52:25', 5, 'SYSTEM'),
	(19, 5, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-16 10:52:57', 5, 'USER'),
	(20, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-16 10:54:40', 4, 'USER'),
	(21, 4, 'ACCOUNT_CREATE', 'user', NULL, 'STAFF', '2026-10-16 10:55:16', 6, 'USER'),
	(22, 4, 'ACCOUNT_CREATE', 'user', NULL, 'FAMILY_MEMBER', '2026-10-16 10:56:11', 7, 'USER'),
	(23, NULL, 'STATUS_INVALIDATE', 'user', NULL, 'DISABLED', '2026-10-16 10:57:08', 7, 'SYSTEM'),
	(24, 4, 'ACCOUNT_DEACTIVATE', 'user', NULL, 'ACTIVE -> DISABLED', '2026-10-16 10:57:08', 7, 'USER'),
	(25, NULL, 'STATUS_INVALIDATE', 'user', NULL, 'ACTIVE', '2026-10-16 10:57:32', 7, 'SYSTEM'),
	(26, 4, 'ACCOUNT_ACTIVATE', 'user', NULL, 'DISABLED -> ACTIVE', '2026-10-16 10:57:32', 7, 'USER'),
	(27, 3, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-16 10:58:05', 3, 'USER'),
	(28, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-16 10:59:30', 4, 'USER'),
	(29, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-17 07:09:02', 1, 'SYSTEM'),
	(30, NULL, 'OTP_SENT', 'user', NULL, 'CONTACT_EMAIL', '2026-10-17 07:09:17', 1, 'SYSTEM'),
	(31, NULL, 'OTP_SENT', 'user', NULL, 'CONTACT_EMAIL', '2026-10-17 07:11:11', 2, 'SYSTEM'),
	(32, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-19 09:30:01', 4, 'USER'),
	(33, NULL, 'PASSWORD_RESET_REQUEST', 'user', NULL, 'Shop Owner submitted a password reset request', '2026-10-19 09:33:27', 4, 'SYSTEM'),
	(34, 3, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-19 09:33:48', 3, 'USER'),
	(35, NULL, 'PASSWORD_INVALIDATE', 'user', NULL, 'Existing sessions and reset grants revoked', '2026-10-19 09:34:19', 4, 'SYSTEM'),
	(36, 3, 'PASSWORD_RESET_ADMIN', 'user', NULL, 'Password replaced by ADMIN; sessions revoked', '2026-10-19 09:34:19', 4, 'USER'),
	(37, NULL, 'LOGIN_FAILED', 'user', NULL, 'Wrong credentials', '2026-10-19 09:34:50', 4, 'SYSTEM'),
	(38, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-19 09:34:56', 4, 'USER'),
	(39, NULL, 'LOGIN_FAILURE', 'user', NULL, 'LOGIN_FAILURE', '2026-10-21 17:26:40', 3, 'SYSTEM'),
	(40, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-21 17:27:00', 4, 'SYSTEM'),
	(41, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-21 17:27:00', 4, 'USER'),
	(42, NULL, 'LOGIN_FAILURE', 'user', NULL, 'LOGIN_FAILURE', '2026-10-21 17:47:24', 4, 'SYSTEM'),
	(43, NULL, 'LOGIN_FAILURE', 'user', NULL, 'LOGIN_FAILURE', '2026-10-21 17:48:35', 2, 'SYSTEM'),
	(44, NULL, 'LOGIN_FAILURE', 'user', NULL, 'LOGIN_FAILURE', '2026-10-21 17:48:43', 2, 'SYSTEM'),
	(45, NULL, 'LOGIN_FAILURE', 'user', NULL, 'LOGIN_FAILURE', '2026-10-21 17:48:55', 3, 'SYSTEM'),
	(46, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-21 17:50:42', 1, 'SYSTEM'),
	(47, 1, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-21 17:50:43', 1, 'USER'),
	(48, NULL, 'LOGIN_FAILURE', 'user', NULL, 'LOGIN_FAILURE', '2026-10-21 17:51:41', 2, 'SYSTEM'),
	(49, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-21 17:53:01', 4, 'SYSTEM'),
	(50, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-21 17:53:02', 4, 'USER'),
	(51, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-22 08:19:14', 4, 'SYSTEM'),
	(52, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-22 08:19:15', 4, 'USER'),
	(53, NULL, 'STATUS_INVALIDATE', 'user', NULL, 'DISABLED', '2026-10-22 08:21:07', 6, 'SYSTEM'),
	(54, 4, 'ACCOUNT_DEACTIVATE', 'user', NULL, 'ACTIVE -> DISABLED', '2026-10-22 08:21:07', 6, 'USER'),
	(55, NULL, 'STATUS_INVALIDATE', 'user', NULL, 'ACTIVE', '2026-10-22 08:21:12', 6, 'SYSTEM'),
	(56, 4, 'ACCOUNT_ACTIVATE', 'user', NULL, 'DISABLED -> ACTIVE', '2026-10-22 08:21:12', 6, 'USER'),
	(57, NULL, 'STATUS_INVALIDATE', 'user', NULL, 'DISABLED', '2026-10-22 08:21:17', 6, 'SYSTEM'),
	(58, 4, 'ACCOUNT_DEACTIVATE', 'user', NULL, 'ACTIVE -> DISABLED', '2026-10-22 08:21:17', 6, 'USER'),
	(59, NULL, 'STATUS_INVALIDATE', 'user', NULL, 'ACTIVE', '2026-10-22 08:21:20', 6, 'SYSTEM'),
	(60, 4, 'ACCOUNT_ACTIVATE', 'user', NULL, 'DISABLED -> ACTIVE', '2026-10-22 08:21:21', 6, 'USER'),
	(61, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-22 08:40:09', 4, 'SYSTEM'),
	(62, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-22 08:40:09', 4, 'USER'),
	(63, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-22 08:47:11', 4, 'SYSTEM'),
	(64, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-22 08:47:11', 4, 'USER'),
	(65, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-22 14:25:27', 4, 'SYSTEM'),
	(66, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-22 14:25:28', 4, 'USER'),
	(67, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-22 14:27:07', 4, 'SYSTEM'),
	(68, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-22 14:27:07', 4, 'USER'),
	(69, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-22 21:34:19', 4, 'SYSTEM'),
	(70, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-22 21:34:20', 4, 'USER'),
	(71, NULL, 'LOGIN_FAILURE', 'user', NULL, 'LOGIN_FAILURE', '2026-10-22 21:50:25', 4, 'SYSTEM'),
	(72, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-22 21:50:30', 4, 'SYSTEM'),
	(73, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-22 21:50:31', 4, 'USER'),
	(74, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-22 21:55:26', 4, 'SYSTEM'),
	(75, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-22 21:55:27', 4, 'USER'),
	(76, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-22 22:38:11', 4, 'SYSTEM'),
	(77, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-22 22:38:12', 4, 'USER'),
	(78, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-22 23:10:25', 4, 'SYSTEM'),
	(79, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-22 23:10:25', 4, 'USER'),
	(80, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-22 23:26:25', 4, 'SYSTEM'),
	(81, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-22 23:26:25', 4, 'USER'),
	(82, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-22 23:43:12', 4, 'SYSTEM'),
	(83, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-22 23:43:12', 4, 'USER'),
	(84, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-22 23:46:18', 4, 'SYSTEM'),
	(85, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-22 23:46:18', 4, 'USER'),
	(86, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-22 23:56:10', 4, 'SYSTEM'),
	(87, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-22 23:56:11', 4, 'USER'),
	(88, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-22 23:59:56', 4, 'SYSTEM'),
	(89, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-22 23:59:56', 4, 'USER'),
	(90, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-23 06:53:56', 4, 'SYSTEM'),
	(91, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-23 06:53:57', 4, 'USER'),
	(92, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-23 07:25:21', 4, 'SYSTEM'),
	(93, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-23 07:25:21', 4, 'USER'),
	(94, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-23 10:21:12', 4, 'SYSTEM'),
	(95, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-23 10:21:13', 4, 'USER'),
	(96, 4, 'ACCOUNT_CREATE', 'user', NULL, 'FAMILY_MEMBER', '2026-10-23 10:34:24', 8, 'USER'),
	(97, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-23 14:00:44', 4, 'SYSTEM'),
	(98, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-23 14:00:44', 4, 'USER'),
	(99, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-23 15:00:39', 4, 'SYSTEM'),
	(100, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-23 15:00:40', 4, 'USER'),
	(101, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-23 15:20:59', 4, 'SYSTEM'),
	(102, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-23 15:21:00', 4, 'USER'),
	(103, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-24 01:42:00', 4, 'SYSTEM'),
	(104, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-24 01:42:00', 4, 'USER'),
	(105, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-24 02:30:58', 4, 'SYSTEM'),
	(106, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-24 02:30:58', 4, 'USER'),
	(107, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-24 03:20:49', 4, 'SYSTEM'),
	(108, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-24 03:20:49', 4, 'USER'),
	(109, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-24 03:41:03', 4, 'SYSTEM'),
	(110, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-24 03:41:03', 4, 'USER'),
	(111, NULL, 'LOGIN_FAILURE', 'user', NULL, 'LOGIN_FAILURE', '2026-10-24 07:52:45', 5, 'SYSTEM'),
	(112, NULL, 'LOGIN_FAILURE', 'user', NULL, 'LOGIN_FAILURE', '2026-10-24 07:52:59', 5, 'SYSTEM'),
	(113, NULL, 'LOGIN_FAILURE', 'user', NULL, 'LOGIN_FAILURE', '2026-10-24 08:05:03', 5, 'SYSTEM'),
	(114, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-24 08:35:47', 4, 'SYSTEM'),
	(115, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-24 08:35:48', 4, 'USER'),
	(116, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-24 09:07:51', 4, 'SYSTEM'),
	(117, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-24 09:07:51', 4, 'USER'),
	(118, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-24 16:07:59', 4, 'SYSTEM'),
	(119, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-24 16:08:00', 4, 'USER'),
	(120, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-25 04:05:17', 4, 'SYSTEM'),
	(121, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-25 04:05:18', 4, 'USER'),
	(122, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-25 07:33:44', 5, 'SYSTEM'),
	(123, 5, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-25 07:33:45', 5, 'USER'),
	(124, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-25 08:42:06', 4, 'SYSTEM'),
	(125, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-25 08:42:06', 4, 'USER'),
	(126, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-25 14:53:30', 5, 'SYSTEM'),
	(127, 5, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-25 14:53:31', 5, 'USER'),
	(128, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-25 15:08:19', 5, 'SYSTEM'),
	(129, 5, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-25 15:08:19', 5, 'USER'),
	(130, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-26 03:03:15', 5, 'SYSTEM'),
	(131, 5, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-26 03:03:16', 5, 'USER'),
	(132, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-26 03:31:36', 5, 'SYSTEM'),
	(133, 5, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-26 03:31:36', 5, 'USER'),
	(134, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-26 08:25:20', 4, 'SYSTEM'),
	(135, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-26 08:25:21', 4, 'USER'),
	(136, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-26 15:52:32', 4, 'SYSTEM'),
	(137, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-26 15:52:33', 4, 'USER'),
	(138, 2, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 05:29:22', 2, 'USER'),
	(139, 2, 'RACK_SAVE', 'warehouse', NULL, 'E', '2026-10-27 05:41:59', 4, 'USER'),
	(140, 2, 'RACK_SAVE', 'warehouse', NULL, 'E', '2026-10-27 05:42:09', 4, 'USER'),
	(141, 2, 'RACK_SAVE', 'warehouse', NULL, 'E', '2026-10-27 05:42:16', 4, 'USER'),
	(142, 2, 'RACK_SAVE', 'warehouse', NULL, 'C', '2026-10-27 05:42:23', 3, 'USER'),
	(143, 2, 'RACK_SAVE', 'warehouse', NULL, 'C', '2026-10-27 05:42:30', 3, 'USER'),
	(144, 2, 'RACK_SAVE', 'warehouse', NULL, 'B', '2026-10-27 05:42:38', 2, 'USER'),
	(145, 2, 'RACK_SAVE', 'warehouse', NULL, 'A', '2026-10-27 05:42:47', 1, 'USER'),
	(146, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 07:52:50', 4, 'SYSTEM'),
	(147, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 07:52:50', 4, 'USER'),
	(148, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 09:00:57', 4, 'SYSTEM'),
	(149, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 09:00:58', 4, 'USER'),
	(150, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 09:43:28', 4, 'SYSTEM'),
	(151, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 09:43:28', 4, 'USER'),
	(152, NULL, 'ACCOUNT_CREATE', 'user', NULL, 'CUSTOMER', '2026-10-27 09:51:28', 9, 'SYSTEM'),
	(153, NULL, 'OTP_SENT', 'user', NULL, 'REGISTER_EMAIL', '2026-10-27 09:51:29', 9, 'SYSTEM'),
	(154, NULL, 'OTP_SENT', 'user', NULL, 'REGISTER_EMAIL', '2026-10-27 09:52:52', 9, 'SYSTEM'),
	(155, 9, 'ACCOUNT_VERIFIED', 'user', NULL, 'EMAIL', '2026-10-27 09:53:38', 9, 'USER'),
	(156, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 09:53:55', 9, 'SYSTEM'),
	(157, 9, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 09:53:56', 9, 'USER'),
	(158, 2, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 09:55:53', 2, 'USER'),
	(159, NULL, 'ACCOUNT_CREATE', 'user', NULL, 'CUSTOMER', '2026-10-27 09:56:26', 10, 'SYSTEM'),
	(160, 10, 'GOOGLE_LINK', 'user', NULL, 'google:a02e1066863c8c0bb3c77109def49a34a10fab7323c3378abd4e680d937f06cf', '2026-10-27 09:56:27', 10, 'USER'),
	(161, 10, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 09:56:27', 10, 'USER'),
	(162, 2, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 09:57:30', 2, 'USER'),
	(163, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 09:59:15', 4, 'SYSTEM'),
	(164, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 09:59:16', 4, 'USER'),
	(165, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 10:01:46', 4, 'SYSTEM'),
	(166, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 10:01:46', 4, 'USER'),
	(167, 2, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 10:53:48', 2, 'USER'),
	(168, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 10:54:24', 4, 'SYSTEM'),
	(169, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 10:54:24', 4, 'USER'),
	(170, 2, 'RACK_SAVE', 'warehouse', NULL, 'C', '2026-10-27 11:07:39', 3, 'USER'),
	(171, 2, 'RACK_SAVE', 'warehouse', NULL, 'E', '2026-10-27 11:07:48', 4, 'USER'),
	(172, NULL, 'LOGIN_FAILURE', 'user', NULL, 'LOGIN_FAILURE', '2026-10-27 11:44:13', 3, 'SYSTEM'),
	(173, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 11:44:33', 3, 'SYSTEM'),
	(174, 3, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 11:44:33', 3, 'USER'),
	(175, NULL, 'PASSWORD_INVALIDATE', 'user', NULL, 'Existing sessions and reset grants revoked', '2026-10-27 11:44:49', 3, 'SYSTEM'),
	(176, 3, 'PASSWORD_CHANGE', 'user', NULL, 'Password replaced; sessions revoked', '2026-10-27 11:44:50', 3, 'USER'),
	(177, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 11:45:00', 3, 'SYSTEM'),
	(178, 3, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 11:45:00', 3, 'USER'),
	(179, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 11:45:12', 4, 'SYSTEM'),
	(180, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 11:45:12', 4, 'USER'),
	(181, NULL, 'LOGIN_FAILURE', 'user', NULL, 'LOGIN_FAILURE', '2026-10-27 11:45:21', 5, 'SYSTEM'),
	(182, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 11:45:30', 5, 'SYSTEM'),
	(183, 5, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 11:45:30', 5, 'USER'),
	(184, NULL, 'PASSWORD_INVALIDATE', 'user', NULL, 'Existing sessions and reset grants revoked', '2026-10-27 11:45:45', 5, 'SYSTEM'),
	(185, 5, 'PASSWORD_CHANGE', 'user', NULL, 'Password replaced; sessions revoked', '2026-10-27 11:45:45', 5, 'USER'),
	(186, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 11:45:51', 5, 'SYSTEM'),
	(187, 5, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 11:45:52', 5, 'USER'),
	(188, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 11:46:08', 7, 'SYSTEM'),
	(189, 7, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 11:46:08', 7, 'USER'),
	(190, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 15:28:32', 4, 'SYSTEM'),
	(191, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 15:28:33', 4, 'USER'),
	(192, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 15:42:29', 7, 'SYSTEM'),
	(193, 7, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 15:42:29', 7, 'USER'),
	(194, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 15:42:48', 4, 'SYSTEM'),
	(195, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 15:42:48', 4, 'USER'),
	(196, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 16:52:34', 4, 'SYSTEM'),
	(197, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 16:52:35', 4, 'USER'),
	(198, 2, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 17:11:27', 2, 'USER'),
	(199, 2, 'RACK_LAYOUT_TIDY', 'warehouse', NULL, 'Xếp gọn theo hàng', '2026-10-27 17:12:02', 1, 'USER'),
	(200, 2, 'RACK_LAYOUT_TIDY', 'warehouse', NULL, 'Xếp gọn theo hàng', '2026-10-27 17:12:02', 2, 'USER'),
	(201, 2, 'RACK_LAYOUT_TIDY', 'warehouse', NULL, 'Xếp gọn theo hàng', '2026-10-27 17:12:02', 3, 'USER'),
	(202, 2, 'RACK_LAYOUT_TIDY', 'warehouse', NULL, 'Xếp gọn theo hàng', '2026-10-27 17:12:02', 4, 'USER'),
	(203, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 17:31:44', 4, 'SYSTEM'),
	(204, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 17:31:45', 4, 'USER'),
	(205, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 20:15:18', 5, 'SYSTEM'),
	(206, 5, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 20:15:19', 5, 'USER'),
	(207, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 20:27:12', 5, 'SYSTEM'),
	(208, 5, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 20:27:13', 5, 'USER'),
	(209, NULL, 'PASSWORD_INVALIDATE', 'user', NULL, 'Existing sessions and reset grants revoked', '2026-10-27 20:27:47', 5, 'SYSTEM'),
	(210, 5, 'PASSWORD_CHANGE', 'user', NULL, 'Password replaced; sessions revoked', '2026-10-27 20:27:47', 5, 'USER'),
	(211, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 20:27:58', 5, 'SYSTEM'),
	(212, 5, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 20:27:58', 5, 'USER'),
	(213, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 20:29:44', 5, 'SYSTEM'),
	(214, 5, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 20:29:44', 5, 'USER'),
	(215, NULL, 'PASSWORD_INVALIDATE', 'user', NULL, 'Existing sessions and reset grants revoked', '2026-10-27 20:29:59', 5, 'SYSTEM'),
	(216, 5, 'PASSWORD_CHANGE', 'user', NULL, 'Password replaced; sessions revoked', '2026-10-27 20:29:59', 5, 'USER'),
	(217, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 20:30:07', 5, 'SYSTEM'),
	(218, 5, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 20:30:07', 5, 'USER'),
	(219, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 20:30:23', 3, 'SYSTEM'),
	(220, 3, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 20:30:24', 3, 'USER'),
	(221, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 20:37:43', 3, 'SYSTEM'),
	(222, 3, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 20:37:43', 3, 'USER'),
	(223, NULL, 'LOGIN_FAILURE', 'user', NULL, 'LOGIN_FAILURE', '2026-10-27 20:38:05', 5, 'SYSTEM'),
	(224, NULL, 'LOGIN_FAILURE', 'user', NULL, 'LOGIN_FAILURE', '2026-10-27 20:38:10', 5, 'SYSTEM'),
	(225, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 20:38:14', 5, 'SYSTEM'),
	(226, 5, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 20:38:15', 5, 'USER'),
	(227, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 20:38:27', 3, 'SYSTEM'),
	(228, 3, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 20:38:27', 3, 'USER'),
	(229, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 20:47:31', 4, 'SYSTEM'),
	(230, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 20:47:32', 4, 'USER'),
	(231, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 20:47:54', 5, 'SYSTEM'),
	(232, 5, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 20:47:54', 5, 'USER'),
	(233, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-27 20:48:34', 4, 'SYSTEM'),
	(234, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-27 20:48:35', 4, 'USER'),
	(235, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-28 01:07:24', 4, 'SYSTEM'),
	(236, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-28 01:07:24', 4, 'USER'),
	(237, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-28 01:18:08', 5, 'SYSTEM'),
	(238, 5, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-28 01:18:08', 5, 'USER'),
	(239, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-28 01:20:23', 5, 'SYSTEM'),
	(240, 5, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-28 01:20:24', 5, 'USER'),
	(241, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-28 02:08:21', 4, 'SYSTEM'),
	(242, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-28 02:08:21', 4, 'USER'),
	(243, NULL, 'LOGIN_SUCCESS', 'user', NULL, 'LOGIN_SUCCESS', '2026-10-28 05:19:10', 4, 'SYSTEM'),
	(244, 4, 'LOGIN', 'user', NULL, 'IP 0:0:0:0:0:0:0:1', '2026-10-28 05:19:11', 4, 'USER');

-- Dumping structure for table thors_restore.cart
CREATE TABLE IF NOT EXISTS `cart` (
  `cart_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  PRIMARY KEY (`cart_id`),
  UNIQUE KEY `uq_cart_1` (`user_id`),
  CONSTRAINT `fk_cart_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.cart: ~0 rows (approximately)

-- Dumping structure for table thors_restore.cart_item
CREATE TABLE IF NOT EXISTS `cart_item` (
  `cart_item_id` int NOT NULL AUTO_INCREMENT,
  `cart_id` int NOT NULL,
  `detail_id` int NOT NULL COMMENT 'UNIQUE (cart_id, detail_id)',
  `quantity` int NOT NULL COMMENT 'Giá lấy trực tiếp từ product_detail.price',
  PRIMARY KEY (`cart_item_id`),
  UNIQUE KEY `uq_cart_item_1` (`cart_id`,`detail_id`),
  KEY `fk_cart_item_detail_id` (`detail_id`),
  CONSTRAINT `fk_cart_item_cart_id` FOREIGN KEY (`cart_id`) REFERENCES `cart` (`cart_id`),
  CONSTRAINT `fk_cart_item_detail_id` FOREIGN KEY (`detail_id`) REFERENCES `product_detail` (`detail_id`),
  CONSTRAINT `ck_cart_item_1` CHECK ((`quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.cart_item: ~0 rows (approximately)

-- Dumping structure for table thors_restore.category
CREATE TABLE IF NOT EXISTS `category` (
  `category_id` int NOT NULL AUTO_INCREMENT,
  `category_name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `status` varchar(20) NOT NULL,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `uq_category_1` (`category_name`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.category: ~1 rows (approximately)
INSERT INTO `category` (`category_id`, `category_name`, `description`, `status`) VALUES
	(1, 'Áo', 'abc', 'ACTIVE'),
	(2, 'Quần', 'Quần gia công chất liệu bền màu theo thời gian', 'ACTIVE');

-- Dumping structure for table thors_restore.discount_code
CREATE TABLE IF NOT EXISTS `discount_code` (
  `discount_code_id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(30) NOT NULL,
  `discount_percentage` decimal(5,2) NOT NULL,
  `min_order_value` decimal(12,0) NOT NULL DEFAULT '0',
  `max_discount_amount` decimal(12,0) DEFAULT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `usage_limit` int DEFAULT NULL COMMENT 'NULL = không giới hạn',
  `used_count` int NOT NULL DEFAULT '0',
  `status` varchar(20) NOT NULL,
  `created_by` int NOT NULL COMMENT 'Owner tạo; giữ lịch sử người thao tác',
  PRIMARY KEY (`discount_code_id`),
  UNIQUE KEY `uq_discount_code_1` (`code`),
  KEY `fk_discount_code_created_by` (`created_by`),
  CONSTRAINT `fk_discount_code_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`),
  CONSTRAINT `ck_discount_code_1` CHECK ((`discount_percentage` between 0 and 100)),
  CONSTRAINT `ck_discount_code_2` CHECK ((`end_date` > `start_date`)),
  CONSTRAINT `ck_discount_code_3` CHECK ((`min_order_value` >= 0)),
  CONSTRAINT `ck_discount_code_4` CHECK (((`max_discount_amount` is null) or (`max_discount_amount` >= 0))),
  CONSTRAINT `ck_discount_code_5` CHECK (((`usage_limit` is null) or (`usage_limit` > 0))),
  CONSTRAINT `ck_discount_code_6` CHECK ((`used_count` >= 0)),
  CONSTRAINT `ck_discount_code_7` CHECK (((`usage_limit` is null) or (`used_count` <= `usage_limit`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.discount_code: ~0 rows (approximately)

-- Dumping structure for table thors_restore.image_search
CREATE TABLE IF NOT EXISTS `image_search` (
  `search_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL COMMENT 'NULL cho Guest; Admin bị chặn ở backend',
  `image_url` varchar(500) NOT NULL,
  `selected_product_id` int DEFAULT NULL COMMENT 'NULL nếu người dùng không chọn sản phẩm nào',
  `searched_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `image_public_id` varchar(255) DEFAULT NULL COMMENT 'Định danh ảnh truy vấn nếu lưu trên cloud',
  `model_version` varchar(100) NOT NULL COMMENT 'Phiên bản mô hình và cách tính score',
  PRIMARY KEY (`search_id`),
  KEY `ix_image_search_1` (`user_id`,`searched_at`),
  KEY `fk_image_search_selected_product_id` (`selected_product_id`),
  CONSTRAINT `fk_image_search_selected_product_id` FOREIGN KEY (`selected_product_id`) REFERENCES `product` (`product_id`),
  CONSTRAINT `fk_image_search_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.image_search: ~0 rows (approximately)

-- Dumping structure for table thors_restore.invoice
CREATE TABLE IF NOT EXISTS `invoice` (
  `invoice_id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL COMMENT 'Quan hệ 1-1 với đơn hàng',
  `invoice_number` varchar(30) NOT NULL COMMENT 'Index (tra cứu theo mã)',
  `issued_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `issued_by` int DEFAULT NULL COMMENT 'NULL nếu hệ thống phát hành; Staff chỉ tạo cho giao dịch tại quầy theo quyền',
  `issuer_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'USER / SYSTEM',
  PRIMARY KEY (`invoice_id`),
  UNIQUE KEY `uq_invoice_1` (`order_id`),
  UNIQUE KEY `uq_invoice_2` (`invoice_number`),
  KEY `fk_invoice_issued_by` (`issued_by`),
  CONSTRAINT `fk_invoice_issued_by` FOREIGN KEY (`issued_by`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_invoice_order_id` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`),
  CONSTRAINT `ck_invoice_1` CHECK ((`issuer_type` in (_utf8mb4'USER',_utf8mb4'SYSTEM')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.invoice: ~0 rows (approximately)

-- Dumping structure for table thors_restore.notification
CREATE TABLE IF NOT EXISTS `notification` (
  `notification_id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `message` text NOT NULL,
  `type` varchar(30) NOT NULL,
  `related_entity_type` varchar(50) DEFAULT NULL,
  `related_entity_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `ix_notification_1` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.notification: ~2 rows (approximately)
INSERT INTO `notification` (`notification_id`, `title`, `message`, `type`, `related_entity_type`, `related_entity_id`, `created_at`) VALUES
	(1, 'Password changed', 'Your password was changed and you were signed out on all devices. If this wasn\'t you, contact an administrator right away.', 'ACCOUNT_SECURITY', NULL, NULL, '2026-10-27 20:27:47'),
	(2, 'Password changed', 'Your password was changed and you were signed out on all devices. If this wasn\'t you, contact an administrator right away.', 'ACCOUNT_SECURITY', NULL, NULL, '2026-10-27 20:29:59');

-- Dumping structure for table thors_restore.order_item
CREATE TABLE IF NOT EXISTS `order_item` (
  `order_item_id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `detail_id` int NOT NULL,
  `quantity` int NOT NULL,
  `unit_price` decimal(12,0) NOT NULL COMMENT 'Chốt giá tại thời điểm mua; thành tiền = quantity × unit_price',
  `product_name_snapshot` varchar(200) NOT NULL COMMENT 'Tên tại lúc đặt; không đổi khi sản phẩm đổi tên',
  `size_snapshot` varchar(10) NOT NULL,
  `color_snapshot` varchar(30) NOT NULL,
  `reserved_quantity` int NOT NULL DEFAULT '0' COMMENT 'Lượng giữ cho dòng đơn; đóng giữ phải về 0 cùng transaction',
  PRIMARY KEY (`order_item_id`),
  KEY `fk_order_item_order_id` (`order_id`),
  KEY `fk_order_item_detail_id` (`detail_id`),
  CONSTRAINT `fk_order_item_detail_id` FOREIGN KEY (`detail_id`) REFERENCES `product_detail` (`detail_id`),
  CONSTRAINT `fk_order_item_order_id` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`),
  CONSTRAINT `ck_order_item_1` CHECK ((`quantity` > 0)),
  CONSTRAINT `ck_order_item_2` CHECK ((`unit_price` >= 0)),
  CONSTRAINT `ck_order_item_3` CHECK ((`reserved_quantity` between 0 and `quantity`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.order_item: ~0 rows (approximately)

-- Dumping structure for table thors_restore.orders
CREATE TABLE IF NOT EXISTS `orders` (
  `order_id` int NOT NULL AUTO_INCREMENT,
  `order_number` varchar(30) NOT NULL COMMENT 'Index (tra cứu theo mã)',
  `order_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Loại đơn: Online hoặc In-Store (bán tại quầy)',
  `user_id` int NOT NULL COMMENT 'Online: khách đặt đơn. In-Store: người bán tạo đơn; Owner vẫn phải xác nhận.',
  `discount_code_id` int DEFAULT NULL COMMENT 'Chỉ áp dụng cho đơn online; đơn tại quầy để NULL',
  `promotion_id` int DEFAULT NULL COMMENT 'Chỉ áp dụng cho đơn online; đơn tại quầy để NULL',
  `delivery_name` varchar(100) DEFAULT NULL COMMENT 'Đơn tại quầy có thể để trống',
  `delivery_phone` varchar(15) DEFAULT NULL,
  `delivery_address` varchar(255) DEFAULT NULL,
  `order_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `order_status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'AWAITING_PAYMENT / PENDING_CONFIRMATION / AWAITING_PICKUP / SHIPPING / DELIVERED / COMPLETED / CANCELLED / REJECTED / EXPIRED',
  `payment_expires_at` datetime DEFAULT NULL COMMENT 'Hạn trả tiền online; hạn giữ tạm ở stock_hold_expires_at, PAID không tự hết hạn.',
  `total_amount` decimal(12,0) NOT NULL,
  `created_by` int NOT NULL COMMENT 'Online: khách hàng; tại quầy: Owner/Family/Staff theo quyền bán hàng',
  `confirmed_by` int DEFAULT NULL COMMENT 'Chỉ OWNER được xác nhận cả đơn online và tại quầy',
  `confirmed_at` datetime DEFAULT NULL COMMENT 'Mốc xác nhận thành công',
  `stock_deducted_at` datetime DEFAULT NULL COMMENT 'Đánh dấu đã trừ tồn; không trừ lần hai khi đổi trạng thái hoặc callback',
  `preparation_status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'NOT_STARTED' COMMENT 'NOT_STARTED / PREPARING / PREPARED; thao tác đơn online do Owner thực hiện',
  `payment_method` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'CASH / COD / ONLINE; độc lập với trạng thái xử lý đơn',
  `payment_status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'UNPAID / PAID / REFUND_PENDING / PARTIALLY_REFUNDED / REFUNDED / NOT_REQUIRED',
  `items_amount` decimal(12,0) NOT NULL COMMENT 'Tổng quantity × unit_price tại lúc đặt',
  `promotion_discount_amount` decimal(12,0) NOT NULL DEFAULT '0' COMMENT 'Số tiền khuyến mãi thực tế đã chốt',
  `coupon_discount_amount` decimal(12,0) NOT NULL DEFAULT '0' COMMENT 'Số tiền mã giảm giá thực tế đã chốt',
  `manual_discount_amount` decimal(12,0) NOT NULL DEFAULT '0' COMMENT 'Giảm giá trực tiếp tại quầy, tính bằng VNĐ',
  `shipping_fee` decimal(12,0) NOT NULL DEFAULT '0' COMMENT 'Phí khách trả; tại quầy bằng 0',
  `coupon_code_snapshot` varchar(30) DEFAULT NULL COMMENT 'Mã đã áp dụng, giữ khi mã gốc đổi',
  `promotion_name_snapshot` varchar(100) DEFAULT NULL COMMENT 'Tên khuyến mãi đã áp dụng',
  `cancel_reason` varchar(255) DEFAULT NULL COMMENT 'Hủy, từ chối, hết hạn hoặc thiếu hàng khi xác nhận',
  `cancelled_at` datetime DEFAULT NULL COMMENT 'Không tự động cộng hàng khi có giá trị này',
  `related_order_id` int DEFAULT NULL COMMENT 'Đơn gốc khi tạo đơn thay thế để đổi hàng',
  `stock_hold_status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'NONE' COMMENT 'NONE / TEMPORARY / PAID / CONSUMED / RELEASED / EXPIRED',
  `stock_hold_payment_id` int DEFAULT NULL COMMENT 'Lần thử trả tiền đang được giữ hàng; phải thuộc đơn này',
  `stock_hold_expires_at` datetime DEFAULT NULL COMMENT 'Hạn giữ tạm; giữ PAID không hết hạn tự động',
  `stock_hold_created_at` datetime DEFAULT NULL COMMENT 'Mốc bắt đầu giữ hiện hành',
  `stock_hold_paid_at` datetime DEFAULT NULL COMMENT 'Mốc callback thành công',
  `stock_hold_closed_at` datetime DEFAULT NULL COMMENT 'Mốc tiêu thụ hoặc giải phóng giữ',
  `stock_hold_close_reason` varchar(255) DEFAULT NULL COMMENT 'Lý do đóng giữ hàng',
  `stock_hold_key` varchar(100) DEFAULT NULL COMMENT 'Khóa idempotency của lần giữ hiện hành; các lần cũ ghi audit_log',
  `shipping_carrier` varchar(50) DEFAULT NULL COMMENT 'Đơn vị vận chuyển',
  `shipping_service_code` varchar(50) DEFAULT NULL COMMENT 'Mã dịch vụ vận chuyển',
  `provider_shipment_id` varchar(100) DEFAULT NULL COMMENT 'Mã lô giao hàng trên nhà vận chuyển',
  `tracking_number` varchar(100) DEFAULT NULL COMMENT 'Mã vận đơn; một lô giao mỗi đơn ở phiên bản đầu',
  `shipment_status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Trạng thái giao vận riêng với trạng thái xử lý đơn',
  `carrier_shipping_fee` decimal(12,0) DEFAULT NULL COMMENT 'Phí dịch vụ thực tế; shipping_fee là số tiền khách trả',
  `cod_amount` decimal(12,0) DEFAULT NULL COMMENT 'Số tiền nhà vận chuyển thu hộ',
  `shipment_created_at` datetime DEFAULT NULL COMMENT 'Mốc tạo vận đơn',
  `shipment_picked_up_at` datetime DEFAULT NULL COMMENT 'Mốc nhà vận chuyển nhận hàng',
  `shipment_delivered_at` datetime DEFAULT NULL COMMENT 'Mốc giao thành công',
  `shipment_updated_at` datetime DEFAULT NULL COMMENT 'Mốc cập nhật giao vận',
  `shipment_last_event_id` varchar(100) DEFAULT NULL COMMENT 'Kiểm soát webhook vận chuyển lặp',
  PRIMARY KEY (`order_id`),
  UNIQUE KEY `uq_orders_1` (`order_number`),
  UNIQUE KEY `uq_orders_2` (`stock_hold_key`),
  UNIQUE KEY `uq_orders_3` (`shipping_carrier`,`tracking_number`),
  KEY `ix_orders_1` (`order_status`,`payment_expires_at`),
  KEY `ix_orders_2` (`user_id`,`order_type`,`order_date`),
  KEY `ix_orders_3` (`created_by`,`order_type`,`order_date`),
  KEY `ix_orders_4` (`stock_hold_status`,`stock_hold_expires_at`),
  KEY `fk_orders_discount_code_id` (`discount_code_id`),
  KEY `fk_orders_promotion_id` (`promotion_id`),
  KEY `fk_orders_confirmed_by` (`confirmed_by`),
  KEY `fk_orders_related_order_id` (`related_order_id`),
  KEY `fk_orders_stock_hold_payment_id` (`stock_hold_payment_id`),
  CONSTRAINT `fk_orders_confirmed_by` FOREIGN KEY (`confirmed_by`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_orders_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_orders_discount_code_id` FOREIGN KEY (`discount_code_id`) REFERENCES `discount_code` (`discount_code_id`),
  CONSTRAINT `fk_orders_promotion_id` FOREIGN KEY (`promotion_id`) REFERENCES `promotion` (`promotion_id`),
  CONSTRAINT `fk_orders_related_order_id` FOREIGN KEY (`related_order_id`) REFERENCES `orders` (`order_id`),
  CONSTRAINT `fk_orders_stock_hold_payment_id` FOREIGN KEY (`stock_hold_payment_id`) REFERENCES `payment` (`payment_id`),
  CONSTRAINT `fk_orders_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`),
  CONSTRAINT `ck_orders_1` CHECK ((`order_type` in (_utf8mb4'Online',_utf8mb4'In-Store'))),
  CONSTRAINT `ck_orders_10` CHECK ((`shipping_fee` >= 0)),
  CONSTRAINT `ck_orders_11` CHECK ((`stock_hold_status` in (_utf8mb4'NONE',_utf8mb4'TEMPORARY',_utf8mb4'PAID',_utf8mb4'CONSUMED',_utf8mb4'RELEASED',_utf8mb4'EXPIRED'))),
  CONSTRAINT `ck_orders_12` CHECK ((`shipment_status` in (_utf8mb4'CREATED',_utf8mb4'AWAITING_PICKUP',_utf8mb4'IN_TRANSIT',_utf8mb4'DELIVERED',_utf8mb4'FAILED',_utf8mb4'RETURNING',_utf8mb4'RETURNED',_utf8mb4'CANCELLED'))),
  CONSTRAINT `ck_orders_13` CHECK ((`carrier_shipping_fee` >= 0)),
  CONSTRAINT `ck_orders_14` CHECK ((`cod_amount` >= 0)),
  CONSTRAINT `ck_orders_15` CHECK (((`stock_hold_status` not in (_utf8mb4'TEMPORARY',_utf8mb4'PAID')) or (`stock_hold_payment_id` is not null))),
  CONSTRAINT `ck_orders_16` CHECK (((`stock_hold_status` <> _utf8mb4'TEMPORARY') or (`stock_hold_expires_at` is not null))),
  CONSTRAINT `ck_orders_17` CHECK (((`stock_hold_status` <> _utf8mb4'PAID') or ((`stock_hold_paid_at` is not null) and (`stock_hold_expires_at` is null)))),
  CONSTRAINT `ck_orders_2` CHECK ((`order_status` in (_utf8mb4'AWAITING_PAYMENT',_utf8mb4'PENDING_CONFIRMATION',_utf8mb4'AWAITING_PICKUP',_utf8mb4'SHIPPING',_utf8mb4'DELIVERED',_utf8mb4'COMPLETED',_utf8mb4'CANCELLED',_utf8mb4'REJECTED',_utf8mb4'EXPIRED'))),
  CONSTRAINT `ck_orders_3` CHECK ((`total_amount` >= 0)),
  CONSTRAINT `ck_orders_4` CHECK ((`preparation_status` in (_utf8mb4'NOT_STARTED',_utf8mb4'PREPARING',_utf8mb4'PREPARED'))),
  CONSTRAINT `ck_orders_5` CHECK ((`payment_method` in (_utf8mb4'CASH',_utf8mb4'COD',_utf8mb4'ONLINE'))),
  CONSTRAINT `ck_orders_6` CHECK ((`payment_status` in (_utf8mb4'UNPAID',_utf8mb4'PAID',_utf8mb4'REFUND_PENDING',_utf8mb4'PARTIALLY_REFUNDED',_utf8mb4'REFUNDED',_utf8mb4'NOT_REQUIRED'))),
  CONSTRAINT `ck_orders_7` CHECK ((`items_amount` >= 0)),
  CONSTRAINT `ck_orders_8` CHECK ((`promotion_discount_amount` >= 0)),
  CONSTRAINT `ck_orders_9` CHECK ((`coupon_discount_amount` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.orders: ~0 rows (approximately)

-- Dumping structure for table thors_restore.payment
CREATE TABLE IF NOT EXISTS `payment` (
  `payment_id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL COMMENT 'Một đơn có thể thanh toán nhiều lần (thử lại)',
  `transaction_ref` varchar(100) DEFAULT NULL COMMENT 'Mã giao dịch từ cổng thanh toán',
  `payment_method` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `payment_status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'PENDING / SUCCESS / FAILED / EXPIRED; trạng thái một lần thử thanh toán',
  `amount` decimal(12,0) NOT NULL,
  `attempted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `provider` varchar(50) DEFAULT NULL COMMENT 'Nhà cung cấp thanh toán; transaction_ref phải duy nhất theo quy ước tích hợp',
  `paid_at` datetime DEFAULT NULL COMMENT 'Lưu khi SUCCESS',
  `failure_reason` varchar(255) DEFAULT NULL COMMENT 'Lỗi hoặc lý do từ chối thanh toán',
  `refunded_amount` decimal(12,0) NOT NULL DEFAULT '0' COMMENT 'Tổng tiền đã hoàn thành công của lần thu tiền này',
  `refund_history` json DEFAULT NULL COMMENT 'Mảng các lần hoàn: amount/status/ref/idempotency_key/reason/requested_by/requested_at/completed_at/return_request_id',
  PRIMARY KEY (`payment_id`),
  UNIQUE KEY `uq_payment_1` (`transaction_ref`),
  KEY `ix_payment_1` (`order_id`,`payment_status`,`attempted_at`),
  CONSTRAINT `fk_payment_order_id` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`),
  CONSTRAINT `ck_payment_1` CHECK ((`payment_method` in (_utf8mb4'CASH',_utf8mb4'COD',_utf8mb4'ONLINE'))),
  CONSTRAINT `ck_payment_2` CHECK ((`payment_status` in (_utf8mb4'PENDING',_utf8mb4'SUCCESS',_utf8mb4'FAILED',_utf8mb4'EXPIRED'))),
  CONSTRAINT `ck_payment_3` CHECK ((`amount` > 0)),
  CONSTRAINT `ck_payment_4` CHECK ((`refunded_amount` between 0 and `amount`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.payment: ~0 rows (approximately)

-- Dumping structure for table thors_restore.product
CREATE TABLE IF NOT EXISTS `product` (
  `product_id` int NOT NULL AUTO_INCREMENT,
  `category_id` int NOT NULL,
  `product_name` varchar(200) NOT NULL COMMENT 'Index (tìm theo tên)',
  `description` text,
  `status` varchar(20) NOT NULL,
  PRIMARY KEY (`product_id`),
  KEY `ix_product_1` (`product_name`),
  KEY `fk_product_category_id` (`category_id`),
  CONSTRAINT `fk_product_category_id` FOREIGN KEY (`category_id`) REFERENCES `category` (`category_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.product: ~4 rows (approximately)
INSERT INTO `product` (`product_id`, `category_id`, `product_name`, `description`, `status`) VALUES
	(3, 1, 'cơm', '', 'ACTIVE'),
	(4, 1, 'cho', '', 'ACTIVE'),
	(5, 1, 'Áo baby doll', 'abcde', 'ACTIVE'),
	(6, 2, 'Quần đùi gió', '', 'INACTIVE');

-- Dumping structure for table thors_restore.product_detail
CREATE TABLE IF NOT EXISTS `product_detail` (
  `detail_id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL COMMENT 'UNIQUE (product_id, size, color)',
  `size` varchar(10) NOT NULL,
  `color` varchar(30) NOT NULL,
  `price` decimal(12,0) NOT NULL COMMENT 'VNĐ, không có phần lẻ',
  `stock_quantity` int NOT NULL DEFAULT '0' COMMENT 'Tồn vật lý trong kho. Giữ hàng không trừ cột này; bán hàng chỉ trừ khi Owner xác nhận.',
  `online_sales_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `status` varchar(20) NOT NULL,
  PRIMARY KEY (`detail_id`),
  UNIQUE KEY `uq_product_detail_1` (`product_id`,`size`,`color`),
  KEY `ix_product_detail_1` (`online_sales_enabled`,`status`),
  CONSTRAINT `fk_product_detail_product_id` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`),
  CONSTRAINT `ck_product_detail_1` CHECK ((`price` >= 0)),
  CONSTRAINT `ck_product_detail_2` CHECK ((`stock_quantity` >= 0)),
  CONSTRAINT `ck_product_detail_3` CHECK ((`online_sales_enabled` in (0,1)))
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.product_detail: ~8 rows (approximately)
INSERT INTO `product_detail` (`detail_id`, `product_id`, `size`, `color`, `price`, `stock_quantity`, `online_sales_enabled`, `status`) VALUES
	(3, 3, 'M', 'đen', 250000, 0, 0, 'ACTIVE'),
	(4, 4, '37', 'đen', 250000, 0, 0, 'ACTIVE'),
	(5, 5, 'S', 'Trắng', 190000, 0, 0, 'ACTIVE'),
	(6, 5, 'M', 'Trắng', 220000, 0, 0, 'ACTIVE'),
	(7, 6, 'M', 'Rêu', 150000, 0, 0, 'ACTIVE'),
	(8, 6, 'L', 'Đen', 150000, 0, 0, 'ACTIVE'),
	(9, 6, 'L', 'Rêu', 150000, 0, 0, 'ACTIVE'),
	(10, 6, 'M', 'Đen', 150000, 0, 0, 'ACTIVE');

-- Dumping structure for table thors_restore.product_image
CREATE TABLE IF NOT EXISTS `product_image` (
  `image_id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `image_url` varchar(500) NOT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `uploaded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cloud_public_id` varchar(255) DEFAULT NULL COMMENT 'Định danh tài nguyên cloud để thay/xóa ảnh',
  `deleted_at` datetime DEFAULT NULL COMMENT 'Xóa mềm để bảo toàn lịch sử',
  PRIMARY KEY (`image_id`),
  KEY `ix_product_image_1` (`product_id`,`deleted_at`),
  CONSTRAINT `fk_product_image_product_id` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`),
  CONSTRAINT `ck_product_image_1` CHECK ((`is_primary` in (0,1)))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.product_image: ~3 rows (approximately)
INSERT INTO `product_image` (`image_id`, `product_id`, `image_url`, `is_primary`, `uploaded_at`, `cloud_public_id`, `deleted_at`) VALUES
	(1, 3, 'https://res.cloudinary.com/zew6my0e/image/upload/v1792713615/thors/products/yjydaf0egwhf2w6px7nf.png', 1, '2026-10-23 00:00:16', 'thors/products/yjydaf0egwhf2w6px7nf', NULL),
	(2, 4, 'https://res.cloudinary.com/zew6my0e/image/upload/v1792768959/thors/products/uwhwhkrihpurf9pltiwb.jpg', 1, '2026-10-23 15:22:40', 'thors/products/uwhwhkrihpurf9pltiwb', NULL),
	(3, 5, 'https://res.cloudinary.com/zew6my0e/image/upload/v1792769066/thors/products/azc6smndnfmlzbphbp1v.jpg', 1, '2026-10-23 15:24:27', 'thors/products/azc6smndnfmlzbphbp1v', NULL),
	(4, 6, 'https://res.cloudinary.com/zew6my0e/image/upload/v1792864967/thors/products/ff4fk6ijilwe9szmikzm.jpg', 1, '2026-10-24 18:02:48', 'thors/products/ff4fk6ijilwe9szmikzm', NULL);

-- Dumping structure for table thors_restore.product_location
CREATE TABLE IF NOT EXISTS `product_location` (
  `product_location_id` int NOT NULL AUTO_INCREMENT,
  `detail_id` int NOT NULL COMMENT 'UNIQUE (detail_id, shelf_level_id)',
  `shelf_level_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '0' COMMENT 'Gán lần đầu phải > 0; sau xuất hết có thể = 0 để giữ mô tả và ảnh',
  `description` text COMMENT 'Mô tả thực tế tại vị trí; backend kiểm tra cùng ảnh và quantity > 0',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Cập nhật khi xếp, chuyển, xuất hoặc nhập lại',
  PRIMARY KEY (`product_location_id`),
  UNIQUE KEY `uq_product_location_1` (`detail_id`,`shelf_level_id`),
  KEY `fk_product_location_shelf_level_id` (`shelf_level_id`),
  CONSTRAINT `fk_product_location_detail_id` FOREIGN KEY (`detail_id`) REFERENCES `product_detail` (`detail_id`),
  CONSTRAINT `fk_product_location_shelf_level_id` FOREIGN KEY (`shelf_level_id`) REFERENCES `shelf_level` (`shelf_level_id`),
  CONSTRAINT `ck_product_location_1` CHECK ((`quantity` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.product_location: ~0 rows (approximately)

-- Dumping structure for table thors_restore.product_location_image
CREATE TABLE IF NOT EXISTS `product_location_image` (
  `product_location_image_id` int NOT NULL AUTO_INCREMENT,
  `product_location_id` int NOT NULL,
  `image_url` varchar(500) NOT NULL,
  `cloud_public_id` varchar(255) DEFAULT NULL COMMENT 'Định danh tài nguyên cloud để thay/xóa ảnh',
  `deleted_at` datetime DEFAULT NULL COMMENT 'Xóa mềm để bảo toàn lịch sử',
  PRIMARY KEY (`product_location_image_id`),
  KEY `ix_product_location_image_1` (`product_location_id`,`deleted_at`),
  CONSTRAINT `fk_product_location_image_product_location_id` FOREIGN KEY (`product_location_id`) REFERENCES `product_location` (`product_location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.product_location_image: ~0 rows (approximately)

-- Dumping structure for table thors_restore.promotion
CREATE TABLE IF NOT EXISTS `promotion` (
  `promotion_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `discount_value` decimal(12,2) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` varchar(20) NOT NULL,
  `created_by` int NOT NULL COMMENT 'Owner tạo',
  `discount_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'PERCENT: 0–100; FIXED: số tiền VNĐ nguyên',
  `min_order_value` decimal(12,0) NOT NULL DEFAULT '0',
  `max_discount_amount` decimal(12,0) DEFAULT NULL COMMENT 'Mức giảm tối đa khi giảm theo phần trăm',
  `usage_limit` int DEFAULT NULL COMMENT 'NULL = không giới hạn; số nguyên dương = số lượt sử dụng tối đa',
  PRIMARY KEY (`promotion_id`),
  KEY `fk_promotion_created_by` (`created_by`),
  CONSTRAINT `fk_promotion_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`),
  CONSTRAINT `ck_promotion_1` CHECK ((`discount_value` >= 0)),
  CONSTRAINT `ck_promotion_2` CHECK ((`end_date` > `start_date`)),
  CONSTRAINT `ck_promotion_3` CHECK ((`discount_type` in (_utf8mb4'PERCENT',_utf8mb4'FIXED'))),
  CONSTRAINT `ck_promotion_4` CHECK ((`min_order_value` >= 0)),
  CONSTRAINT `ck_promotion_5` CHECK ((`max_discount_amount` >= 0)),
  CONSTRAINT `ck_promotion_6` CHECK (((`discount_type` <> _utf8mb4'PERCENT') or (`discount_value` <= 100))),
  CONSTRAINT `ck_promotion_7` CHECK (((`discount_type` <> _utf8mb4'FIXED') or (`discount_value` = floor(`discount_value`)))),
  CONSTRAINT `ck_promotion_usage_limit` CHECK (((`usage_limit` is null) or (`usage_limit` >= 1)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.promotion: ~0 rows (approximately)

-- Dumping structure for table thors_restore.rack
CREATE TABLE IF NOT EXISTS `rack` (
  `rack_id` int NOT NULL AUTO_INCREMENT,
  `rack_code` varchar(20) NOT NULL COMMENT 'Lưu A, B, C, D; giao diện hiển thị Kệ A. Tọa độ có thể sửa.',
  `zone` varchar(50) DEFAULT NULL COMMENT 'Khu vực',
  `coordinate_x` decimal(8,2) NOT NULL COMMENT 'Tọa độ trên bản đồ 2D',
  `coordinate_y` decimal(8,2) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Ẩn kệ rỗng thay vì xóa lịch sử',
  PRIMARY KEY (`rack_id`),
  UNIQUE KEY `uq_rack_1` (`rack_code`),
  CONSTRAINT `ck_rack_1` CHECK ((`is_active` in (0,1)))
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.rack: ~4 rows (approximately)
INSERT INTO `rack` (`rack_id`, `rack_code`, `zone`, `coordinate_x`, `coordinate_y`, `is_active`) VALUES
	(1, 'A', '', 40.00, 40.00, 1),
	(2, 'B', '', 254.00, 40.00, 1),
	(3, 'C', '', 468.00, 40.00, 1),
	(4, 'E', '', 682.00, 40.00, 1);

-- Dumping structure for table thors_restore.return_request
CREATE TABLE IF NOT EXISTS `return_request` (
  `return_request_id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `user_id` int DEFAULT NULL COMMENT 'Khách online; NULL khi khách mua tại quầy không có tài khoản',
  `reason` text NOT NULL,
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'PENDING / APPROVED / REJECTED / RECEIVED / COMPLETED',
  `requested_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processed_at` datetime DEFAULT NULL,
  `created_by` int NOT NULL COMMENT 'Khách tạo yêu cầu online hoặc người bán ghi nhận tại quầy',
  `request_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Đổi hàng tạo đơn thay thế qua orders.related_order_id',
  `processed_by` int DEFAULT NULL COMMENT 'Chỉ Owner xử lý',
  `customer_name` varchar(100) DEFAULT NULL COMMENT 'Thông tin khách vãng lai nếu cần',
  `customer_phone` varchar(15) DEFAULT NULL COMMENT 'Thông tin liên hệ khách tại quầy',
  PRIMARY KEY (`return_request_id`),
  KEY `ix_return_request_1` (`order_id`,`requested_at`),
  KEY `ix_return_request_2` (`status`,`requested_at`),
  KEY `fk_return_request_user_id` (`user_id`),
  KEY `fk_return_request_created_by` (`created_by`),
  KEY `fk_return_request_processed_by` (`processed_by`),
  CONSTRAINT `fk_return_request_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_return_request_order_id` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`),
  CONSTRAINT `fk_return_request_processed_by` FOREIGN KEY (`processed_by`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_return_request_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`),
  CONSTRAINT `ck_return_request_1` CHECK ((`status` in (_utf8mb4'PENDING',_utf8mb4'APPROVED',_utf8mb4'REJECTED',_utf8mb4'RECEIVED',_utf8mb4'COMPLETED'))),
  CONSTRAINT `ck_return_request_2` CHECK ((`request_type` in (_utf8mb4'RETURN',_utf8mb4'EXCHANGE')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.return_request: ~0 rows (approximately)

-- Dumping structure for table thors_restore.return_request_item
CREATE TABLE IF NOT EXISTS `return_request_item` (
  `return_request_item_id` int NOT NULL AUTO_INCREMENT,
  `return_request_id` int NOT NULL,
  `order_item_id` int NOT NULL,
  `quantity_returned` int NOT NULL,
  `item_reason` varchar(255) DEFAULT NULL,
  `quantity_received` int NOT NULL DEFAULT '0' COMMENT 'Số lượng Owner thực nhận; không vượt quantity_returned',
  `quantity_restocked` int NOT NULL DEFAULT '0' COMMENT 'Số hàng đạt chất lượng đã nhập lại; không vượt quantity_received',
  `refund_amount` decimal(12,0) NOT NULL DEFAULT '0' COMMENT 'Số tiền được duyệt hoàn theo giá và giảm giá thực tế',
  PRIMARY KEY (`return_request_item_id`),
  KEY `fk_return_request_item_return_request_id` (`return_request_id`),
  KEY `fk_return_request_item_order_item_id` (`order_item_id`),
  CONSTRAINT `fk_return_request_item_order_item_id` FOREIGN KEY (`order_item_id`) REFERENCES `order_item` (`order_item_id`),
  CONSTRAINT `fk_return_request_item_return_request_id` FOREIGN KEY (`return_request_id`) REFERENCES `return_request` (`return_request_id`),
  CONSTRAINT `ck_return_request_item_1` CHECK ((`quantity_returned` > 0)),
  CONSTRAINT `ck_return_request_item_2` CHECK ((`quantity_received` >= 0)),
  CONSTRAINT `ck_return_request_item_3` CHECK ((`quantity_restocked` >= 0)),
  CONSTRAINT `ck_return_request_item_4` CHECK ((`refund_amount` >= 0)),
  CONSTRAINT `ck_return_request_item_5` CHECK ((`quantity_received` <= `quantity_returned`)),
  CONSTRAINT `ck_return_request_item_6` CHECK ((`quantity_restocked` <= `quantity_received`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.return_request_item: ~0 rows (approximately)

-- Dumping structure for table thors_restore.role
CREATE TABLE IF NOT EXISTS `role` (
  `role_id` int NOT NULL AUTO_INCREMENT,
  `role_name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Giá trị cố định: ADMIN, OWNER, FAMILY_MEMBER, STAFF, CUSTOMER. Guest không có tài khoản.',
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `uq_role_1` (`role_name`),
  CONSTRAINT `ck_role_1` CHECK ((`role_name` in (_utf8mb4'ADMIN',_utf8mb4'OWNER',_utf8mb4'FAMILY_MEMBER',_utf8mb4'STAFF',_utf8mb4'CUSTOMER')))
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.role: ~5 rows (approximately)
INSERT INTO `role` (`role_id`, `role_name`) VALUES
	(1, 'ADMIN'),
	(2, 'OWNER'),
	(3, 'FAMILY_MEMBER'),
	(4, 'STAFF'),
	(5, 'CUSTOMER');

-- Dumping structure for table thors_restore.shelf_level
CREATE TABLE IF NOT EXISTS `shelf_level` (
  `shelf_level_id` int NOT NULL AUTO_INCREMENT,
  `rack_id` int NOT NULL COMMENT 'UNIQUE (rack_id, level_number)',
  `level_number` int NOT NULL COMMENT 'Cấu hình ban đầu 1–5; UNIQUE (rack_id, level_number)',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'AVAILABLE' COMMENT 'AVAILABLE / FULL / BLOCKED / MAINTENANCE',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Chỉ ngừng sử dụng khi không chứa hàng',
  PRIMARY KEY (`shelf_level_id`),
  UNIQUE KEY `uq_shelf_level_1` (`rack_id`,`level_number`),
  CONSTRAINT `fk_shelf_level_rack_id` FOREIGN KEY (`rack_id`) REFERENCES `rack` (`rack_id`),
  CONSTRAINT `ck_shelf_level_1` CHECK ((`level_number` > 0)),
  CONSTRAINT `ck_shelf_level_2` CHECK ((`status` in (_utf8mb4'AVAILABLE',_utf8mb4'FULL',_utf8mb4'BLOCKED',_utf8mb4'MAINTENANCE'))),
  CONSTRAINT `ck_shelf_level_3` CHECK ((`is_active` in (0,1)))
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.shelf_level: ~20 rows (approximately)
INSERT INTO `shelf_level` (`shelf_level_id`, `rack_id`, `level_number`, `status`, `is_active`) VALUES
	(1, 4, 1, 'AVAILABLE', 1),
	(2, 3, 1, 'AVAILABLE', 1),
	(3, 2, 1, 'AVAILABLE', 1),
	(4, 1, 1, 'AVAILABLE', 1),
	(5, 4, 2, 'AVAILABLE', 1),
	(6, 3, 2, 'AVAILABLE', 1),
	(7, 2, 2, 'AVAILABLE', 1),
	(8, 1, 2, 'AVAILABLE', 1),
	(9, 4, 3, 'AVAILABLE', 1),
	(10, 3, 3, 'AVAILABLE', 1),
	(11, 2, 3, 'AVAILABLE', 1),
	(12, 1, 3, 'AVAILABLE', 1),
	(13, 4, 4, 'AVAILABLE', 1),
	(14, 3, 4, 'AVAILABLE', 1),
	(15, 2, 4, 'AVAILABLE', 1),
	(16, 1, 4, 'AVAILABLE', 1),
	(17, 4, 5, 'AVAILABLE', 1),
	(18, 3, 5, 'AVAILABLE', 1),
	(19, 2, 5, 'AVAILABLE', 1),
	(20, 1, 5, 'AVAILABLE', 1);

-- Dumping structure for table thors_restore.shift_change_request
CREATE TABLE IF NOT EXISTS `shift_change_request` (
  `request_id` int NOT NULL AUTO_INCREMENT,
  `requested_by` int NOT NULL COMMENT 'Nhân viên xin đổi ca',
  `shift_id` int NOT NULL COMMENT 'Ca của người xin đổi',
  `target_user_id` int NOT NULL COMMENT 'Nhân viên đổi ca cùng',
  `target_shift_id` int DEFAULT NULL COMMENT 'Ca của người kia; NULL nếu người kia chỉ nhận thay, không đổi lại ca nào',
  `reason` text,
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'Pending' COMMENT 'Pending / Approved / Rejected',
  `requested_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` datetime DEFAULT NULL COMMENT 'NULL = chưa duyệt',
  PRIMARY KEY (`request_id`),
  KEY `ix_shift_change_request_1` (`status`,`requested_at`),
  KEY `fk_shift_change_request_requested_by` (`requested_by`),
  KEY `fk_shift_change_request_shift_id` (`shift_id`),
  KEY `fk_shift_change_request_target_user_id` (`target_user_id`),
  KEY `fk_shift_change_request_target_shift_id` (`target_shift_id`),
  CONSTRAINT `fk_shift_change_request_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_shift_change_request_shift_id` FOREIGN KEY (`shift_id`) REFERENCES `work_shift` (`shift_id`),
  CONSTRAINT `fk_shift_change_request_target_shift_id` FOREIGN KEY (`target_shift_id`) REFERENCES `work_shift` (`shift_id`),
  CONSTRAINT `fk_shift_change_request_target_user_id` FOREIGN KEY (`target_user_id`) REFERENCES `user` (`user_id`),
  CONSTRAINT `ck_shift_change_request_1` CHECK ((`target_user_id` <> `requested_by`)),
  CONSTRAINT `ck_shift_change_request_2` CHECK ((`status` in (_utf8mb4'Pending',_utf8mb4'Approved',_utf8mb4'Rejected')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.shift_change_request: ~0 rows (approximately)

-- Dumping structure for table thors_restore.stock_adjustment
CREATE TABLE IF NOT EXISTS `stock_adjustment` (
  `adjustment_id` int NOT NULL AUTO_INCREMENT,
  `detail_id` int NOT NULL,
  `quantity_change` int NOT NULL COMMENT 'Tác động tổng tồn; MOVE = 0, nhập/hoàn dương, xuất âm',
  `reason` varchar(255) NOT NULL,
  `adjusted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `adjusted_by` int NOT NULL COMMENT 'Owner thực hiện; giữ người thao tác để truy vết',
  `movement_type` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'ADJUSTMENT' COMMENT 'ADJUSTMENT / RECEIPT / ORDER_OUT / MOVE / RESTOCK',
  `movement_quantity` int DEFAULT NULL COMMENT 'Số hàng thao tác; bắt buộc cho MOVE, dòng cũ dùng ABS(quantity_change)',
  `source_location_id` int DEFAULT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ',
  `destination_location_id` int DEFAULT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ',
  `order_item_id` int DEFAULT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ',
  `receipt_item_id` int DEFAULT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ',
  `return_request_item_id` int DEFAULT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ',
  `original_out_adjustment_id` int DEFAULT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ',
  `idempotency_key` varchar(100) DEFAULT NULL COMMENT 'Khóa mỗi dòng kho; bắt buộc ở backend cho thao tác mới',
  PRIMARY KEY (`adjustment_id`),
  UNIQUE KEY `uq_stock_adjustment_1` (`idempotency_key`),
  KEY `ix_stock_adjustment_1` (`detail_id`,`adjusted_at`),
  KEY `ix_stock_adjustment_2` (`order_item_id`,`adjusted_at`),
  KEY `ix_stock_adjustment_3` (`original_out_adjustment_id`),
  KEY `fk_stock_adjustment_adjusted_by` (`adjusted_by`),
  KEY `fk_stock_adjustment_source_location_id` (`source_location_id`),
  KEY `fk_stock_adjustment_destination_location_id` (`destination_location_id`),
  KEY `fk_stock_adjustment_receipt_item_id` (`receipt_item_id`),
  KEY `fk_stock_adjustment_return_request_item_id` (`return_request_item_id`),
  CONSTRAINT `fk_stock_adjustment_adjusted_by` FOREIGN KEY (`adjusted_by`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_stock_adjustment_destination_location_id` FOREIGN KEY (`destination_location_id`) REFERENCES `product_location` (`product_location_id`),
  CONSTRAINT `fk_stock_adjustment_detail_id` FOREIGN KEY (`detail_id`) REFERENCES `product_detail` (`detail_id`),
  CONSTRAINT `fk_stock_adjustment_order_item_id` FOREIGN KEY (`order_item_id`) REFERENCES `order_item` (`order_item_id`),
  CONSTRAINT `fk_stock_adjustment_original_out_adjustment_id` FOREIGN KEY (`original_out_adjustment_id`) REFERENCES `stock_adjustment` (`adjustment_id`),
  CONSTRAINT `fk_stock_adjustment_receipt_item_id` FOREIGN KEY (`receipt_item_id`) REFERENCES `stock_receipt_item` (`receipt_item_id`),
  CONSTRAINT `fk_stock_adjustment_return_request_item_id` FOREIGN KEY (`return_request_item_id`) REFERENCES `return_request_item` (`return_request_item_id`),
  CONSTRAINT `fk_stock_adjustment_source_location_id` FOREIGN KEY (`source_location_id`) REFERENCES `product_location` (`product_location_id`),
  CONSTRAINT `ck_stock_adjustment_1` CHECK ((`movement_type` in (_utf8mb4'ADJUSTMENT',_utf8mb4'RECEIPT',_utf8mb4'ORDER_OUT',_utf8mb4'MOVE',_utf8mb4'RESTOCK'))),
  CONSTRAINT `ck_stock_adjustment_2` CHECK ((`movement_quantity` > 0)),
  CONSTRAINT `ck_stock_adjustment_3` CHECK ((((`movement_type` = _utf8mb4'MOVE') and (`quantity_change` = 0) and (`movement_quantity` is not null)) or ((`movement_type` <> _utf8mb4'MOVE') and (`quantity_change` <> 0)))),
  CONSTRAINT `ck_stock_adjustment_4` CHECK (((`movement_type` not in (_utf8mb4'RECEIPT',_utf8mb4'RESTOCK')) or (`quantity_change` > 0))),
  CONSTRAINT `ck_stock_adjustment_5` CHECK (((`movement_type` <> _utf8mb4'ORDER_OUT') or (`quantity_change` < 0))),
  CONSTRAINT `ck_stock_adjustment_6` CHECK (((`movement_type` = _utf8mb4'MOVE') or (`movement_quantity` is null) or (`movement_quantity` = abs(`quantity_change`))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.stock_adjustment: ~0 rows (approximately)

-- Dumping structure for table thors_restore.stock_receipt
CREATE TABLE IF NOT EXISTS `stock_receipt` (
  `receipt_id` int NOT NULL AUTO_INCREMENT,
  `receipt_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'PURCHASE_ORDER: phiếu đặt; RECEIPT: phiếu nhập',
  `source_receipt_id` int DEFAULT NULL COMMENT 'Phiếu nhập liên kết receipt_id của phiếu đặt gốc; phiếu đặt để NULL',
  `manufacturer_name` varchar(200) DEFAULT NULL COMMENT 'Tên bên sản xuất ghi trên phiếu đặt',
  `created_by` int NOT NULL COMMENT 'Phiếu đặt: OWNER tạo; phiếu nhập: OWNER hoặc FAMILY_MEMBER tạo',
  `receipt_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `note` varchar(255) DEFAULT NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT / PENDING_CONFIRMATION / CONFIRMED / REJECTED / CANCELLED / CLOSED',
  `confirmed_by` int DEFAULT NULL COMMENT 'Người xác nhận phiếu; chỉ OWNER được thực hiện',
  `confirmed_at` datetime DEFAULT NULL COMMENT 'Thời điểm xác nhận; chỉ phiếu nhập RECEIPT mới cộng tồn',
  `rejection_reason` varchar(255) DEFAULT NULL COMMENT 'Owner ghi lý do từ chối',
  `closed_at` datetime DEFAULT NULL COMMENT 'Thời điểm Owner đóng phiếu đặt, kết thúc nhận hàng',
  `close_reason` varchar(255) DEFAULT NULL COMMENT 'Lý do đóng phiếu đặt: nhận đủ hoặc ngừng nhận phần còn thiếu',
  PRIMARY KEY (`receipt_id`),
  KEY `ix_stock_receipt_1` (`status`,`receipt_date`),
  KEY `fk_stock_receipt_created_by` (`created_by`),
  KEY `fk_stock_receipt_confirmed_by` (`confirmed_by`),
  KEY `ix_receipt_source` (`source_receipt_id`),
  CONSTRAINT `fk_receipt_source` FOREIGN KEY (`source_receipt_id`) REFERENCES `stock_receipt` (`receipt_id`),
  CONSTRAINT `fk_stock_receipt_confirmed_by` FOREIGN KEY (`confirmed_by`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_stock_receipt_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`),
  CONSTRAINT `ck_receipt_type` CHECK ((`receipt_type` in (_utf8mb4'PURCHASE_ORDER',_utf8mb4'RECEIPT'))),
  CONSTRAINT `ck_stock_receipt_1` CHECK ((`status` in (_utf8mb4'DRAFT',_utf8mb4'PENDING_CONFIRMATION',_utf8mb4'CONFIRMED',_utf8mb4'REJECTED',_utf8mb4'CANCELLED',_utf8mb4'CLOSED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.stock_receipt: ~0 rows (approximately)

-- Dumping structure for table thors_restore.stock_receipt_item
CREATE TABLE IF NOT EXISTS `stock_receipt_item` (
  `receipt_item_id` int NOT NULL AUTO_INCREMENT,
  `receipt_id` int NOT NULL,
  `detail_id` int NOT NULL,
  `source_receipt_item_id` int DEFAULT NULL COMMENT 'Liên kết receipt_item_id của dòng đặt gốc; dòng đặt để NULL',
  `quantity` int NOT NULL COMMENT 'Phiếu đặt: số lượng đặt; phiếu nhập: số lượng thực nhận của từng biến thể',
  `unit_price` decimal(12,0) NOT NULL COMMENT 'Đơn giá đặt hoặc thực nhập bằng VNĐ',
  PRIMARY KEY (`receipt_item_id`),
  KEY `fk_stock_receipt_item_receipt_id` (`receipt_id`),
  KEY `fk_stock_receipt_item_detail_id` (`detail_id`),
  KEY `ix_receipt_item_source` (`source_receipt_item_id`),
  CONSTRAINT `fk_receipt_item_source` FOREIGN KEY (`source_receipt_item_id`) REFERENCES `stock_receipt_item` (`receipt_item_id`),
  CONSTRAINT `fk_stock_receipt_item_detail_id` FOREIGN KEY (`detail_id`) REFERENCES `product_detail` (`detail_id`),
  CONSTRAINT `fk_stock_receipt_item_receipt_id` FOREIGN KEY (`receipt_id`) REFERENCES `stock_receipt` (`receipt_id`),
  CONSTRAINT `ck_receipt_item_price` CHECK ((`unit_price` >= 0)),
  CONSTRAINT `ck_stock_receipt_item_1` CHECK ((`quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.stock_receipt_item: ~0 rows (approximately)

-- Dumping structure for table thors_restore.user
CREATE TABLE IF NOT EXISTS `user` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `role_id` int NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `password_hash` varchar(255) NOT NULL COMMENT 'Lưu hash, không lưu mật khẩu thô',
  `email` varchar(100) NOT NULL COMMENT 'Index (đăng nhập)',
  `phone` varchar(15) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `account_status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'ACTIVE' COMMENT 'PENDING_VERIFICATION / ACTIVE / LOCKED / DISABLED',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `avatar_url` varchar(500) DEFAULT NULL COMMENT 'Ảnh hồ sơ trên dịch vụ lưu ảnh',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Cập nhật khi sửa hồ sơ',
  `email_verified_at` datetime DEFAULT NULL COMMENT 'Thời điểm email được xác minh thành công',
  `verification_code_hash` varchar(255) DEFAULT NULL COMMENT 'Lưu mã HMAC-SHA256 của OTP, không lưu OTP gốc',
  `verification_expires_at` datetime DEFAULT NULL COMMENT 'Thời điểm OTP hết hạn, mặc định sau 5 phút',
  `verification_attempt_count` int NOT NULL DEFAULT '0' COMMENT 'Số lần nhập OTP sai, tối đa 5 lần',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_user_2` (`email`),
  KEY `fk_user_role_id` (`role_id`),
  CONSTRAINT `fk_user_role_id` FOREIGN KEY (`role_id`) REFERENCES `role` (`role_id`),
  CONSTRAINT `ck_user_1` CHECK ((`account_status` in (_utf8mb4'PENDING_VERIFICATION',_utf8mb4'ACTIVE',_utf8mb4'LOCKED',_utf8mb4'DISABLED')))
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.user: ~10 rows (approximately)
INSERT INTO `user` (`user_id`, `role_id`, `full_name`, `password_hash`, `email`, `phone`, `address`, `account_status`, `created_at`, `avatar_url`, `updated_at`, `email_verified_at`, `verification_code_hash`, `verification_expires_at`, `verification_attempt_count`) VALUES
	(1, 1, 'Minh Trần', '$2a$12$G3JzNlCTWlHvj58eGF4OdOPSAfhNqAf9HfHOd3idPy1Qqfd5yxaNi', 'he187170tranminhlam@gmail.com', NULL, NULL, 'ACTIVE', '2026-10-12 18:53:16', NULL, '2026-10-19 15:16:17', '2026-10-17 07:09:53', NULL, NULL, 0),
	(2, 2, 'Minh Trần Trần', '!GOOGLE_ONLY', 'nguyenhaiphong518@gmail.com', NULL, NULL, 'ACTIVE', '2026-10-13 06:52:48', NULL, '2026-10-19 15:16:10', NULL, '3495e7a8-76e9-4370-aee9-27e9bb12c8cb:bd563a1b4aaffb497e57df1b59c4fd46d61e9d989b06dd65dd32b727f4a36aab', '2026-10-17 07:16:09', 0),
	(3, 1, 'Admin TH', '$2a$12$DTCwzCI16SET6ZJfxbJDbeJk12WebnemFNAbJqkwT11ksjOdxqOEC', 'admin@thors.shop', '+84900000001', NULL, 'ACTIVE', '2026-10-16 10:42:06', NULL, '2026-10-27 11:44:49', NULL, NULL, NULL, 0),
	(4, 2, 'Maya Chen', '$2a$12$3NS49E0vzEj4fIObYfDfFuWukcElLl14HXkEWh0GvB9AAd0YtYIB6', 'owner@thors.shop', '+84900000002', NULL, 'ACTIVE', '2026-10-16 10:42:06', NULL, '2026-10-19 09:34:19', NULL, NULL, NULL, 0),
	(5, 5, 'Noah Williams', '$2a$12$0hFjlW7C5H62iZ2HWrH9deAxJP/zSAdlj79j/aUNMeIhvai4ZawCy', 'customer@thors.shop', '+84900000003', NULL, 'ACTIVE', '2026-10-16 10:52:25', NULL, '2026-10-27 20:29:59', NULL, NULL, NULL, 0),
	(6, 4, 'test1', '$2a$12$0icK3p47iKwfdrqU2CzRPuybzonsTfTfBl5HSrLqYwtYDf5A/R9h6', 'abcxyz@gmail.com', '+84987654321', NULL, 'ACTIVE', '2026-10-16 10:55:16', NULL, '2026-10-22 08:21:20', NULL, NULL, NULL, 0),
	(7, 3, 'family1', '$2a$12$YvH.F46bvVnQfMocVpCKWuoUaGtQs4ZnrDYtAqy1wr8WgRvVihg56', 'family1@gmail.com', '+84879654322', NULL, 'ACTIVE', '2026-10-16 10:56:11', NULL, '2026-10-16 10:57:32', NULL, NULL, NULL, 0),
	(8, 3, 'test342', '$2a$12$Ywqxjwv/r05gOodazfYafO2YsGvxZ4RXbvuMfK/aOqcJqBxfxx0zK', 'test123@gmail.com', '+84123456789', NULL, 'PENDING_VERIFICATION', '2026-10-23 10:34:24', NULL, '2026-10-23 10:34:24', NULL, NULL, NULL, 0),
	(9, 5, 'Huan', '$2a$12$.oSwYYuDtSj30GKXAFVEsOIkvW1BQ1X0Fro5asjxhcvtNGvR/fm3i', 'huanhyhy1@gmail.com', NULL, NULL, 'ACTIVE', '2026-10-27 09:51:28', NULL, '2026-10-27 09:53:37', '2026-10-27 09:53:37', NULL, NULL, 0),
	(10, 5, 'Lam Trần', '!GOOGLE_ONLY', 'minhtran488930@gmail.com', NULL, NULL, 'ACTIVE', '2026-10-27 09:56:26', NULL, '2026-10-27 09:56:26', '2026-10-27 09:56:26', NULL, NULL, 0);

-- Dumping structure for table thors_restore.user_notification
CREATE TABLE IF NOT EXISTS `user_notification` (
  `user_notification_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `notification_id` int NOT NULL COMMENT 'UNIQUE (user_id, notification_id)',
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `read_at` datetime DEFAULT NULL,
  PRIMARY KEY (`user_notification_id`),
  UNIQUE KEY `uq_user_notification_1` (`user_id`,`notification_id`),
  KEY `ix_user_notification_1` (`user_id`,`is_read`),
  KEY `fk_user_notification_notification_id` (`notification_id`),
  CONSTRAINT `fk_user_notification_notification_id` FOREIGN KEY (`notification_id`) REFERENCES `notification` (`notification_id`),
  CONSTRAINT `fk_user_notification_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`),
  CONSTRAINT `ck_user_notification_1` CHECK ((`is_read` in (0,1)))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.user_notification: ~2 rows (approximately)
INSERT INTO `user_notification` (`user_notification_id`, `user_id`, `notification_id`, `is_read`, `read_at`) VALUES
	(1, 5, 1, 1, '2026-10-27 20:28:06'),
	(2, 5, 2, 1, '2026-10-28 01:20:28');

-- Dumping structure for table thors_restore.work_shift
CREATE TABLE IF NOT EXISTS `work_shift` (
  `shift_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT 'Nhân viên được xếp ca; UNIQUE (user_id, shift_date, start_time)',
  `shift_date` date NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `status` varchar(20) NOT NULL,
  PRIMARY KEY (`shift_id`),
  UNIQUE KEY `uq_work_shift_1` (`user_id`,`shift_date`,`start_time`),
  KEY `ix_work_shift_1` (`shift_date`,`status`),
  CONSTRAINT `fk_work_shift_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table thors_restore.work_shift: ~0 rows (approximately)

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
