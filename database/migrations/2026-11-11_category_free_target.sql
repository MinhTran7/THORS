-- Danh mục nhiều cấp + đối tượng tự nhập (11/11/2026).
-- ĐÃ CHẠY trên Aiven (11/11/2026): bỏ CHECK ck_category_target_group, target_group thành VARCHAR(30); 20 danh mục giữ nguyên.
-- 1. Không giới hạn số cấp: không cần đổi cấu trúc (parent_id đã có); backend bỏ luật "chỉ 2 cấp" và chặn vòng lặp.
-- 2. Đối tượng: ngoài MEN / WOMEN / KIDS / UNISEX cho gõ tự do (vd "Bé gái"), tối đa 30 ký tự.
-- Không xóa/sửa dữ liệu: các giá trị MEN/WOMEN/KIDS/UNISEX hiện có giữ nguyên.
-- Backend vẫn chạy được khi CHƯA chạy file này (chỉ báo lỗi khi lưu đối tượng tự nhập).

ALTER TABLE category DROP CHECK ck_category_target_group;

ALTER TABLE category
  MODIFY COLUMN target_group VARCHAR(30) DEFAULT NULL
    COMMENT 'Đối tượng: MEN / WOMEN / KIDS / UNISEX hoặc chữ tự nhập (vd Bé gái); NULL = không áp dụng';

-- Kiểm tra: không còn CHECK trên target_group
-- SELECT CONSTRAINT_NAME FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_NAME = 'ck_category_target_group';
