# API hiện có trong source

Checkpoint 28/10/2026. Danh sách được trích từ annotation controller, không phải kết quả gọi endpoint trên server đang chạy. JAR cũ gửi kèm chưa có module catalog/kho.

## Quy ước chung

- Frontend dùng cùng origin; Vite proxy đến backend. `services/http.js` tự thêm `/api`.
- Request thay đổi dữ liệu cần token từ GET `/api/auth/csrf` và cookie phiên. Endpoint auth công khai vẫn có thể yêu cầu CSRF.
- Các API không được permitAll yêu cầu session hợp lệ. Warehouse yêu cầu OWNER/FAMILY_MEMBER ở SecurityConfig và kiểm tra quyền thao tác tiếp trong service.
- Lỗi nghiệp vụ thường có `code`, `message`; không giả định mọi lỗi của catalog có cùng envelope vì còn dùng ResponseStatusException/IllegalArgumentException.
- Product/Category hiện mới có authenticated chung, chưa có role guard riêng. Không coi đây là chính sách quyền cuối cùng.

## Phạm vi từng controller

| Controller | Quyền/ý nghĩa chính |
|---|---|
| AuthController | CSRF/capabilities/login/register/OTP/reset công khai theo cấu hình; me/logout/change/contact/link theo session/ngữ cảnh. |
| FacebookController | context/email/resend/verify theo session OAuth pending; link/status theo kiểm tra trong controller/service. |
| PasswordResetRequestController | Gửi yêu cầu reset Owner; phản hồi không lộ tài khoản có tồn tại hay không. |
| AccountController | Profile của mình; quản lý account được AccountService kiểm tra ADMIN/OWNER và scope người tạo. |
| AuditLogController | ADMIN qua AuditLogService. |
| CategoryController, ProductController | Session authenticated; còn TASK-04 về role. |
| WarehouseController | Xem: OWNER/FAMILY_MEMBER; mutation chủ yếu OWNER; Family chỉ tạo/sửa/gửi receipt của mình. |

## Danh sách endpoint

### AccountController

Nguồn: `backend/src/main/java/com/thors/module/account/controller/AccountController.java`.

| HTTP | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/api/accounts/profile` | — |
| PATCH | `/api/accounts/profile` | — |
| POST | `/api/accounts/profile/phone` | — |
| GET | `/api/accounts` | — |
| GET | `/api/accounts/summary` | — |
| GET | `/api/accounts/password-reset-requests` | — |
| GET | `/api/accounts/{id}` | — |
| POST | `/api/accounts` | — |
| PATCH | `/api/accounts/{id}` | — |
| PATCH | `/api/accounts/{id}/status` | — |
| POST | `/api/accounts/{id}/lock` | — |
| POST | `/api/accounts/{id}/unlock` | — |
| POST | `/api/accounts/{id}/reset-password` | — |

### AuditLogController

Nguồn: `backend/src/main/java/com/thors/module/account/controller/AuditLogController.java`.

| HTTP | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/api/audit-logs` | — |
| GET | `/api/audit-logs/summary` | — |
| GET | `/api/audit-logs/actions` | — |

### PasswordResetRequestController

Nguồn: `backend/src/main/java/com/thors/module/account/controller/PasswordResetRequestController.java`.

| HTTP | Đường dẫn | Ghi chú |
|---|---|---|
| POST | `/api/auth/password-reset-requests` | — |

### AuthController

Nguồn: `backend/src/main/java/com/thors/module/auth/controller/AuthController.java`.

| HTTP | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/api/auth/csrf` | — |
| GET | `/api/auth/capabilities` | — |
| GET | `/api/auth/me` | — |
| POST | `/api/auth/register` | — |
| POST | `/api/auth/login` | — |
| POST | `/api/auth/activation` | — |
| POST | `/api/auth/forgot-password` | — |
| GET | `/api/auth/otp/context` | — |
| POST | `/api/auth/otp/resend` | — |
| POST | `/api/auth/otp/verify` | — |
| POST | `/api/auth/reset-password` | — |
| POST | `/api/auth/logout` | — |
| POST | `/api/auth/change-password` | — |
| POST | `/api/auth/verify-contact` | — |
| POST | `/api/auth/google/link` | — |

### FacebookController

Nguồn: `backend/src/main/java/com/thors/module/auth/controller/FacebookController.java`.

| HTTP | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/api/auth/facebook/context` | — |
| POST | `/api/auth/facebook/email` | — |
| POST | `/api/auth/facebook/resend` | — |
| POST | `/api/auth/facebook/verify` | — |
| GET | `/api/auth/facebook/status` | — |
| POST | `/api/auth/facebook/link` | — |

### CategoryController

Nguồn: `backend/src/main/java/com/thors/module/category/controller/CategoryController.java`.

| HTTP | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/api/categories` | — |
| POST | `/api/categories` | — |
| PUT | `/api/categories/{categoryId}` | — |
| PATCH | `/api/categories/{categoryId}/status` | — |

### ProductController

Nguồn: `backend/src/main/java/com/thors/module/product/controller/ProductController.java`.

| HTTP | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/api/products` | — |
| GET | `/api/products/statistics` | — |
| GET | `/api/products/{productId}` | — |
| POST | `/api/products` | application/json |
| POST | `/api/products` | multipart/form-data |
| POST | `/api/products/batch` | application/json (Nhập hàng loạt sản phẩm & biến thể từ Excel) |
| PUT | `/api/products/{productId}` | application/json |
| PATCH | `/api/products/{productId}/status` | application/json |
| DELETE | `/api/products/{productId}` | Xóa an toàn sản phẩm chưa phát sinh lịch sử giao dịch |

