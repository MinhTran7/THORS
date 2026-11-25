-- GHN chuyển sang địa giới mới 2 cấp (34 tỉnh, không còn Quận/Huyện) — 19/11/2026.
-- KHÔNG tạo bảng mới: chỉ THÊM 2 CỘT vào orders, không sửa/xóa dữ liệu cũ.
-- Chạy một lần sau SQL_v3.sql (kiểm tra: SHOW COLUMNS FROM orders LIKE 'ghn_ward_name'; đã có thì bỏ qua).
-- Lưu Tỉnh / Phường-Xã (tên theo danh mục mới của GHN) đã gửi khi tạo vận đơn GHN.
-- Chưa chạy migration thì code vẫn gửi GHN bình thường, chỉ không lưu lại 2 tên này.
-- Cột cũ delivery_district_id / delivery_ward_code (địa giới cũ 3 cấp) giữ nguyên cho các đơn đã gửi trước đây.

ALTER TABLE orders
  ADD COLUMN ghn_province_name VARCHAR(100) DEFAULT NULL COMMENT 'Tỉnh/Thành theo danh mục mới của GHN đã gửi khi tạo vận đơn',
  ADD COLUMN ghn_ward_name VARCHAR(100) DEFAULT NULL COMMENT 'Phường/Xã theo danh mục mới của GHN đã gửi khi tạo vận đơn';
