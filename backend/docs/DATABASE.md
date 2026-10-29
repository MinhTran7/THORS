# Database và quan hệ dữ liệu

## Nguồn và tên database

`database/SQL_v1.sql` là dump MySQL do người dùng gửi kèm dự án, header ghi MySQL 8.4.11/HeidiSQL. Dump có **29 bảng**, mở đầu bằng `CREATE DATABASE IF NOT EXISTS thors_restore` và `USE thors_restore`.

`backend/local.properties` trong ZIP cũng chọn **thors_restore**. Giá trị mặc định ở `application.yml` và file `.example` còn chọn `thors`. Nếu khởi động nhầm cấu hình, ứng dụng có thể đang đọc database khác dù cùng host. Tài liệu không chép thông tin kết nối bí mật hoặc dữ liệu tài khoản thật.

Backend chính không tự khởi tạo SQL (`spring.sql.init.mode=never`), không có Flyway/Liquibase và không dùng JPA schema generation. `StartupChecks` chỉ thăm dò những cột auth quan trọng trong user/role/audit_log; startup thành công chưa xác nhận toàn bộ schema kho tương thích.

Không coi dump là bước bắt buộc phải chạy lại trên DB hiện có. Nếu cần môi trường kiểm thử, tạo một database tách biệt và kiểm tra rõ database đích trước khi restore.

## Nhóm bảng

| Nhóm | Bảng | Tình trạng source |
|---|---|---|
| Danh tính | role, user, audit_log | Được auth/account sử dụng trực tiếp. |
| Catalog | category, product, product_detail, product_image | Có API/backend và các trang; còn thiếu route frontend. |
| Vị trí | rack, shelf_level, product_location, product_location_image | Module kho sử dụng trực tiếp. |
| Chứng từ/biến động kho | stock_receipt, stock_receipt_item, stock_adjustment | Có source; loại SUPPLIER_RETURN lệch CHECK trong dump. |
| Thông báo | notification, user_notification | Kho dùng thông báo chờ duyệt/thiếu hàng. |
| Giỏ/đơn/hóa đơn/thanh toán | cart, cart_item, orders, order_item, invoice, payment | Có schema; chưa có module nghiệp vụ tương ứng. |
| Khuyến mại | promotion, discount_code | Có schema; chưa có module tương ứng. |
| Đổi trả khách | return_request, return_request_item | Khác trả NCC; chưa có module tương ứng. |
| AI | image_search | Có schema; chưa thấy pipeline tìm ảnh. |
| Ca làm | work_shift, shift_change_request | Có schema; chưa có module tương ứng. |

Từ điển đủ cột/khóa của từng bảng nằm trong [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md), được trích từ CREATE TABLE và không chứa INSERT dữ liệu.

## Quan hệ cốt lõi

- `role.role_id → user.role_id`; `audit_log.user_id` lưu actor, `entity_id` lưu đối tượng theo từng loại action.
- `category → product → product_detail`; mọi nghiệp vụ kho tham chiếu **detail_id của biến thể**, không chỉ product_id.
- `product → product_image`; ảnh vị trí nằm ở bảng khác, không dùng chung ý nghĩa.
- `rack → shelf_level → product_location`; một biến thể có thể ở nhiều tầng; UNIQUE `(detail_id, shelf_level_id)` ngăn trùng dòng cùng vị trí.
- `product_location → product_location_image`; xóa mềm ảnh bằng deleted_at, có thể giữ location quantity=0 để bảo toàn thông tin.
- `stock_receipt → stock_receipt_item`; header có source_receipt_id tự tham chiếu, item có source_receipt_item_id tự tham chiếu.
- `stock_adjustment` ghi delta tổng tồn, lượng thao tác, vị trí nguồn/đích và liên kết dòng chứng từ; idempotency_key là khóa chống ghi lại cùng thao tác.
- `notification → user_notification → user`; mỗi user có trạng thái đọc riêng.

## Những giá trị không phải cột thật trong user

AccountRepository.SELECT tạo các alias bằng truy vấn audit_log:

| Giá trị trong Java | Cách suy ra hiện tại |
|---|---|
| Liên kết Google | Action GOOGLE_LINK, new_value; có hàm khóa hóa subject. |
| Liên kết Facebook | Action FACEBOOK_LINK, tra cứu theo subject đã xử lý. |
| Người tạo tài khoản | Action ACCOUNT_CREATE đầu tiên cho entity user. |
| Phiên bản thu hồi phiên | MAX(log_id) của PASSWORD_INVALIDATE/STATUS_INVALIDATE. |

Không thêm cột auth_version/google_subject/created_by vào user chỉ vì thấy thuộc tính Java. Audit log hiện là một phần dữ liệu chức năng; xóa lịch sử auth có thể mất liên kết/quyền người tạo hoặc thay đổi kiểm tra phiên.

OTP sử dụng các cột `verification_code_hash`, `verification_expires_at`, `verification_attempt_count` trong user, kết hợp audit_log cho lần gửi/giới hạn/lock. Không có bảng verification_code riêng trong dump này.

## Bất biến tồn kho

Với mỗi detail_id:

`total_stock = product_detail.stock_quantity`

`assigned_stock = SUM(product_location.quantity)`

`unassigned_stock = total_stock - assigned_stock`

Phải giữ `total_stock >= assigned_stock >= 0`. Không có một dòng product_location đặc biệt cho “chưa xếp”; đây là giá trị suy ra. Số còn thiếu của đơn đặt được tính từ quantity nguồn trừ tổng các receipt đã CONFIRMED, không phải unassigned_stock.

Xem `WAREHOUSE_FLOW.md` để biết lúc nào tăng/giảm tổng tồn. Tạo mới biến thể catalog hiện ghi stock_quantity=0 và online_sales_enabled=0; nhập kho là nghiệp vụ riêng.

## Chênh lệch xác nhận được giữa dump và source

| Vị trí | Dump | Source | Kết luận |
|---|---|---|---|
| stock_receipt.receipt_type | CHECK chỉ PURCHASE_ORDER/RECEIPT | Có SUPPLIER_RETURN | Phiếu trả không hợp lệ nếu DB thật giữ CHECK này. |
| stock_adjustment.movement_type | CHECK chỉ ADJUSTMENT/RECEIPT/ORDER_OUT/MOVE/RESTOCK | returnStock ghi SUPPLIER_RETURN | Cần xử lý cả constraint movement, không chỉ header phiếu. |

Đây là kiểm tra tĩnh. Chưa đọc schema từ DB online hoặc thử ghi dữ liệu. Đối chiếu an toàn khi có nhu cầu và quyền truy cập:

```sql
SELECT DATABASE();
SHOW CREATE TABLE stock_receipt;
SHOW CREATE TABLE stock_adjustment;
```

Các lệnh này chỉ đọc. Tài liệu không kèm lệnh ALTER tự áp dụng vì hướng thay đổi chưa được chốt.

## Dữ liệu và file ngoài database

Dump có dữ liệu cho account/catalog/kệ/tầng và một số bảng log/thông báo; có bốn kệ và 20 tầng trong phần INSERT. Không dùng AUTO_INCREMENT làm số lượng bản ghi. Không sao chép email/phone/hash hoặc nội dung audit có thông tin thật vào context bàn giao.

URL ảnh Cloudinary trỏ tài nguyên ngoài DB; ảnh kho local cần file tại thư mục cấu hình. Chỉ có dump không bảo đảm có đủ ảnh gốc hoặc cấu hình dịch vụ. `test-schema.sql` là schema H2 tối giản phục vụ auth, không phải bản thay thế cho toàn bộ 29 bảng.
