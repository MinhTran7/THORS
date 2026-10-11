-- THORS: KHỞI TẠO MYSQL 8.4 / HEIDISQL — CHỈ DÙNG BẢNG GỐC
-- Phiên bản: 2026-10-11. UTF-8; InnoDB; UTC; tiền VNĐ lưu DECIMAL.
-- 29 bảng = 31 bảng gốc trừ verification_code và image_search_result.
-- Không thêm bảng, không view. Khởi tạo 5 role, 4 kệ A-D, 20 tầng.
-- Chỉ chạy trên database thors chưa có bảng. Database đang có dùng file migration.
-- Không DROP/TRUNCATE, không tắt FK, không tạo tài khoản hoặc mật khẩu mẫu.
-- Nếu bảng đã tồn tại thì dừng, không xóa database để chạy lại.
-- DDL tự commit; đây là script khởi tạo, không phải migration.
--
-- BỔ SUNG TRƯỜNG TRONG BẢNG HIỆN CÓ:
-- user: các trường verification_* thay bảng OTP; một mã đang hoạt động mỗi tài khoản.
-- orders: stock_hold_* cho giữ hàng; các trường giao vận cho một lô giao mỗi đơn.
-- order_item: reserved_quantity; giữ hàng đóng phải đưa lượng giữ về 0.
-- payment: refunded_amount và refund_history JSON (mảng các lần hoàn tiền).
-- stock_adjustment: các trường movement_* và nguồn/đích để ghi biến động kho.
-- audit_log: lịch sử trạng thái/thao tác, dùng old_value/new_value cho snapshot.
-- Không tạo bảng giữ hàng, vận chuyển, hoàn tiền, sổ kho hay lịch sử đơn riêng.
--
-- QUY TẮC BACKEND PHẢI THỰC HIỆN (TẠO BẢNG CHƯA TỰ CHẠY CÁC LUỒNG):
-- 1. Ưu tiên: online ĐÃ TRẢ TIỀN > bán tại quầy > COD chưa xác nhận.
--    Online trả ngay khi đặt hàng; COD trả khi nhận. Chỉ Owner xác nhận xuất bán.
-- 2. Khóa các product_detail theo detail_id tăng dần, khóa đơn/dòng đơn/vị trí
--    theo thứ tự nhất quán. Sau khóa đọc lại tồn và giữ; không chỉ đọc số tồn.
--    Trước khi gọi cổng: orders.stock_hold_status = TEMPORARY, gắn attempt payment,
--    đặt hạn giữ phù hợp cổng, order_item.reserved_quantity = lượng cần giữ.
--    Một đơn có một trạng thái giữ hiện hành; không mở hai attempt đồng thời.
--    Callback đúng chữ ký/đơn/attempt/số tiền: payment SUCCESS, order PAID,
--    stock_hold_status PAID, stock_hold_paid_at có giá trị, hạn giữ NULL cùng transaction.
--    Mọi lần thử thanh toán vẫn lưu trong payment; các lần đổi giữ ghi audit_log.
--    Giữ hàng không trừ stock_quantity hoặc quantity tại vị trí; COD chưa xác nhận
--    không giữ cứng. Tồn có thể bán = stock_quantity - tổng reserved_quantity của
--    dòng đơn có stock_hold_status TEMPORARY/PAID. Backend tính bằng truy vấn trực tiếp.
--    Đóng giữ hoặc đổi attempt chỉ sau đối soát cổng; không thả giữ PAID theo thời gian.
--    Không hồi sinh giữ đã đóng chỉ vì callback đến muộn; xử lý theo chính sách cổng.
-- 3. Owner xác nhận trong một transaction: kiểm tra tồn đủ sau khi bảo vệ giữ của
--    các đơn khác, trừ tổng tồn và vị trí/phần chưa gán, ghi stock_adjustment + audit,
--    đặt confirmed_at/stock_deducted_at, tiêu thụ giữ và reserved_quantity về 0.
--    Lặp xác nhận không trừ lần hai. Dùng idempotency_key mỗi dòng kho mới.
--    Ví dụ: tồn 10, giữ PAID 3 -> còn bán 7; xác nhận -> tồn 7, giữ 0, còn bán 7.
-- 4. Hủy trước xuất: giải phóng giữ, tồn vật lý không đổi. Hủy sau xuất không tự
--    cộng tồn: Owner nhận/đặt hàng lại rồi RESTOCK, tham chiếu original_out_adjustment_id.
--    Tổng nhập lại qua các dòng không vượt số đã xuất. Hoàn tiền tách hoàn kho.
-- 5. refund_history giữ các lần hoàn trong payment, mỗi phần tử có idempotency_key,
--    status, amount, transaction_ref, reason, người/mốc thao tác và yêu cầu trả hàng.
--    Khóa dòng payment, kiểm tra key trong lịch sử trước khi gọi/nhận callback cổng;
--    chỉ lần SUCCESS mới tăng refunded_amount; tổng hoàn không vượt amount đã thu.
--    JSON không có FK/UNIQUE cho phần tử: backend kiểm tra liên kết, key và chuyển trạng thái.
-- 6. stock_adjustment dùng cho RECEIPT/ORDER_OUT/MOVE/RESTOCK/ADJUSTMENT:
--    quantity_change dương khi nhập/hoàn, âm khi xuất, 0 khi MOVE.
--    MOVE cần movement_quantity > 0; giảm nguồn/tăng đích cùng transaction, tổng không đổi.
--    Backend kiểm tra nguồn/đích/chứng từ khớp detail_id; RESTOCK tham chiếu dòng xuất gốc.
-- 7. Staff/Owner tạo phiếu nhập, chỉ Owner xác nhận; xác nhận tăng tồn đúng một lần.
--    Hàng chưa vào kho không tính tồn. Hàng đã nhập chưa gán tầng thuộc stock_quantity;
--    chưa gán = tồn vật lý - tổng quantity trên các tầng; Owner quyết định chỗ đặt.
-- 8. Gán đầu: lượng > 0, mô tả, ít nhất một ảnh vị trí thực tế. Sửa sau không bắt
--    nhập lại nếu đã có. Không xóa hết ảnh/mô tả khi còn hàng. Không xóa/ngừng tầng/kệ
--    còn hàng. FULL vẫn xem được, màu đỏ; FULL/BLOCKED/MAINTENANCE không nhận thêm.
-- 9. ADMIN quản lý tài khoản và chỉ tạo OWNER; không chỉnh quyền động.
--    Online chỉ Owner xử lý; khách xem đơn mình. Vị trí kho chỉ Owner/Family/Staff.
--    Guest/Customer/Owner/Family/Staff tìm ảnh; chặn Admin. AI trả trực tiếp 0-10
--    sản phẩm khác nhau và score; không lưu danh sách kết quả trong MySQL.
-- 10. Đổi ca giữ Pending/Approved/Rejected; kiểm tra sở hữu khi tạo yêu cầu.
--     Owner duyệt, hoán đổi cùng transaction; xử lý UNIQUE khi đổi chỗ ca.
-- 11. OTP gửi mới vô hiệu mã trước, reset bộ đếm; backend kiểm tra purpose, hạn,
--     số lần sai, dùng một lần và giới hạn gửi lại. Không lưu OTP gốc hoặc secret.
-- 12. CHECK/FK không thay phân quyền, máy trạng thái, tổng nhiều dòng, ảnh bắt buộc
--     hoặc transaction backend. Không tự trừ tồn khi payment SUCCESS/sửa trạng thái đơn.
--     Lịch sử trạng thái và thao tác ghi audit_log trong cùng transaction nghiệp vụ.
--     Hóa đơn chỉ phát hành khi Owner xác nhận và đã thanh toán/không phải thu tiền.
--
SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;
SET SESSION time_zone = '+00:00';
CREATE DATABASE IF NOT EXISTS `thors`
 CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `thors`;


