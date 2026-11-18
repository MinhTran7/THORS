-- Phối đồ theo dịp / phong cách / ngân sách (17/11/2026) - module "Phối đồ cho bạn".
-- ĐÃ CHẠY trên thors_restore (17/11/2026): đã tạo bảng product_style và thêm 4 cột phong cách vào body_profile.
-- 1. product_style: thẻ của sản phẩm (1-1 với product). Sản phẩm chưa có dòng nào -> backend tự đoán thẻ theo tên.
--    occasions / styles: danh sách mã cách nhau bởi dấu phẩy (vd "WORK,PARTY"), mã hợp lệ do backend kiểm tra.
-- 2. body_profile: thêm hồ sơ phong cách của khách (đều không bắt buộc).
-- Chỉ thêm bảng / cột (cho phép NULL), không đổi dữ liệu cũ. Backend vẫn chạy khi chưa chạy file này
-- (khi đó dùng thẻ tự đoán và chưa lưu được hồ sơ phong cách).

CREATE TABLE product_style (
  product_id INT          NOT NULL,
  occasions  VARCHAR(200) DEFAULT NULL COMMENT 'Dịp mặc: WORK, PARTY, DATE, CASUAL, SPORT, TRAVEL',
  styles     VARCHAR(200) DEFAULT NULL COMMENT 'Phong cách: BASIC, ELEGANT, STREET, SPORTY, CUTE, VINTAGE',
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id),
  CONSTRAINT fk_product_style_product FOREIGN KEY (product_id) REFERENCES product (product_id) ON DELETE CASCADE
);

ALTER TABLE body_profile
  ADD COLUMN birth_year       SMALLINT     DEFAULT NULL COMMENT 'Năm sinh (tính tuổi khi tư vấn)' AFTER foot_length_cm,
  ADD COLUMN occupation       VARCHAR(60)  DEFAULT NULL COMMENT 'Nghề nghiệp (tự nhập)' AFTER birth_year,
  ADD COLUMN preferred_styles VARCHAR(200) DEFAULT NULL COMMENT 'Phong cách thích, mã cách nhau dấu phẩy' AFTER occupation,
  ADD COLUMN avoid_colors     VARCHAR(200) DEFAULT NULL COMMENT 'Màu muốn tránh, cách nhau dấu phẩy' AFTER preferred_styles;

-- Kiểm tra
-- SHOW CREATE TABLE product_style;
-- SHOW COLUMNS FROM body_profile;