### WarehouseController

Nguồn: `backend/src/main/java/com/thors/module/warehouse/WarehouseController.java`.

| HTTP | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/api/warehouse/snapshot` | — |
| GET | `/api/warehouse/documents` | Quyền và trạng thái xem WAREHOUSE_FLOW.md |
| POST | `/api/warehouse/documents` | Quyền và trạng thái xem WAREHOUSE_FLOW.md |
| PUT | `/api/warehouse/documents/{id}` | Quyền và trạng thái xem WAREHOUSE_FLOW.md |
| POST | `/api/warehouse/documents/{id}/submit` | Quyền và trạng thái xem WAREHOUSE_FLOW.md |
| POST | `/api/warehouse/documents/{id}/confirm` | Quyền và trạng thái xem WAREHOUSE_FLOW.md |
| POST | `/api/warehouse/documents/{id}/reject` | Quyền và trạng thái xem WAREHOUSE_FLOW.md |
| POST | `/api/warehouse/documents/{id}/cancel` | Quyền và trạng thái xem WAREHOUSE_FLOW.md |
| POST | `/api/warehouse/documents/{id}/close` | Quyền và trạng thái xem WAREHOUSE_FLOW.md |
| POST | `/api/warehouse/racks` | — |
| PUT | `/api/warehouse/racks/{id}` | — |
| POST | `/api/warehouse/racks/{rack}/tiers` | — |
| POST | `/api/warehouse/racks/relative` | — |
| PUT | `/api/warehouse/racks/{id}/relative` | — |
| POST | `/api/warehouse/racks/tidy` | — |
| PUT | `/api/warehouse/racks/{rack}/tiers/{id}` | — |
| POST | `/api/warehouse/moves` | — |
| PATCH | `/api/warehouse/locations/{id}` | — |
| GET | `/api/warehouse/history/{detail}` | — |
| GET | `/api/warehouse/notifications` | — |
| POST | `/api/warehouse/notifications/{id}/read` | — |
| POST | `/api/warehouse/photos` | Owner; part file |
| GET | `/api/warehouse/photos/{key}` | — |

Tổng: **72 khai báo mapping HTTP**; Product POST có hai mapping phân biệt content type.

## Hợp đồng dữ liệu quan trọng

### Chứng từ kho: POST/PUT /api/warehouse/documents

```json
{
  "type": "PURCHASE_ORDER | RECEIPT | SUPPLIER_RETURN",
  "sourceId": null,
  "manufacturer": "Tên nhà cung cấp khi là phiếu đặt",
  "note": "Ghi chú / lý do trả",
  "items": [
    { "detailId": 123, "quantity": 10, "unitPrice": 100000, "sourceItemId": null }
  ]
}
```

Đây là hình dạng minh họa, không phải payload chạy thử: thay type bằng một giá trị hợp lệ và ID bằng dữ liệu thực. RECEIPT/SUPPLIER_RETURN phải có sourceId/sourceItemId đúng loại nguồn; manufacturer được lấy từ nguồn. Tối đa 200 dòng; lượng 1–1000000, giá nguyên 0–999999999999. SUPPLIER_RETURN còn vướng schema trong dump.

Các action reject/cancel/close nhận JSON `{"reason":"lý do"}`. submit/confirm không yêu cầu body nghiệp vụ.

### Snapshot và danh sách kho

GET `/api/warehouse/snapshot` trả object có `variants`, `racks`, `tiers`, `locations`, `images`. Variant có stock_quantity, assigned_quantity, unassigned_quantity; source snapshot không trả giá catalog của biến thể. GET documents trả header kèm items, total_amount và handled_quantity trên dòng; tên trường thường snake_case.

### Chuyển vị trí

POST `/api/warehouse/moves` nhận detailId, fromLocationId/null, toShelfId/null, quantity, description, photoKeys và requestKey. requestKey được kiểm tra pattern UUID 36 ký tự; backend lưu khóa `move:<requestKey>`. Null nguồn là chưa xếp, null đích là trả về chưa xếp.

PATCH `/api/warehouse/locations/{id}` nhận description, keepImageIds, photoKeys. Chỉ Owner; vị trí còn hàng phải giữ ít nhất một ảnh. POST photos nhận multipart part `file`, trả `key`, `url`.

### Catalog và account

Product detail trả object có `product`, `variants`, `images`; model product/account thường dùng camelCase, khác Map kho snake_case. Product POST hỗ trợ JSON hoặc multipart với part `product` (JSON) và `images` (file). Không có endpoint Excel backend hoặc nhận diện ảnh AI trong các controller hiện tại.

Account list hỗ trợ q/role/status/page/size; page bắt đầu 0, size tối đa 100. Audit log có bộ lọc riêng và offset múi giờ; đọc DTO/controller trước khi thêm tham số. API client ở `features/account/api.js` phản ánh cách UI đang gọi.

### OAuth ngoài danh sách REST

Spring Security tạo điểm vào `/oauth2/authorization/google|facebook` và callback `/login/oauth2/code/google|facebook` theo cấu hình. Đây không phải mapping khai báo trực tiếp trong controller nên không tính vào tổng trên.

## Giới hạn danh sách

Warehouse documents/snapshot hiện tải danh sách tổng, chưa có phân trang API. History theo biến thể giới hạn 200 dòng; notices giới hạn 50. Khi mở rộng dữ liệu cần đo lại tải thực tế trước khi thay cấu trúc provider.
