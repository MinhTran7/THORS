-- Danh mục 2 cấp (cha – con) + đối tượng khách hàng (10/11/2026).
-- Ví dụ: "Giày" (cha) → "Giày nam" (MEN), "Giày nữ" (WOMEN), "Giày trẻ em" (KIDS).
-- ĐÃ CHẠY trên Aiven (10/11/2026): 9 danh mục, tất cả là danh mục gốc, chưa gắn đối tượng.
-- Không xóa/sửa dữ liệu cũ: mọi danh mục hiện có thành danh mục gốc (parent_id = NULL), chưa gắn đối tượng.
-- Backend vẫn chạy được khi CHƯA chạy file này (chỉ không dùng được danh mục cha / đối tượng).
-- Sau khi chạy: chuyển các sản phẩm đang nằm trực tiếp ở danh mục cha sang danh mục con tương ứng.

-- 1. Danh mục cha (chỉ 2 cấp: cha phải là danh mục gốc — kiểm tra ở backend)
ALTER TABLE category
  ADD COLUMN parent_id INT DEFAULT NULL
    COMMENT 'Danh mục cha; NULL = danh mục gốc. Chỉ cho 2 cấp'
    AFTER description;
ALTER TABLE category
  ADD CONSTRAINT fk_category_parent_id FOREIGN KEY (parent_id) REFERENCES category (category_id);

-- 2. Đối tượng khách hàng: MEN / WOMEN / KIDS / UNISEX; NULL = không áp dụng
ALTER TABLE category
  ADD COLUMN target_group VARCHAR(20) DEFAULT NULL
    COMMENT 'Đối tượng: MEN / WOMEN / KIDS / UNISEX; NULL = không áp dụng'
    AFTER parent_id;
ALTER TABLE category
  ADD CONSTRAINT ck_category_target_group
    CHECK (target_group IS NULL OR target_group IN ('MEN', 'WOMEN', 'KIDS', 'UNISEX'));
-- (Không dùng CHECK parent_id <> category_id: MySQL không cho CHECK tham chiếu cột AUTO_INCREMENT; backend chặn.)

-- Kiểm tra: số danh mục không đổi, tất cả đều là danh mục gốc
-- SELECT COUNT(*), SUM(parent_id IS NULL) FROM category;
