# Đề xuất schema: nhận hàng ngoại lệ và trả nhà cung cấp

**Trạng thái: ĐỀ XUẤT, CHƯA CHẠY trên bất kỳ database nào.** Lập 04/11/2026 khi triển khai luồng Đặt hàng nhập. Cần chủ dự án quyết định trước khi áp dụng.

## Vì sao cần

Code hiện tại (sau đợt 04/11/2026) làm được: chọn nhà cung cấp trước, chọn hàng/Excel/tạo nhanh, tiến độ nhận, nhập nhiều đợt, đóng phần thiếu, hủy phiếu đặt đã xác nhận chưa nhập, sao chép, chống xác nhận cũ/trùng. Các yêu cầu dưới đây **bị chặn có chủ đích** vì không có chỗ lưu bền vững, và theo quy tắc dự án không được nhét vào `note`, JSON hay `audit_log`:

| Yêu cầu | Thiếu gì trong schema hiện tại |
|---|---|
| Nhận vượt (đặt 100, giao 110): Family ghi số thực giao, Owner duyệt/từ chối phần vượt, lưu giá + lý do | Không có cột số giao, quyết định ngoại lệ, lý do, người/thời điểm duyệt, lượng vượt đã duyệt |
| Nhận thay thế (đặt M, giao L): Owner chấp nhận/từ chối có lý do | Liên kết `source_receipt_item_id` + `detail_id` khác **đã biểu diễn được**, nhưng thiếu quyết định + lý do theo dòng |
| Đổi giá thực nhập có Owner duyệt | `unit_price` trên dòng nhập đã có, nhưng thiếu lý do + quyết định |
| Phân biệt số giao / số chấp nhận / số từ chối | Chỉ có `quantity` (= số nhập); `ck_stock_receipt_item_1` bắt buộc `quantity > 0` |
| Hàng từ chối tại cửa “Chờ trả — chưa nhập kho” | Không có chỗ ghi hàng đang giữ hộ (không được cộng vào `stock_quantity`) |
| Trả sau nhập với lựa chọn “Chờ giao bù” / “Không nhận tiếp” | Không có cột lựa chọn; hiện tại trả hàng **không** mở lại nghĩa vụ (= “Không nhận tiếp”) |
| Trả nhà cung cấp chạy được trên DB theo dump (đã tách thành `database/migrations/2026-11-04_supplier_return.sql`, có thêm status `APPROVED`; khi chạy script đó thì bỏ 2 CHECK trùng ở khối dưới) | `stock_receipt.ck_receipt_type` và `stock_adjustment.ck_stock_adjustment_1` không có `SUPPLIER_RETURN` (TASK-03) |

## Thay đổi tối thiểu đề xuất (không thêm bảng — vẫn 29 bảng)

Chỉ thêm cột vào `stock_receipt_item` và mở rộng 3 CHECK. Kiểm tra tên constraint thật bằng `SHOW CREATE TABLE` trước khi chạy.

```sql
-- ĐỀ XUẤT – CHƯA CHẠY. Sao lưu DB và thử trên bản sao trước.
ALTER TABLE stock_receipt
  DROP CHECK ck_receipt_type,
  ADD CONSTRAINT ck_receipt_type CHECK (receipt_type IN ('PURCHASE_ORDER','RECEIPT','SUPPLIER_RETURN'));

ALTER TABLE stock_adjustment
  DROP CHECK ck_stock_adjustment_1,
  ADD CONSTRAINT ck_stock_adjustment_1 CHECK (movement_type IN
    ('ADJUSTMENT','RECEIPT','ORDER_OUT','MOVE','RESTOCK','SUPPLIER_RETURN'));

ALTER TABLE stock_receipt_item
  -- Dòng phiếu nhập: quantity = số được chấp nhận nhập kho.
  ADD COLUMN delivered_quantity INT NULL COMMENT 'Số NCC giao thực tế (phiếu nhập)',
  ADD COLUMN rejected_quantity INT NOT NULL DEFAULT 0 COMMENT 'Số từ chối tại cửa, không vào tồn',
  ADD COLUMN held_quantity INT NOT NULL DEFAULT 0 COMMENT 'Hàng từ chối đang giữ chờ NCC lấy, không thuộc tồn bán được',
  ADD COLUMN held_released_at DATETIME NULL COMMENT 'Thời điểm NCC đã lấy lại hàng giữ hộ',
  -- Quyết định ngoại lệ của Owner (vượt / thay thế / đổi giá), lưu theo dòng.
  ADD COLUMN exception_status VARCHAR(20) NULL COMMENT 'PENDING / APPROVED / REJECTED',
  ADD COLUMN approved_over_quantity INT NULL COMMENT 'Lượng vượt Owner đã duyệt tại thời điểm duyệt',
  ADD COLUMN exception_reason VARCHAR(255) NULL,
  ADD COLUMN decided_by INT NULL,
  ADD COLUMN decided_at DATETIME NULL,
  -- Dòng phiếu trả NCC.
  ADD COLUMN return_followup VARCHAR(20) NULL COMMENT 'AWAIT_REPLACEMENT / NO_FURTHER',
  ADD CONSTRAINT fk_receipt_item_decided_by FOREIGN KEY (decided_by) REFERENCES `user`(user_id),
  DROP CHECK ck_stock_receipt_item_1,
  ADD CONSTRAINT ck_stock_receipt_item_1 CHECK (quantity >= 0 AND (quantity > 0 OR rejected_quantity > 0)),
  ADD CONSTRAINT ck_stock_receipt_item_2 CHECK (rejected_quantity >= 0 AND held_quantity >= 0 AND held_quantity <= rejected_quantity),
  ADD CONSTRAINT ck_stock_receipt_item_3 CHECK (delivered_quantity IS NULL OR delivered_quantity = quantity + rejected_quantity),
  ADD CONSTRAINT ck_stock_receipt_item_4 CHECK (exception_status IS NULL OR exception_status IN ('PENDING','APPROVED','REJECTED')),
  ADD CONSTRAINT ck_stock_receipt_item_5 CHECK (return_followup IS NULL OR return_followup IN ('AWAIT_REPLACEMENT','NO_FURTHER'));
```

