-- Tên tầng do chủ cửa hàng đặt (sửa được như mã kệ) — 18/11/2026.
-- KHÔNG tạo bảng mới: chỉ THÊM 1 CỘT vào shelf_level, không sửa/xóa dữ liệu cũ.
-- Chạy một lần sau SQL_v3.sql (kiểm tra: SHOW COLUMNS FROM shelf_level LIKE 'level_name'; đã có thì bỏ qua).
-- level_name = NULL → hiển thị như cũ: mã kệ + số tầng (ví dụ A2). Có tên → hiển thị tên đó.

ALTER TABLE shelf_level
  ADD COLUMN level_name VARCHAR(50) DEFAULT NULL COMMENT 'Tên tầng hiển thị; NULL = mã kệ + số tầng (vd A2)';
