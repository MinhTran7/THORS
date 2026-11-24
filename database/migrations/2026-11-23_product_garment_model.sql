-- Mô hình 3D quần áo cho Phòng thử đồ (23/11/2026).
-- ĐÃ CHẠY trên thors_restore (23/11/2026): đã tạo product_garment_model (12 cột, 2 khóa ngoại, 4 CHECK).
-- Chỉ thêm 1 bảng mới, không sửa bảng / dữ liệu cũ. Gỡ bỏ: 2026-11-23_product_garment_model_rollback.sql
--
-- product_garment_model: mỗi sản phẩm tối đa 1 mô hình 3D (file GLB trên Cloudinary, thư mục thors/garments).
--   File GLB phải dựng trên người mẫu THORS (cùng toạ độ, cùng các núm co giãn Bust/Waist/Hips... + Size_up/Size_down)
--   - backend kiểm tra file trước khi lưu (GlbInspector).
--   slot: vị trí mặc trên người mẫu. gender: người mẫu nam / nữ.
--   fabric_material: tên vật liệu vải trong file (được đổi màu theo biến thể; vật liệu khác như cúc áo giữ nguyên).
--   size_morphs: size của biến thể -> mức vặn núm Size, vd {"S":{"up":0,"down":1},"M":{"up":0,"down":0},"L":{"up":0.5,"down":0}}
--   color_map:   màu của biến thể -> màu vải,          vd {"Navy":{"hex":"#22273C"},"Trắng":{"hex":"#F5F3EE"}}
--   (khóa size / màu phải khớp product_detail.size / color - backend kiểm tra, DB chỉ kiểm tra là đối tượng JSON)
--   Xóa sản phẩm -> dòng mô hình tự xóa theo (CASCADE); file trên Cloudinary do backend xóa.

CREATE TABLE product_garment_model (
  product_id      INT          NOT NULL,
  glb_url         VARCHAR(500) NOT NULL COMMENT 'File GLB trên Cloudinary (thors/garments)',
  glb_public_id   VARCHAR(255) NOT NULL COMMENT 'public_id Cloudinary - để thay / xóa file',
  file_size_bytes INT          NOT NULL,
  slot            VARCHAR(10)  NOT NULL COMMENT 'TOP | BOTTOM | DRESS | OUTER | SHOES',
  gender          VARCHAR(10)  NOT NULL COMMENT 'MALE | FEMALE (người mẫu nào)',
  fabric_material VARCHAR(64)  NOT NULL COMMENT 'Tên vật liệu vải trong file GLB',
  size_morphs     JSON         NOT NULL COMMENT 'size biến thể -> {up, down} (0..1)',
  color_map       JSON         NOT NULL COMMENT 'màu biến thể -> {hex}',
  active          TINYINT(1)   NOT NULL DEFAULT 1,
  created_by      INT          DEFAULT NULL,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id),
  KEY fk_pgm_user (created_by),
  CONSTRAINT fk_pgm_product FOREIGN KEY (product_id) REFERENCES product (product_id) ON DELETE CASCADE,
  CONSTRAINT fk_pgm_user FOREIGN KEY (created_by) REFERENCES `user` (user_id) ON DELETE SET NULL,
  CONSTRAINT ck_pgm_slot CHECK (slot IN ('TOP', 'BOTTOM', 'DRESS', 'OUTER', 'SHOES')),
  CONSTRAINT ck_pgm_gender CHECK (gender IN ('MALE', 'FEMALE')),
  CONSTRAINT ck_pgm_size CHECK (file_size_bytes > 0),
  CONSTRAINT ck_pgm_json CHECK (JSON_TYPE(size_morphs) = 'OBJECT' AND JSON_TYPE(color_map) = 'OBJECT')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