## Quy tắc code sẽ áp dụng nếu được duyệt

- Thay thế: dòng nhập có `detail_id` khác dòng đặt nguồn ⇒ bắt buộc `exception_status`; chỉ `APPROVED` mới tính vào nghĩa vụ dòng gốc; tồn chỉ tăng biến thể thực nhận.
- Vượt: Owner duyệt ghi `approved_over_quantity` = phần vượt tính lại trong transaction lúc xác nhận. Nếu số liệu đổi (đợt khác vừa xác nhận) thì trả `WAREHOUSE_STALE`, không tái sử dụng quyết định cũ. Không áp tỷ lệ vượt cố định.
- Đổi giá: `unit_price` dòng nhập ≠ giá đặt ⇒ cần `APPROVED` + lý do; không sửa giá đặt gốc, không đổi giá bán catalog. Tổng tiền mua thực tế = Σ quantity × unit_price dòng nhập.
- Từ chối tại cửa: `rejected_quantity`/`held_quantity`, không ghi `stock_adjustment`, không cộng tồn.
- Trả sau nhập: `AWAIT_REPLACEMENT` cộng lại vào phần còn thiếu của dòng đặt (khi đơn còn CONFIRMED); `NO_FURTHER` giữ nguyên. Trả hàng vượt đã duyệt không tạo nghĩa vụ mới.

## Ngoài phạm vi nhưng phát hiện khi làm

`WarehouseLayout.snapshot()` và `WarehouseBarcodes` dùng `product_detail.barcode`, cột này **không có** trong `database/SQL_v1.sql`. Nếu DB đang chạy giống dump, toàn bộ màn hình kho (snapshot) sẽ lỗi. Không sửa trong đợt này; cần đối chiếu DB thật.

## Giá bán chưa thiết lập (`product_detail.price` NULL) — đề xuất 04/11/2026, CHƯA CHẠY

Chủ dự án đã đồng ý hướng **giá bán tùy chọn** khi tạo nhanh hàng trong phiếu đặt. Schema hiện tại: `price decimal(12,0) NOT NULL` + `ck_product_detail_1 CHECK (price >= 0)`.

```sql
-- ĐỀ XUẤT – CHƯA CHẠY. Sao lưu và thử trên bản sao trước. Không đổi giá đang có.
ALTER TABLE product_detail
  MODIFY COLUMN price DECIMAL(12,0) NULL
  COMMENT 'Giá bán VNĐ; NULL = chưa thiết lập giá bán, không được bán';
-- Giữ nguyên ck_product_detail_1 CHECK (price >= 0): MySQL coi NULL là đạt CHECK,
-- còn giá có giá trị vẫn phải không âm. Kiểm tra lại bằng SHOW CREATE TABLE product_detail.

-- Hoàn tác (chỉ chạy được khi không còn dòng NULL):
-- ALTER TABLE product_detail MODIFY COLUMN price DECIMAL(12,0) NOT NULL COMMENT 'VNĐ, không có phần lẻ';
```

**Trước khi chạy SQL:** để trống giá bán trong form tạo nhanh sẽ bị backend trả `SALE_PRICE_REQUIRED_BY_DATABASE` (không tạo gì). Nhập giá bán thì vẫn tạo bình thường.

**Phạm vi code đã chuẩn bị (đã kiểm thử trên H2 sau khi mô phỏng ALTER):**

| Luồng | Xử lý khi `price IS NULL` |
|---|---|
| Tạo nhanh trong phiếu đặt (`WarehouseCatalog`, `ProductService.createProduct(request, true)`) | Ghi NULL; không bao giờ ghi 0 hoặc giá nhập. Trang thêm sản phẩm thông thường vẫn bắt buộc giá. |
| Sửa sản phẩm (`ProductService.updateProduct`, `EditProductPage`) | Biến thể đang NULL được để trống; không xóa được giá đã có; biến thể thêm mới vẫn bắt buộc giá. |
| Bán tại quầy (`InStoreSalesService`, `InStoreSalesPage`) | Backend trả lỗi “Chưa thiết lập giá bán”; frontend khóa chọn biến thể và hiển thị nhãn này thay vì 0 ₫. |
| Online: cửa hàng, giỏ hàng, checkout (`ShopRepository`, `CartRepository`, `CheckoutRepository`) | Biến thể bị loại khỏi trang cửa hàng; `available = false` nên không thêm giỏ/đặt được. |
| Hiển thị quản lý sản phẩm (`ProductPage`, `ProductDetailPage`) | “Chưa thiết lập giá bán”; `MIN/MAX(price)` bỏ qua NULL. |
| Đơn mẫu (`OrderRepository.createSampleOrder`, `ReturnRepository.seedSampleOrder`) | Chỉ chọn biến thể có giá. |

Không có luồng nào trong backend bật `online_sales_enabled`; nếu sau này thêm, cần chặn bật khi giá NULL.
