-- Mặc thử bằng người mẫu (18/11/2026) - bổ sung cho 2026-11-18_tryon_job.sql.
-- ĐÃ CHẠY trên thors_restore (18/11/2026): đã tạo tryon_model (10 cột), tryon_job thêm mode + model_id
-- (2 job thử nghiệm có sẵn thành PHOTO). Chỉ thêm bảng / cột mới, không đổi dữ liệu cũ (job đã có tự thành chế độ PHOTO).
--
-- 1. tryon_model: người mẫu dựng sẵn do Owner tải lên (trang "Người mẫu thử đồ"). Khách chọn chế độ
--    "Người mẫu dáng giống bạn" thì hệ thống chọn người mẫu theo số đo (BMI -> body_type, chiều cao gần nhất).
--    Ảnh nằm ở Cloudinary thors/tryon-models (tách khỏi ảnh của khách nên trình tự xóa không bao giờ đụng tới).
--    note: ghi nguồn ảnh / giấy phép (ảnh tự chụp có đồng ý, ảnh AI tạo...) để chứng minh được phép dùng.
-- 2. tryon_job.mode: PHOTO (ảnh khách), MODEL (người mẫu dựng sẵn), GENERATE (AI tạo người mẫu mới).
--    model_id: người mẫu đã dùng (chế độ MODEL). Xóa người mẫu thì job giữ lại, model_id về NULL.
--    person_hash cho phép NULL: chế độ GENERATE không có ảnh người gốc.

CREATE TABLE tryon_model (
  model_id   INT          NOT NULL AUTO_INCREMENT,
  gender     VARCHAR(10)  NOT NULL COMMENT 'MALE | FEMALE',
  body_type  VARCHAR(10)  NOT NULL COMMENT 'SLIM | REGULAR | FULL (gầy / vừa / đầy đặn)',
  height_cm  SMALLINT     NOT NULL COMMENT 'Chiều cao người mẫu (cm), để chọn gần với khách',
  image_url  VARCHAR(500) NOT NULL COMMENT 'Ảnh toàn thân trên Cloudinary (thors/tryon-models)',
  source     VARCHAR(10)  NOT NULL DEFAULT 'UPLOAD' COMMENT 'UPLOAD (ảnh chụp) | AI (ảnh AI tạo)',
  note       VARCHAR(255) DEFAULT NULL COMMENT 'Nguồn ảnh / giấy phép',
  active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_by INT          DEFAULT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (model_id),
  KEY ix_tryon_model_pick (active, gender, body_type),
  CONSTRAINT fk_tryon_model_user FOREIGN KEY (created_by) REFERENCES `user` (user_id) ON DELETE SET NULL,
  CONSTRAINT ck_tryon_model_gender CHECK (gender IN ('MALE', 'FEMALE')),
  CONSTRAINT ck_tryon_model_body CHECK (body_type IN ('SLIM', 'REGULAR', 'FULL')),
  CONSTRAINT ck_tryon_model_source CHECK (source IN ('UPLOAD', 'AI')),
  CONSTRAINT ck_tryon_model_height CHECK (height_cm BETWEEN 120 AND 220)
);

ALTER TABLE tryon_job
  ADD COLUMN mode     VARCHAR(10) NOT NULL DEFAULT 'PHOTO' COMMENT 'PHOTO | MODEL | GENERATE' AFTER status,
  ADD COLUMN model_id INT         DEFAULT NULL COMMENT 'Người mẫu dựng sẵn (chế độ MODEL)' AFTER mode,
  MODIFY COLUMN person_hash CHAR(64) DEFAULT NULL COMMENT 'SHA-256 ảnh gốc (NULL ở chế độ GENERATE)',
  ADD KEY ix_tryon_job_model (mode, model_id, status),
  ADD CONSTRAINT fk_tryon_job_model FOREIGN KEY (model_id) REFERENCES tryon_model (model_id) ON DELETE SET NULL,
  ADD CONSTRAINT ck_tryon_job_mode CHECK (mode IN ('PHOTO', 'MODEL', 'GENERATE'));

-- Kiểm tra
-- SHOW CREATE TABLE tryon_model;
-- SHOW COLUMNS FROM tryon_job;
