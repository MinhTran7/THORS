-- Bảng size theo từng sản phẩm (17/11/2026) - Phase 3 "Gợi ý size".
-- ĐÃ CHẠY trên thors_restore (17/11/2026): đã tạo bảng product_size_chart (13 cột).
-- Mỗi dòng = 1 size của 1 sản phẩm, kèm khoảng số đo cơ thể phù hợp (cm / kg). Cột nào để NULL = size đó
-- không quy định số đo đó (vd. áo thường chỉ có ngực + eo, quần có eo + hông).
-- size_label khớp product_detail.size (cùng sản phẩm); không đặt khóa ngoại vì khóa của product_detail gồm cả màu,
-- backend kiểm tra khi lưu. Xóa sản phẩm -> xóa luôn bảng size (ON DELETE CASCADE).
-- Chỉ thêm bảng mới, không đổi dữ liệu cũ. Backend vẫn chạy khi chưa chạy file này (chỉ không có gợi ý size).

CREATE TABLE product_size_chart (
  product_id  INT          NOT NULL,
  size_label  VARCHAR(10)  NOT NULL COMMENT 'Trùng product_detail.size, vd S, M, 30, 38',
  height_min  DECIMAL(4,1) DEFAULT NULL COMMENT 'Chiều cao phù hợp (cm)',
  height_max  DECIMAL(4,1) DEFAULT NULL,
  weight_min  DECIMAL(4,1) DEFAULT NULL COMMENT 'Cân nặng phù hợp (kg)',
  weight_max  DECIMAL(4,1) DEFAULT NULL,
  chest_min   DECIMAL(4,1) DEFAULT NULL COMMENT 'Vòng ngực cơ thể (cm)',
  chest_max   DECIMAL(4,1) DEFAULT NULL,
  waist_min   DECIMAL(4,1) DEFAULT NULL COMMENT 'Vòng eo cơ thể (cm)',
  waist_max   DECIMAL(4,1) DEFAULT NULL,
  hip_min     DECIMAL(4,1) DEFAULT NULL COMMENT 'Vòng hông cơ thể (cm)',
  hip_max     DECIMAL(4,1) DEFAULT NULL,
  sort_order  INT          NOT NULL DEFAULT 0 COMMENT 'Thứ tự hiển thị (nhỏ -> lớn)',
  PRIMARY KEY (product_id, size_label),
  CONSTRAINT fk_size_chart_product FOREIGN KEY (product_id) REFERENCES product (product_id) ON DELETE CASCADE
);

-- Kiểm tra
-- SHOW CREATE TABLE product_size_chart;