-- 01/29: role
CREATE TABLE `role` (
  `role_id` INT NOT NULL AUTO_INCREMENT,
  `role_name` VARCHAR(50) COLLATE utf8mb4_bin NOT NULL COMMENT 'Giá trị cố định: ADMIN, OWNER, FAMILY_MEMBER, STAFF, CUSTOMER. Guest không có tài khoản.',
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `uq_role_1` (`role_name`),
  CONSTRAINT `ck_role_1` CHECK (role_name IN ('ADMIN', 'OWNER', 'FAMILY_MEMBER', 'STAFF', 'CUSTOMER'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 02/29: notification
CREATE TABLE `notification` (
  `notification_id` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(200) NOT NULL,
  `message` TEXT NOT NULL,
  `type` VARCHAR(30) NOT NULL,
  `related_entity_type` VARCHAR(50) NULL,
  `related_entity_id` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `ix_notification_1` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 03/29: category
CREATE TABLE `category` (
  `category_id` INT NOT NULL AUTO_INCREMENT,
  `category_name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NULL,
  `status` VARCHAR(20) NOT NULL,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `uq_category_1` (`category_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 04/29: rack
CREATE TABLE `rack` (
  `rack_id` INT NOT NULL AUTO_INCREMENT,
  `rack_code` VARCHAR(20) NOT NULL COMMENT 'Lưu A, B, C, D; giao diện hiển thị Kệ A. Tọa độ có thể sửa.',
  `zone` VARCHAR(50) NULL COMMENT 'Khu vực',
  `coordinate_x` DECIMAL(8,2) NOT NULL COMMENT 'Tọa độ trên bản đồ 2D',
  `coordinate_y` DECIMAL(8,2) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Ẩn kệ rỗng thay vì xóa lịch sử',
  PRIMARY KEY (`rack_id`),
  UNIQUE KEY `uq_rack_1` (`rack_code`),
  CONSTRAINT `ck_rack_1` CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 05/29: user
CREATE TABLE `user` (
  `user_id` INT NOT NULL AUTO_INCREMENT,
  `role_id` INT NOT NULL,
  `full_name` VARCHAR(100) NOT NULL,
  `username` VARCHAR(50) NOT NULL COMMENT 'Index (đăng nhập)',
  `password_hash` VARCHAR(255) NOT NULL COMMENT 'Lưu hash, không lưu mật khẩu thô',
  `email` VARCHAR(100) NOT NULL COMMENT 'Index (đăng nhập)',
  `phone` VARCHAR(15) NULL,
  `address` VARCHAR(255) NULL,
  `account_status` VARCHAR(20) COLLATE utf8mb4_bin NOT NULL DEFAULT 'ACTIVE' COMMENT 'PENDING_VERIFICATION / ACTIVE / LOCKED / DISABLED',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `email_verified_at` DATETIME NULL COMMENT 'Thời điểm xác minh email',
  `phone_verified_at` DATETIME NULL COMMENT 'Thời điểm xác minh điện thoại nếu dùng OTP SMS',
  `avatar_url` VARCHAR(500) NULL COMMENT 'Ảnh hồ sơ trên dịch vụ lưu ảnh',
  `avatar_public_id` VARCHAR(255) NULL COMMENT 'Định danh để thay hoặc xóa ảnh',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Cập nhật khi sửa hồ sơ',
  `verification_code_hash` VARCHAR(255) NULL COMMENT 'Hash/HMAC OTP đang hoạt động; không lưu mã gốc',
  `verification_purpose` VARCHAR(30) NULL COMMENT 'Mục đích của OTP hiện hành; mỗi tài khoản một OTP hoạt động',
  `verification_expires_at` DATETIME NULL COMMENT 'Hạn OTP; gửi mới vô hiệu mã trước',
  `verification_sent_at` DATETIME NULL COMMENT 'Thời điểm gửi; backend giới hạn gửi lại',
  `verification_used_at` DATETIME NULL COMMENT 'Mã đã dùng không được sử dụng lại',
  `verification_attempt_count` INT NOT NULL DEFAULT 0 COMMENT 'Số lần sai OTP hiện hành; đạt 5 thì vô hiệu',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_user_1` (`username`),
  UNIQUE KEY `uq_user_2` (`email`),
  CONSTRAINT `ck_user_1` CHECK (account_status IN ('PENDING_VERIFICATION', 'ACTIVE', 'LOCKED', 'DISABLED')),
  CONSTRAINT `ck_user_2` CHECK (verification_attempt_count BETWEEN 0 AND 5),
  CONSTRAINT `fk_user_role_id` FOREIGN KEY (`role_id`) REFERENCES `role` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 06/29: product
CREATE TABLE `product` (
  `product_id` INT NOT NULL AUTO_INCREMENT,
  `category_id` INT NOT NULL,
  `product_name` VARCHAR(200) NOT NULL COMMENT 'Index (tìm theo tên)',
  `description` TEXT NULL,
  `status` VARCHAR(20) NOT NULL,
  PRIMARY KEY (`product_id`),
  KEY `ix_product_1` (`product_name`),
  CONSTRAINT `fk_product_category_id` FOREIGN KEY (`category_id`) REFERENCES `category` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 07/29: shelf_level
CREATE TABLE `shelf_level` (
  `shelf_level_id` INT NOT NULL AUTO_INCREMENT,
  `rack_id` INT NOT NULL COMMENT 'UNIQUE (rack_id, level_number)',
  `level_number` INT NOT NULL COMMENT 'Cấu hình ban đầu 1–5; UNIQUE (rack_id, level_number)',
  `status` VARCHAR(20) COLLATE utf8mb4_bin NOT NULL DEFAULT 'AVAILABLE' COMMENT 'AVAILABLE / FULL / BLOCKED / MAINTENANCE',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Chỉ ngừng sử dụng khi không chứa hàng',
  PRIMARY KEY (`shelf_level_id`),
  UNIQUE KEY `uq_shelf_level_1` (`rack_id`, `level_number`),
  CONSTRAINT `ck_shelf_level_1` CHECK (level_number > 0),
  CONSTRAINT `ck_shelf_level_2` CHECK (status IN ('AVAILABLE', 'FULL', 'BLOCKED', 'MAINTENANCE')),
  CONSTRAINT `ck_shelf_level_3` CHECK (is_active IN (0, 1)),
  CONSTRAINT `fk_shelf_level_rack_id` FOREIGN KEY (`rack_id`) REFERENCES `rack` (`rack_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 08/29: audit_log
CREATE TABLE `audit_log` (
  `log_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT 'Bảng log lớn nhanh nên dùng BIGINT',
  `user_id` INT NULL COMMENT 'NULL khi tác nhân là job hoặc callback hệ thống',
  `action_type` VARCHAR(50) NOT NULL,
  `entity_affected` VARCHAR(100) NOT NULL,
  `old_value` TEXT NULL,
  `new_value` TEXT NULL,
  `performed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `entity_id` BIGINT NULL COMMENT 'ID bản ghi bị tác động',
  `actor_type` VARCHAR(20) COLLATE utf8mb4_bin NOT NULL COMMENT 'USER / SYSTEM',
  PRIMARY KEY (`log_id`),
  KEY `ix_audit_log_1` (`entity_affected`, `entity_id`, `performed_at`),
  KEY `ix_audit_log_2` (`user_id`, `performed_at`),
  CONSTRAINT `ck_audit_log_1` CHECK (actor_type IN ('USER', 'SYSTEM')),
  CONSTRAINT `fk_audit_log_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 09/29: work_shift
CREATE TABLE `work_shift` (
  `shift_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL COMMENT 'Nhân viên được xếp ca; UNIQUE (user_id, shift_date, start_time)',
  `shift_date` DATE NOT NULL,
  `start_time` TIME NOT NULL,
  `end_time` TIME NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  PRIMARY KEY (`shift_id`),
  UNIQUE KEY `uq_work_shift_1` (`user_id`, `shift_date`, `start_time`),
  KEY `ix_work_shift_1` (`shift_date`, `status`),
  CONSTRAINT `fk_work_shift_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 10/29: image_search
CREATE TABLE `image_search` (
  `search_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NULL COMMENT 'NULL cho Guest; Admin bị chặn ở backend',
  `image_url` VARCHAR(500) NOT NULL,
  `selected_product_id` INT NULL COMMENT 'NULL nếu người dùng không chọn sản phẩm nào',
  `searched_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `image_public_id` VARCHAR(255) NULL COMMENT 'Định danh ảnh truy vấn nếu lưu trên cloud',
  `model_version` VARCHAR(100) NOT NULL COMMENT 'Phiên bản mô hình và cách tính score',
  PRIMARY KEY (`search_id`),
  KEY `ix_image_search_1` (`user_id`, `searched_at`),
  CONSTRAINT `fk_image_search_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_image_search_selected_product_id` FOREIGN KEY (`selected_product_id`) REFERENCES `product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 11/29: product_image
CREATE TABLE `product_image` (
  `image_id` INT NOT NULL AUTO_INCREMENT,
  `product_id` INT NOT NULL,
  `image_url` VARCHAR(500) NOT NULL,
  `is_primary` BOOLEAN NOT NULL DEFAULT FALSE,
  `uploaded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cloud_public_id` VARCHAR(255) NULL COMMENT 'Định danh tài nguyên cloud để thay/xóa ảnh',
  `deleted_at` DATETIME NULL COMMENT 'Xóa mềm để bảo toàn lịch sử',
  PRIMARY KEY (`image_id`),
  KEY `ix_product_image_1` (`product_id`, `deleted_at`),
  CONSTRAINT `ck_product_image_1` CHECK (is_primary IN (0, 1)),
  CONSTRAINT `fk_product_image_product_id` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 12/29: product_detail
CREATE TABLE `product_detail` (
  `detail_id` INT NOT NULL AUTO_INCREMENT,
  `product_id` INT NOT NULL COMMENT 'UNIQUE (product_id, size, color)',
  `size` VARCHAR(10) NOT NULL,
  `color` VARCHAR(30) NOT NULL,
  `price` DECIMAL(12,0) NOT NULL COMMENT 'VNĐ, không có phần lẻ',
  `stock_quantity` INT NOT NULL DEFAULT 0 COMMENT 'Tồn vật lý trong kho. Giữ hàng không trừ cột này; bán hàng chỉ trừ khi Owner xác nhận.',
  `online_sales_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `status` VARCHAR(20) NOT NULL,
  PRIMARY KEY (`detail_id`),
  UNIQUE KEY `uq_product_detail_1` (`product_id`, `size`, `color`),
  KEY `ix_product_detail_1` (`online_sales_enabled`, `status`),
  CONSTRAINT `ck_product_detail_1` CHECK (price >= 0),
  CONSTRAINT `ck_product_detail_2` CHECK (stock_quantity >= 0),
  CONSTRAINT `ck_product_detail_3` CHECK (online_sales_enabled IN (0, 1)),
  CONSTRAINT `fk_product_detail_product_id` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 13/29: stock_receipt
CREATE TABLE `stock_receipt` (
  `receipt_id` INT NOT NULL AUTO_INCREMENT,
  `created_by` INT NOT NULL COMMENT 'Chỉ OWNER hoặc STAFF; FAMILY_MEMBER không được tạo phiếu nhập',
  `receipt_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `note` VARCHAR(255) NULL,
  `status` VARCHAR(30) COLLATE utf8mb4_bin NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT / PENDING_CONFIRMATION / CONFIRMED / REJECTED',
  `confirmed_by` INT NULL COMMENT 'Chỉ OWNER; bắt buộc khi CONFIRMED',
  `confirmed_at` DATETIME NULL COMMENT 'Mốc tăng tồn kho một lần',
  `rejection_reason` VARCHAR(255) NULL COMMENT 'Owner ghi lý do từ chối',
  PRIMARY KEY (`receipt_id`),
  KEY `ix_stock_receipt_1` (`status`, `receipt_date`),
  CONSTRAINT `ck_stock_receipt_1` CHECK (status IN ('DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED')),
  CONSTRAINT `fk_stock_receipt_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_stock_receipt_confirmed_by` FOREIGN KEY (`confirmed_by`) REFERENCES `user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 14/29: cart
CREATE TABLE `cart` (
  `cart_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  PRIMARY KEY (`cart_id`),
  UNIQUE KEY `uq_cart_1` (`user_id`),
  CONSTRAINT `fk_cart_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 15/29: discount_code
CREATE TABLE `discount_code` (
  `discount_code_id` INT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(30) NOT NULL,
  `discount_percentage` DECIMAL(5,2) NOT NULL,
  `min_order_value` DECIMAL(12,0) NOT NULL DEFAULT 0,
  `max_discount_amount` DECIMAL(12,0) NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `usage_limit` INT NULL COMMENT 'NULL = không giới hạn',
  `used_count` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(20) NOT NULL,
  `created_by` INT NOT NULL COMMENT 'Owner tạo; giữ lịch sử người thao tác',
  PRIMARY KEY (`discount_code_id`),
  UNIQUE KEY `uq_discount_code_1` (`code`),
  CONSTRAINT `ck_discount_code_1` CHECK (discount_percentage BETWEEN 0 AND 100),
  CONSTRAINT `ck_discount_code_2` CHECK (end_date > start_date),
  CONSTRAINT `ck_discount_code_3` CHECK (min_order_value >= 0),
  CONSTRAINT `ck_discount_code_4` CHECK (max_discount_amount IS NULL OR max_discount_amount >= 0),
  CONSTRAINT `ck_discount_code_5` CHECK (usage_limit IS NULL OR usage_limit > 0),
  CONSTRAINT `ck_discount_code_6` CHECK (used_count >= 0),
  CONSTRAINT `ck_discount_code_7` CHECK (usage_limit IS NULL OR used_count <= usage_limit),
  CONSTRAINT `fk_discount_code_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 16/29: promotion
CREATE TABLE `promotion` (
  `promotion_id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NULL,
  `discount_value` DECIMAL(12,2) NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `created_by` INT NOT NULL COMMENT 'Owner tạo',
  `discount_type` VARCHAR(20) COLLATE utf8mb4_bin NOT NULL COMMENT 'PERCENT: 0–100; FIXED: số tiền VNĐ nguyên',
  `min_order_value` DECIMAL(12,0) NOT NULL DEFAULT 0,
  `max_discount_amount` DECIMAL(12,0) NULL COMMENT 'Mức giảm tối đa khi giảm theo phần trăm',
  PRIMARY KEY (`promotion_id`),
  CONSTRAINT `ck_promotion_1` CHECK (discount_value >= 0),
  CONSTRAINT `ck_promotion_2` CHECK (end_date > start_date),
  CONSTRAINT `ck_promotion_3` CHECK (discount_type IN ('PERCENT', 'FIXED')),
  CONSTRAINT `ck_promotion_4` CHECK (min_order_value >= 0),
  CONSTRAINT `ck_promotion_5` CHECK (max_discount_amount >= 0),
  CONSTRAINT `ck_promotion_6` CHECK (discount_type <> 'PERCENT' OR discount_value <= 100),
  CONSTRAINT `ck_promotion_7` CHECK (discount_type <> 'FIXED' OR discount_value = FLOOR(discount_value)),
  CONSTRAINT `fk_promotion_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 17/29: user_notification
CREATE TABLE `user_notification` (
  `user_notification_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `notification_id` INT NOT NULL COMMENT 'UNIQUE (user_id, notification_id)',
  `is_read` BOOLEAN NOT NULL DEFAULT FALSE,
  `read_at` DATETIME NULL,
  PRIMARY KEY (`user_notification_id`),
  UNIQUE KEY `uq_user_notification_1` (`user_id`, `notification_id`),
  KEY `ix_user_notification_1` (`user_id`, `is_read`),
  CONSTRAINT `ck_user_notification_1` CHECK (is_read IN (0, 1)),
  CONSTRAINT `fk_user_notification_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_user_notification_notification_id` FOREIGN KEY (`notification_id`) REFERENCES `notification` (`notification_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 18/29: shift_change_request
CREATE TABLE `shift_change_request` (
  `request_id` INT NOT NULL AUTO_INCREMENT,
  `requested_by` INT NOT NULL COMMENT 'Nhân viên xin đổi ca',
  `shift_id` INT NOT NULL COMMENT 'Ca của người xin đổi',
  `target_user_id` INT NOT NULL COMMENT 'Nhân viên đổi ca cùng',
  `target_shift_id` INT NULL COMMENT 'Ca của người kia; NULL nếu người kia chỉ nhận thay, không đổi lại ca nào',
  `reason` TEXT NULL,
  `status` VARCHAR(20) COLLATE utf8mb4_bin NOT NULL DEFAULT 'Pending' COMMENT 'Pending / Approved / Rejected',
  `requested_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` DATETIME NULL COMMENT 'NULL = chưa duyệt',
  PRIMARY KEY (`request_id`),
  KEY `ix_shift_change_request_1` (`status`, `requested_at`),
  CONSTRAINT `ck_shift_change_request_1` CHECK (target_user_id <> requested_by),
  CONSTRAINT `ck_shift_change_request_2` CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  CONSTRAINT `fk_shift_change_request_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_shift_change_request_shift_id` FOREIGN KEY (`shift_id`) REFERENCES `work_shift` (`shift_id`),
  CONSTRAINT `fk_shift_change_request_target_user_id` FOREIGN KEY (`target_user_id`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_shift_change_request_target_shift_id` FOREIGN KEY (`target_shift_id`) REFERENCES `work_shift` (`shift_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 19/29: orders
CREATE TABLE `orders` (
  `order_id` INT NOT NULL AUTO_INCREMENT,
  `order_number` VARCHAR(30) NOT NULL COMMENT 'Index (tra cứu theo mã)',
  `order_type` VARCHAR(20) COLLATE utf8mb4_bin NOT NULL COMMENT 'Loại đơn: Online hoặc In-Store (bán tại quầy)',
  `user_id` INT NOT NULL COMMENT 'Online: khách đặt đơn. In-Store: người bán tạo đơn; Owner vẫn phải xác nhận.',
  `discount_code_id` INT NULL COMMENT 'Chỉ áp dụng cho đơn online; đơn tại quầy để NULL',
  `promotion_id` INT NULL COMMENT 'Chỉ áp dụng cho đơn online; đơn tại quầy để NULL',
  `delivery_name` VARCHAR(100) NULL COMMENT 'Đơn tại quầy có thể để trống',
  `delivery_phone` VARCHAR(15) NULL,
  `delivery_address` VARCHAR(255) NULL,
  `order_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `order_status` VARCHAR(30) COLLATE utf8mb4_bin NOT NULL COMMENT 'AWAITING_PAYMENT / PENDING_CONFIRMATION / AWAITING_PICKUP / SHIPPING / DELIVERED / COMPLETED / CANCELLED / REJECTED / EXPIRED',
  `payment_expires_at` DATETIME NULL COMMENT 'Hạn trả tiền online; hạn giữ tạm ở stock_hold_expires_at, PAID không tự hết hạn.',
  `total_amount` DECIMAL(12,0) NOT NULL,
  `created_by` INT NOT NULL COMMENT 'Online: khách hàng; tại quầy: Owner/Family/Staff theo quyền bán hàng',
  `confirmed_by` INT NULL COMMENT 'Chỉ OWNER được xác nhận cả đơn online và tại quầy',
  `confirmed_at` DATETIME NULL COMMENT 'Mốc xác nhận thành công',
  `stock_deducted_at` DATETIME NULL COMMENT 'Đánh dấu đã trừ tồn; không trừ lần hai khi đổi trạng thái hoặc callback',
  `preparation_status` VARCHAR(20) COLLATE utf8mb4_bin NOT NULL DEFAULT 'NOT_STARTED' COMMENT 'NOT_STARTED / PREPARING / PREPARED; thao tác đơn online do Owner thực hiện',
  `payment_method` VARCHAR(30) COLLATE utf8mb4_bin NOT NULL COMMENT 'CASH / COD / ONLINE; độc lập với trạng thái xử lý đơn',
  `payment_status` VARCHAR(30) COLLATE utf8mb4_bin NOT NULL COMMENT 'UNPAID / PAID / REFUND_PENDING / PARTIALLY_REFUNDED / REFUNDED / NOT_REQUIRED',
  `items_amount` DECIMAL(12,0) NOT NULL COMMENT 'Tổng quantity × unit_price tại lúc đặt',
  `promotion_discount_amount` DECIMAL(12,0) NOT NULL DEFAULT 0 COMMENT 'Số tiền khuyến mãi thực tế đã chốt',
  `coupon_discount_amount` DECIMAL(12,0) NOT NULL DEFAULT 0 COMMENT 'Số tiền mã giảm giá thực tế đã chốt',
  `shipping_fee` DECIMAL(12,0) NOT NULL DEFAULT 0 COMMENT 'Phí khách trả; tại quầy bằng 0',
  `coupon_code_snapshot` VARCHAR(30) NULL COMMENT 'Mã đã áp dụng, giữ khi mã gốc đổi',
  `promotion_name_snapshot` VARCHAR(100) NULL COMMENT 'Tên khuyến mãi đã áp dụng',
  `cancel_reason` VARCHAR(255) NULL COMMENT 'Hủy, từ chối, hết hạn hoặc thiếu hàng khi xác nhận',
  `cancelled_at` DATETIME NULL COMMENT 'Không tự động cộng hàng khi có giá trị này',
  `related_order_id` INT NULL COMMENT 'Đơn gốc khi tạo đơn thay thế để đổi hàng',
  `stock_hold_status` VARCHAR(20) COLLATE utf8mb4_bin NOT NULL DEFAULT 'NONE' COMMENT 'NONE / TEMPORARY / PAID / CONSUMED / RELEASED / EXPIRED',
  `stock_hold_payment_id` INT NULL COMMENT 'Lần thử trả tiền đang được giữ hàng; phải thuộc đơn này',
  `stock_hold_expires_at` DATETIME NULL COMMENT 'Hạn giữ tạm; giữ PAID không hết hạn tự động',
  `stock_hold_created_at` DATETIME NULL COMMENT 'Mốc bắt đầu giữ hiện hành',
  `stock_hold_paid_at` DATETIME NULL COMMENT 'Mốc callback thành công',
  `stock_hold_closed_at` DATETIME NULL COMMENT 'Mốc tiêu thụ hoặc giải phóng giữ',
  `stock_hold_close_reason` VARCHAR(255) NULL COMMENT 'Lý do đóng giữ hàng',
  `stock_hold_key` VARCHAR(100) NULL COMMENT 'Khóa idempotency của lần giữ hiện hành; các lần cũ ghi audit_log',
  `shipping_carrier` VARCHAR(50) NULL COMMENT 'Đơn vị vận chuyển',
  `shipping_service_code` VARCHAR(50) NULL COMMENT 'Mã dịch vụ vận chuyển',
  `provider_shipment_id` VARCHAR(100) NULL COMMENT 'Mã lô giao hàng trên nhà vận chuyển',
  `tracking_number` VARCHAR(100) NULL COMMENT 'Mã vận đơn; một lô giao mỗi đơn ở phiên bản đầu',
  `shipment_status` VARCHAR(30) COLLATE utf8mb4_bin NULL COMMENT 'Trạng thái giao vận riêng với trạng thái xử lý đơn',
  `carrier_shipping_fee` DECIMAL(12,0) NULL COMMENT 'Phí dịch vụ thực tế; shipping_fee là số tiền khách trả',
  `cod_amount` DECIMAL(12,0) NULL COMMENT 'Số tiền nhà vận chuyển thu hộ',
  `shipment_created_at` DATETIME NULL COMMENT 'Mốc tạo vận đơn',
  `shipment_picked_up_at` DATETIME NULL COMMENT 'Mốc nhà vận chuyển nhận hàng',
  `shipment_delivered_at` DATETIME NULL COMMENT 'Mốc giao thành công',
  `shipment_updated_at` DATETIME NULL COMMENT 'Mốc cập nhật giao vận',
  `shipment_last_event_id` VARCHAR(100) NULL COMMENT 'Kiểm soát webhook vận chuyển lặp',
  PRIMARY KEY (`order_id`),
  UNIQUE KEY `uq_orders_1` (`order_number`),
  UNIQUE KEY `uq_orders_2` (`stock_hold_key`),
  UNIQUE KEY `uq_orders_3` (`shipping_carrier`, `tracking_number`),
  KEY `ix_orders_1` (`order_status`, `payment_expires_at`),
  KEY `ix_orders_2` (`user_id`, `order_type`, `order_date`),
  KEY `ix_orders_3` (`created_by`, `order_type`, `order_date`),
  KEY `ix_orders_4` (`stock_hold_status`, `stock_hold_expires_at`),
  CONSTRAINT `ck_orders_1` CHECK (order_type IN ('Online', 'In-Store')),
  CONSTRAINT `ck_orders_2` CHECK (order_status IN ('AWAITING_PAYMENT', 'PENDING_CONFIRMATION', 'AWAITING_PICKUP', 'SHIPPING', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED')),
  CONSTRAINT `ck_orders_3` CHECK (total_amount >= 0),
  CONSTRAINT `ck_orders_4` CHECK (preparation_status IN ('NOT_STARTED', 'PREPARING', 'PREPARED')),
  CONSTRAINT `ck_orders_5` CHECK (payment_method IN ('CASH', 'COD', 'ONLINE')),
  CONSTRAINT `ck_orders_6` CHECK (payment_status IN ('UNPAID', 'PAID', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'NOT_REQUIRED')),
  CONSTRAINT `ck_orders_7` CHECK (items_amount >= 0),
  CONSTRAINT `ck_orders_8` CHECK (promotion_discount_amount >= 0),
  CONSTRAINT `ck_orders_9` CHECK (coupon_discount_amount >= 0),
  CONSTRAINT `ck_orders_10` CHECK (shipping_fee >= 0),
  CONSTRAINT `ck_orders_11` CHECK (stock_hold_status IN ('NONE', 'TEMPORARY', 'PAID', 'CONSUMED', 'RELEASED', 'EXPIRED')),
  CONSTRAINT `ck_orders_12` CHECK (shipment_status IN ('CREATED', 'AWAITING_PICKUP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'RETURNING', 'RETURNED', 'CANCELLED')),
  CONSTRAINT `ck_orders_13` CHECK (carrier_shipping_fee >= 0),
  CONSTRAINT `ck_orders_14` CHECK (cod_amount >= 0),
  CONSTRAINT `ck_orders_15` CHECK (stock_hold_status NOT IN ('TEMPORARY','PAID') OR stock_hold_payment_id IS NOT NULL),
  CONSTRAINT `ck_orders_16` CHECK (stock_hold_status <> 'TEMPORARY' OR stock_hold_expires_at IS NOT NULL),
  CONSTRAINT `ck_orders_17` CHECK (stock_hold_status <> 'PAID' OR (stock_hold_paid_at IS NOT NULL AND stock_hold_expires_at IS NULL)),
  CONSTRAINT `fk_orders_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_orders_discount_code_id` FOREIGN KEY (`discount_code_id`) REFERENCES `discount_code` (`discount_code_id`),
  CONSTRAINT `fk_orders_promotion_id` FOREIGN KEY (`promotion_id`) REFERENCES `promotion` (`promotion_id`),
  CONSTRAINT `fk_orders_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_orders_confirmed_by` FOREIGN KEY (`confirmed_by`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_orders_related_order_id` FOREIGN KEY (`related_order_id`) REFERENCES `orders` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 20/29: product_location
CREATE TABLE `product_location` (
  `product_location_id` INT NOT NULL AUTO_INCREMENT,
  `detail_id` INT NOT NULL COMMENT 'UNIQUE (detail_id, shelf_level_id)',
  `shelf_level_id` INT NOT NULL,
  `quantity` INT NOT NULL DEFAULT 0 COMMENT 'Gán lần đầu phải > 0; sau xuất hết có thể = 0 để giữ mô tả và ảnh',
  `description` TEXT NULL COMMENT 'Mô tả thực tế tại vị trí; backend kiểm tra cùng ảnh và quantity > 0',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Cập nhật khi xếp, chuyển, xuất hoặc nhập lại',
  PRIMARY KEY (`product_location_id`),
  UNIQUE KEY `uq_product_location_1` (`detail_id`, `shelf_level_id`),
  CONSTRAINT `ck_product_location_1` CHECK (quantity >= 0),
  CONSTRAINT `fk_product_location_detail_id` FOREIGN KEY (`detail_id`) REFERENCES `product_detail` (`detail_id`),
  CONSTRAINT `fk_product_location_shelf_level_id` FOREIGN KEY (`shelf_level_id`) REFERENCES `shelf_level` (`shelf_level_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 21/29: stock_receipt_item
CREATE TABLE `stock_receipt_item` (
  `receipt_item_id` INT NOT NULL AUTO_INCREMENT,
  `receipt_id` INT NOT NULL,
  `detail_id` INT NOT NULL,
  `quantity_received` INT NOT NULL,
  PRIMARY KEY (`receipt_item_id`),
  CONSTRAINT `ck_stock_receipt_item_1` CHECK (quantity_received > 0),
  CONSTRAINT `fk_stock_receipt_item_receipt_id` FOREIGN KEY (`receipt_id`) REFERENCES `stock_receipt` (`receipt_id`),
  CONSTRAINT `fk_stock_receipt_item_detail_id` FOREIGN KEY (`detail_id`) REFERENCES `product_detail` (`detail_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 22/29: cart_item
CREATE TABLE `cart_item` (
  `cart_item_id` INT NOT NULL AUTO_INCREMENT,
  `cart_id` INT NOT NULL,
  `detail_id` INT NOT NULL COMMENT 'UNIQUE (cart_id, detail_id)',
  `quantity` INT NOT NULL COMMENT 'Giá lấy trực tiếp từ product_detail.price',
  PRIMARY KEY (`cart_item_id`),
  UNIQUE KEY `uq_cart_item_1` (`cart_id`, `detail_id`),
  CONSTRAINT `ck_cart_item_1` CHECK (quantity > 0),
  CONSTRAINT `fk_cart_item_cart_id` FOREIGN KEY (`cart_id`) REFERENCES `cart` (`cart_id`),
  CONSTRAINT `fk_cart_item_detail_id` FOREIGN KEY (`detail_id`) REFERENCES `product_detail` (`detail_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 23/29: product_location_image
CREATE TABLE `product_location_image` (
  `product_location_image_id` INT NOT NULL AUTO_INCREMENT,
  `product_location_id` INT NOT NULL,
  `image_url` VARCHAR(500) NOT NULL,
  `cloud_public_id` VARCHAR(255) NULL COMMENT 'Định danh tài nguyên cloud để thay/xóa ảnh',
  `deleted_at` DATETIME NULL COMMENT 'Xóa mềm để bảo toàn lịch sử',
  PRIMARY KEY (`product_location_image_id`),
  KEY `ix_product_location_image_1` (`product_location_id`, `deleted_at`),
  CONSTRAINT `fk_product_location_image_product_location_id` FOREIGN KEY (`product_location_id`) REFERENCES `product_location` (`product_location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 24/29: invoice
CREATE TABLE `invoice` (
  `invoice_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL COMMENT 'Quan hệ 1-1 với đơn hàng',
  `invoice_number` VARCHAR(30) NOT NULL COMMENT 'Index (tra cứu theo mã)',
  `issued_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `issued_by` INT NULL COMMENT 'NULL nếu hệ thống phát hành; Staff chỉ tạo cho giao dịch tại quầy theo quyền',
  `issuer_type` VARCHAR(20) COLLATE utf8mb4_bin NOT NULL COMMENT 'USER / SYSTEM',
  PRIMARY KEY (`invoice_id`),
  UNIQUE KEY `uq_invoice_1` (`order_id`),
  UNIQUE KEY `uq_invoice_2` (`invoice_number`),
  CONSTRAINT `ck_invoice_1` CHECK (issuer_type IN ('USER', 'SYSTEM')),
  CONSTRAINT `fk_invoice_order_id` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`),
  CONSTRAINT `fk_invoice_issued_by` FOREIGN KEY (`issued_by`) REFERENCES `user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 25/29: payment
CREATE TABLE `payment` (
  `payment_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL COMMENT 'Một đơn có thể thanh toán nhiều lần (thử lại)',
  `transaction_ref` VARCHAR(100) NULL COMMENT 'Mã giao dịch từ cổng thanh toán',
  `payment_method` VARCHAR(30) COLLATE utf8mb4_bin NOT NULL,
  `payment_status` VARCHAR(20) COLLATE utf8mb4_bin NOT NULL COMMENT 'PENDING / SUCCESS / FAILED / EXPIRED; trạng thái một lần thử thanh toán',
  `amount` DECIMAL(12,0) NOT NULL,
  `attempted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `provider` VARCHAR(50) NULL COMMENT 'Nhà cung cấp thanh toán; transaction_ref phải duy nhất theo quy ước tích hợp',
  `paid_at` DATETIME NULL COMMENT 'Lưu khi SUCCESS',
  `failure_reason` VARCHAR(255) NULL COMMENT 'Lỗi hoặc lý do từ chối thanh toán',
  `refunded_amount` DECIMAL(12,0) NOT NULL DEFAULT 0 COMMENT 'Tổng tiền đã hoàn thành công của lần thu tiền này',
  `refund_history` JSON NULL COMMENT 'Mảng các lần hoàn: amount/status/ref/idempotency_key/reason/requested_by/requested_at/completed_at/return_request_id',
  PRIMARY KEY (`payment_id`),
  UNIQUE KEY `uq_payment_1` (`transaction_ref`),
  KEY `ix_payment_1` (`order_id`, `payment_status`, `attempted_at`),
  CONSTRAINT `ck_payment_1` CHECK (payment_method IN ('CASH', 'COD', 'ONLINE')),
  CONSTRAINT `ck_payment_2` CHECK (payment_status IN ('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED')),
  CONSTRAINT `ck_payment_3` CHECK (amount > 0),
  CONSTRAINT `ck_payment_4` CHECK (refunded_amount BETWEEN 0 AND amount),
  CONSTRAINT `fk_payment_order_id` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 26/29: return_request
CREATE TABLE `return_request` (
  `return_request_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `user_id` INT NULL COMMENT 'Khách online; NULL khi khách mua tại quầy không có tài khoản',
  `reason` TEXT NOT NULL,
  `status` VARCHAR(20) COLLATE utf8mb4_bin NOT NULL COMMENT 'PENDING / APPROVED / REJECTED / RECEIVED / COMPLETED',
  `requested_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processed_at` DATETIME NULL,
  `created_by` INT NOT NULL COMMENT 'Khách tạo yêu cầu online hoặc người bán ghi nhận tại quầy',
  `request_type` VARCHAR(20) COLLATE utf8mb4_bin NOT NULL COMMENT 'Đổi hàng tạo đơn thay thế qua orders.related_order_id',
  `processed_by` INT NULL COMMENT 'Chỉ Owner xử lý',
  `customer_name` VARCHAR(100) NULL COMMENT 'Thông tin khách vãng lai nếu cần',
  `customer_phone` VARCHAR(15) NULL COMMENT 'Thông tin liên hệ khách tại quầy',
  PRIMARY KEY (`return_request_id`),
  KEY `ix_return_request_1` (`order_id`, `requested_at`),
  KEY `ix_return_request_2` (`status`, `requested_at`),
  CONSTRAINT `ck_return_request_1` CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'RECEIVED', 'COMPLETED')),
  CONSTRAINT `ck_return_request_2` CHECK (request_type IN ('RETURN', 'EXCHANGE')),
  CONSTRAINT `fk_return_request_order_id` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`),
  CONSTRAINT `fk_return_request_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_return_request_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_return_request_processed_by` FOREIGN KEY (`processed_by`) REFERENCES `user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 27/29: order_item
CREATE TABLE `order_item` (
  `order_item_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `detail_id` INT NOT NULL,
  `quantity` INT NOT NULL,
  `unit_price` DECIMAL(12,0) NOT NULL COMMENT 'Chốt giá tại thời điểm mua; thành tiền = quantity × unit_price',
  `product_name_snapshot` VARCHAR(200) NOT NULL COMMENT 'Tên tại lúc đặt; không đổi khi sản phẩm đổi tên',
  `size_snapshot` VARCHAR(10) NOT NULL,
  `color_snapshot` VARCHAR(30) NOT NULL,
  `reserved_quantity` INT NOT NULL DEFAULT 0 COMMENT 'Lượng giữ cho dòng đơn; đóng giữ phải về 0 cùng transaction',
  PRIMARY KEY (`order_item_id`),
  CONSTRAINT `ck_order_item_1` CHECK (quantity > 0),
  CONSTRAINT `ck_order_item_2` CHECK (unit_price >= 0),
  CONSTRAINT `ck_order_item_3` CHECK (reserved_quantity BETWEEN 0 AND quantity),
  CONSTRAINT `fk_order_item_order_id` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`),
  CONSTRAINT `fk_order_item_detail_id` FOREIGN KEY (`detail_id`) REFERENCES `product_detail` (`detail_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 28/29: return_request_item
CREATE TABLE `return_request_item` (
  `return_request_item_id` INT NOT NULL AUTO_INCREMENT,
  `return_request_id` INT NOT NULL,
  `order_item_id` INT NOT NULL,
  `quantity_returned` INT NOT NULL,
  `item_reason` VARCHAR(255) NULL,
  `quantity_received` INT NOT NULL DEFAULT 0 COMMENT 'Số lượng Owner thực nhận; không vượt quantity_returned',
  `quantity_restocked` INT NOT NULL DEFAULT 0 COMMENT 'Số hàng đạt chất lượng đã nhập lại; không vượt quantity_received',
  `refund_amount` DECIMAL(12,0) NOT NULL DEFAULT 0 COMMENT 'Số tiền được duyệt hoàn theo giá và giảm giá thực tế',
  PRIMARY KEY (`return_request_item_id`),
  CONSTRAINT `ck_return_request_item_1` CHECK (quantity_returned > 0),
  CONSTRAINT `ck_return_request_item_2` CHECK (quantity_received >= 0),
  CONSTRAINT `ck_return_request_item_3` CHECK (quantity_restocked >= 0),
  CONSTRAINT `ck_return_request_item_4` CHECK (refund_amount >= 0),
  CONSTRAINT `ck_return_request_item_5` CHECK (quantity_received <= quantity_returned),
  CONSTRAINT `ck_return_request_item_6` CHECK (quantity_restocked <= quantity_received),
  CONSTRAINT `fk_return_request_item_return_request_id` FOREIGN KEY (`return_request_id`) REFERENCES `return_request` (`return_request_id`),
  CONSTRAINT `fk_return_request_item_order_item_id` FOREIGN KEY (`order_item_id`) REFERENCES `order_item` (`order_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 29/29: stock_adjustment
CREATE TABLE `stock_adjustment` (
  `adjustment_id` INT NOT NULL AUTO_INCREMENT,
  `detail_id` INT NOT NULL,
  `quantity_change` INT NOT NULL COMMENT 'Tác động tổng tồn; MOVE = 0, nhập/hoàn dương, xuất âm',
  `reason` VARCHAR(255) NOT NULL,
  `adjusted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `adjusted_by` INT NOT NULL COMMENT 'Owner thực hiện; giữ người thao tác để truy vết',
  `movement_type` VARCHAR(30) COLLATE utf8mb4_bin NOT NULL DEFAULT 'ADJUSTMENT' COMMENT 'ADJUSTMENT / RECEIPT / ORDER_OUT / MOVE / RESTOCK',
  `movement_quantity` INT NULL COMMENT 'Số hàng thao tác; bắt buộc cho MOVE, dòng cũ dùng ABS(quantity_change)',
  `source_location_id` INT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ',
  `destination_location_id` INT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ',
  `order_item_id` INT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ',
  `receipt_item_id` INT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ',
  `return_request_item_id` INT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ',
  `original_out_adjustment_id` INT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ',
  `idempotency_key` VARCHAR(100) NULL COMMENT 'Khóa mỗi dòng kho; bắt buộc ở backend cho thao tác mới',
  PRIMARY KEY (`adjustment_id`),
  UNIQUE KEY `uq_stock_adjustment_1` (`idempotency_key`),
  KEY `ix_stock_adjustment_1` (`detail_id`, `adjusted_at`),
  KEY `ix_stock_adjustment_2` (`order_item_id`, `adjusted_at`),
  KEY `ix_stock_adjustment_3` (`original_out_adjustment_id`),
  CONSTRAINT `ck_stock_adjustment_1` CHECK (movement_type IN ('ADJUSTMENT', 'RECEIPT', 'ORDER_OUT', 'MOVE', 'RESTOCK')),
  CONSTRAINT `ck_stock_adjustment_2` CHECK (movement_quantity > 0),
  CONSTRAINT `ck_stock_adjustment_3` CHECK ((movement_type = 'MOVE' AND quantity_change = 0 AND movement_quantity IS NOT NULL) OR (movement_type <> 'MOVE' AND quantity_change <> 0)),
  CONSTRAINT `ck_stock_adjustment_4` CHECK (movement_type NOT IN ('RECEIPT','RESTOCK') OR quantity_change > 0),
  CONSTRAINT `ck_stock_adjustment_5` CHECK (movement_type <> 'ORDER_OUT' OR quantity_change < 0),
  CONSTRAINT `ck_stock_adjustment_6` CHECK (movement_type = 'MOVE' OR movement_quantity IS NULL OR movement_quantity = ABS(quantity_change)),
  CONSTRAINT `fk_stock_adjustment_detail_id` FOREIGN KEY (`detail_id`) REFERENCES `product_detail` (`detail_id`),
  CONSTRAINT `fk_stock_adjustment_adjusted_by` FOREIGN KEY (`adjusted_by`) REFERENCES `user` (`user_id`),
  CONSTRAINT `fk_stock_adjustment_source_location_id` FOREIGN KEY (`source_location_id`) REFERENCES `product_location` (`product_location_id`),
  CONSTRAINT `fk_stock_adjustment_destination_location_id` FOREIGN KEY (`destination_location_id`) REFERENCES `product_location` (`product_location_id`),
  CONSTRAINT `fk_stock_adjustment_order_item_id` FOREIGN KEY (`order_item_id`) REFERENCES `order_item` (`order_item_id`),
  CONSTRAINT `fk_stock_adjustment_receipt_item_id` FOREIGN KEY (`receipt_item_id`) REFERENCES `stock_receipt_item` (`receipt_item_id`),
  CONSTRAINT `fk_stock_adjustment_return_request_item_id` FOREIGN KEY (`return_request_item_id`) REFERENCES `return_request_item` (`return_request_item_id`),
  CONSTRAINT `fk_stock_adjustment_original_out_adjustment_id` FOREIGN KEY (`original_out_adjustment_id`) REFERENCES `stock_adjustment` (`adjustment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `orders` ADD CONSTRAINT `fk_orders_stock_hold_payment_id` FOREIGN KEY (`stock_hold_payment_id`) REFERENCES `payment` (`payment_id`);


-- KHỞI TẠO: không tạo user, hàng hóa hay số tồn giả.
START TRANSACTION;
INSERT INTO `role` (`role_name`) VALUES
  ('ADMIN'), ('OWNER'), ('FAMILY_MEMBER'), ('STAFF'), ('CUSTOMER');

-- Tọa độ tương đối cho sơ đồ ban đầu; chỉnh theo bố cục cửa hàng khi dùng.
INSERT INTO `rack` (`rack_code`, `coordinate_x`, `coordinate_y`) VALUES
  ('A', 0, 0), ('B', 1, 0), ('C', 2, 0), ('D', 3, 0);

INSERT INTO `shelf_level` (`rack_id`, `level_number`)
SELECT r.`rack_id`, n.`level_number`
FROM `rack` r
CROSS JOIN (
  SELECT 1 AS `level_number` UNION ALL SELECT 2 UNION ALL SELECT 3
  UNION ALL SELECT 4 UNION ALL SELECT 5
) n
WHERE r.`rack_code` IN ('A','B','C','D');
COMMIT;

-- KIỂM TRA SAU CHẠY: kỳ vọng 29 bảng, 5 role, 4 kệ, 20 tầng.
SELECT DATABASE() AS `database_name`,
 (SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE') AS `tables_expected_29`,
 (SELECT COUNT(*) FROM `role`) AS `roles_expected_5`,
 (SELECT COUNT(*) FROM `rack`) AS `racks_expected_4`,
 (SELECT COUNT(*) FROM `shelf_level`) AS `shelves_expected_20`;
