-- Kho tri thức cho trợ lý AI trong chat (RAG) — 24/11/2026.
-- CHỈ TẠO 1 BẢNG MỚI, không sửa/xóa dữ liệu cũ. Chạy một lần sau 2026-11-20_chat.sql
-- (kiểm tra: SHOW TABLES LIKE 'chat_knowledge'; đã có thì bỏ qua).
-- Chưa chạy migration thì trợ lý vẫn chạy như cũ (tìm sản phẩm theo tên); chạy xong thì trong vòng
-- 1 phút backend tự nhận bảng, lần đồng bộ kế tiếp (30 phút một lần) sẽ tạo embedding.
-- Mọi cột thời gian lưu theo giờ UTC như các bảng khác.

-- Mỗi dòng là một đoạn kiến thức (sản phẩm / câu hỏi thường gặp / chính sách) kèm vector embedding của nó.
CREATE TABLE IF NOT EXISTS chat_knowledge (
  knowledge_id INT NOT NULL AUTO_INCREMENT,
  source_type VARCHAR(10) NOT NULL COMMENT 'PRODUCT, FAQ hoặc POLICY',
  source_key VARCHAR(50) NOT NULL COMMENT 'product_id, mã câu hỏi (faq-0...) hoặc mã chính sách (return, hours)',
  content TEXT NOT NULL COMMENT 'Nội dung đã đưa đi tạo embedding',
  content_hash CHAR(64) NOT NULL COMMENT 'SHA-256 của model + nội dung, để biết khi nào cần tạo lại',
  embedding MEDIUMBLOB NOT NULL COMMENT 'Vector float32 little-endian',
  model VARCHAR(60) NOT NULL COMMENT 'Model embedding đã dùng',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (knowledge_id),
  UNIQUE KEY uq_chat_knowledge_source (source_type, source_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
