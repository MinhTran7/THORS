-- Serial từng chiếc hàng — 16/11/2026
-- Chạy SAU 2026-11-16_variant_code_th.sql. MySQL 8 (HeidiSQL: chọn database thors_restore rồi chạy cả file, F9).
--
-- Mỗi chiếc hàng có một mã riêng: mã biến thể + "-" + số thứ tự 4 chữ số, ví dụ TH000006-0001.
-- Tồn kho vẫn tính theo số lượng như cũ; bảng product_unit là lớp đi kèm và luôn khớp:
--   số chiếc IN_STOCK của một biến thể = product_detail.stock_quantity
--   số chiếc IN_STOCK ở một ô kệ      = product_location.quantity (còn lại là "chưa xếp")
-- Trạng thái: PENDING (tem đã in khi kiểm hàng, chưa nhận) · IN_STOCK · SOLD · RETURNED_SUPPLIER (trả NCC)
--             · LOST (kiểm kê thiếu) · VOID (tem in thừa/phiếu hủy). Không xóa dòng, không dùng lại số thứ tự.

-- 0) Xem trước: số mã sẽ sinh cho hàng đang tồn (nên bằng tổng tồn)
SELECT COUNT(*) AS so_bien_the_co_hang, SUM(stock_quantity) AS so_ma_se_sinh FROM product_detail WHERE stock_quantity > 0;

-- 1) Bảng serial
CREATE TABLE IF NOT EXISTS product_unit (
  unit_id INT NOT NULL AUTO_INCREMENT,
  detail_id INT NOT NULL,
  seq INT NOT NULL COMMENT 'Số thứ tự trong biến thể, không dùng lại',
  serial_code VARCHAR(40) NOT NULL COMMENT 'TH + 6 số mã biến thể + - + 4 số thứ tự',
  status VARCHAR(20) NOT NULL,
  product_location_id INT NULL COMMENT 'Ô kệ đang chứa; NULL = chưa xếp vị trí',
  in_receipt_item_id INT NULL COMMENT 'Dòng phiếu nhập đã nhận chiếc này',
  out_order_item_id INT NULL COMMENT 'Dòng đơn bán đã xuất chiếc này',
  out_receipt_item_id INT NULL COMMENT 'Dòng phiếu trả NCC đã xuất chiếc này',
  note VARCHAR(255) NULL,
  scanned_at TIMESTAMP NULL COMMENT 'Đã quét khi kiểm hàng phiếu nhập',
  printed_at TIMESTAMP NULL COMMENT 'Lần in tem gần nhất',
  in_at TIMESTAMP NULL,
  out_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (unit_id),
  UNIQUE KEY uq_product_unit_serial (serial_code),
  UNIQUE KEY uq_product_unit_seq (detail_id, seq),
  KEY ix_product_unit_stock (detail_id, status, product_location_id),
  KEY ix_product_unit_receipt (in_receipt_item_id, status),
  CONSTRAINT fk_product_unit_detail FOREIGN KEY (detail_id) REFERENCES product_detail (detail_id),
  CONSTRAINT ck_product_unit_status CHECK (status IN ('PENDING','IN_STOCK','SOLD','RETURNED_SUPPLIER','LOST','VOID'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) Sinh mã cho toàn bộ hàng đang tồn, gắn đúng ô kệ (ô nhiều hàng trước), phần còn lại là "chưa xếp".
--    Biến thể đã có mã rồi thì bỏ qua, nên chạy lại file không sinh trùng.
SET SESSION cte_max_recursion_depth = 1000000;
SET @max_stock = (SELECT COALESCE(MAX(stock_quantity), 0) FROM product_detail);

START TRANSACTION;

INSERT INTO product_unit (detail_id, seq, serial_code, status, product_location_id, note, in_at)
WITH RECURSIVE n (k) AS (
  SELECT 1 UNION ALL SELECT k + 1 FROM n WHERE k < @max_stock
),
placed AS (
  SELECT l.detail_id, l.product_location_id,
         LEAST(l.quantity, GREATEST(0, d.stock_quantity - COALESCE(SUM(l.quantity) OVER w, 0))) AS qty,
         ROW_NUMBER() OVER (PARTITION BY l.detail_id ORDER BY l.quantity DESC, l.product_location_id) AS ord
  FROM product_location l JOIN product_detail d ON d.detail_id = l.detail_id
  WHERE l.quantity > 0 AND d.stock_quantity > 0
  WINDOW w AS (PARTITION BY l.detail_id ORDER BY l.quantity DESC, l.product_location_id
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
),
slots AS (
  SELECT detail_id, product_location_id, qty, ord FROM placed WHERE qty > 0
  UNION ALL
  SELECT d.detail_id, NULL, d.stock_quantity - COALESCE(a.assigned, 0), 1000000000
  FROM product_detail d
  LEFT JOIN (SELECT detail_id, SUM(qty) AS assigned FROM placed GROUP BY detail_id) a ON a.detail_id = d.detail_id
  WHERE d.stock_quantity - COALESCE(a.assigned, 0) > 0
),
ranged AS (
  SELECT s.detail_id, s.product_location_id, s.qty,
         COALESCE(SUM(s.qty) OVER (PARTITION BY s.detail_id ORDER BY s.ord
                                   ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS start_at
  FROM slots s
)
SELECT r.detail_id,
       r.start_at + n.k,
       CONCAT('TH', LPAD(r.detail_id, GREATEST(6, CHAR_LENGTH(r.detail_id)), '0'), '-',
              LPAD(r.start_at + n.k, GREATEST(4, CHAR_LENGTH(r.start_at + n.k)), '0')),
       'IN_STOCK',
       r.product_location_id,
       'Sinh mã cho hàng tồn khi bắt đầu dùng serial',
       CURRENT_TIMESTAMP
FROM ranged r
JOIN n ON n.k <= r.qty
WHERE NOT EXISTS (SELECT 1 FROM product_unit u WHERE u.detail_id = r.detail_id);

COMMIT;

-- 3) Kiểm tra: hai câu dưới phải trả về 0 dòng
-- 3a) Số mã trong kho khác tổng tồn
SELECT d.detail_id, d.stock_quantity, COUNT(u.unit_id) AS so_ma
FROM product_detail d LEFT JOIN product_unit u ON u.detail_id = d.detail_id AND u.status = 'IN_STOCK'
GROUP BY d.detail_id, d.stock_quantity
HAVING COUNT(u.unit_id) <> d.stock_quantity;
-- 3b) Số mã ở một ô kệ khác số lượng của ô đó
SELECT l.product_location_id, l.detail_id, l.quantity, COUNT(u.unit_id) AS so_ma
FROM product_location l LEFT JOIN product_unit u ON u.product_location_id = l.product_location_id AND u.status = 'IN_STOCK'
WHERE l.quantity > 0
GROUP BY l.product_location_id, l.detail_id, l.quantity
HAVING COUNT(u.unit_id) <> l.quantity;
-- (Nếu tổng số lượng các ô của một biến thể lớn hơn tồn của nó — dữ liệu cũ bị lệch — 3b có thể còn dòng;
--  ứng dụng tự xếp theo ô nhiều hàng trước, không ảnh hưởng tổng.)

-- Ví dụ xem mã của một biến thể:
-- SELECT serial_code, status, product_location_id FROM product_unit WHERE detail_id = 6 ORDER BY seq;

-- Hoàn tác (xóa toàn bộ serial; ứng dụng vẫn chạy như trước khi có serial):
-- DROP TABLE product_unit;
