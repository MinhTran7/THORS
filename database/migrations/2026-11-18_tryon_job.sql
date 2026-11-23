-- Thử đồ bằng ảnh 2D (18/11/2026) - khách tải / chụp ảnh của mình, AI vẽ ảnh khách mặc món / bộ đồ được chọn.
-- ĐÃ CHẠY trên thors_restore (18/11/2026): đã tạo bảng tryon_job (12 cột) và tryon_job_item (4 cột).
-- Chỉ thêm 2 bảng mới, không đổi dữ liệu cũ. Backend vẫn chạy khi chưa chạy file này
-- (chức năng thử đồ báo "chưa sẵn sàng", các chức năng khác không ảnh hưởng).
--
-- 1. tryon_job: mỗi lần khách bấm "Mặc thử" = 1 job xử lý nền (gọi dịch vụ AI mất 10-30 giây / món).
--    status: PENDING (chờ) -> RUNNING (đang vẽ) -> DONE (có ảnh) | FAILED (lỗi / quá thời gian).
--    person_image_url / result_image_url: ảnh trên Cloudinary (thư mục thors/tryon), tự xóa sau expires_at
--      (khách đã đồng ý khi tải ảnh); xóa xong 2 cột này về NULL và ghi purged_at, dòng job giữ lại để
--      tính số lượt đã dùng trong ngày (giới hạn lượt vì mỗi lượt gọi AI tốn phí).
--    person_hash: SHA-256 của ảnh gốc - cùng ảnh + cùng danh sách món đã có kết quả thì trả lại kết quả cũ,
--      không gọi AI lần nữa.
--    provider: dịch vụ đã dùng (MOCK = ảnh mẫu khi chưa cấu hình dịch vụ thật, FASHN, ...).
-- 2. tryon_job_item: các món trong 1 lần thử, theo thứ tự mặc (quần trước, áo sau; đầm 1 món).
--    Tách bảng (không lưu "12,45" trong 1 cột) để có khóa ngoại tới product.

CREATE TABLE tryon_job (
  job_id           BIGINT       NOT NULL AUTO_INCREMENT,
  user_id          INT          NOT NULL,
  status           VARCHAR(10)  NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING | RUNNING | DONE | FAILED',
  provider         VARCHAR(20)  NOT NULL COMMENT 'Dịch vụ AI: MOCK, FASHN, ...',
  person_hash      CHAR(64)     NOT NULL COMMENT 'SHA-256 ảnh gốc của khách (dùng lại kết quả cũ)',
  person_image_url VARCHAR(500) DEFAULT NULL COMMENT 'Ảnh khách (Cloudinary), NULL sau khi tự xóa',
  result_image_url VARCHAR(500) DEFAULT NULL COMMENT 'Ảnh kết quả (Cloudinary), NULL khi chưa xong / đã xóa',
  error_message    VARCHAR(255) DEFAULT NULL COMMENT 'Lý do lỗi hiển thị cho khách',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at      DATETIME     DEFAULT NULL,
  expires_at       DATETIME     NOT NULL COMMENT 'Hết hạn -> tự xóa ảnh (mặc định 24 giờ)',
  purged_at        DATETIME     DEFAULT NULL COMMENT 'Thời điểm đã xóa ảnh',
  PRIMARY KEY (job_id),
  KEY ix_tryon_job_user_created (user_id, created_at),
  KEY ix_tryon_job_expires (expires_at, purged_at),
  KEY ix_tryon_job_cache (user_id, person_hash, status),
  CONSTRAINT fk_tryon_job_user FOREIGN KEY (user_id) REFERENCES `user` (user_id) ON DELETE CASCADE,
  CONSTRAINT ck_tryon_job_status CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'FAILED'))
);

CREATE TABLE tryon_job_item (
  job_id     BIGINT      NOT NULL,
  position   TINYINT     NOT NULL COMMENT 'Thứ tự mặc: 1, 2, ...',
  product_id INT         NOT NULL,
  garment    VARCHAR(10) NOT NULL COMMENT 'TOP | BOTTOM | DRESS (loại món gửi cho AI)',
  PRIMARY KEY (job_id, position),
  KEY ix_tryon_job_item_product (product_id),
  CONSTRAINT fk_tryon_job_item_job FOREIGN KEY (job_id) REFERENCES tryon_job (job_id) ON DELETE CASCADE,
  CONSTRAINT fk_tryon_job_item_product FOREIGN KEY (product_id) REFERENCES product (product_id) ON DELETE CASCADE,
  CONSTRAINT ck_tryon_job_item_garment CHECK (garment IN ('TOP', 'BOTTOM', 'DRESS'))
);

-- Kiểm tra
-- SHOW CREATE TABLE tryon_job;
-- SHOW CREATE TABLE tryon_job_item;
