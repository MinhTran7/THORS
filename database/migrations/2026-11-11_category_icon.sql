-- Icon riêng cho danh mục (11/11/2026).
-- ĐÃ CHẠY trên Aiven (11/11/2026): đã thêm cột icon, 20 danh mục giữ icon mặc định.
-- Lưu khóa icon (vd "skin", "crown") do người dùng chọn ở bảng icon trang Danh mục; NULL = icon mặc định.
-- Không xóa/sửa dữ liệu: mọi danh mục hiện có giữ icon mặc định (NULL).
-- Backend vẫn chạy được khi CHƯA chạy file này (chỉ không lưu được icon tự chọn).

ALTER TABLE category
  ADD COLUMN icon VARCHAR(40) CHARACTER SET ascii COLLATE ascii_general_ci DEFAULT NULL
    COMMENT 'Khóa icon danh mục (vd skin, crown); NULL = icon mặc định'
    AFTER target_group;

-- Kiểm tra: số danh mục không đổi, chưa danh mục nào có icon
-- SELECT COUNT(*), SUM(icon IS NULL) FROM category;
