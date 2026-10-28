# Công việc còn lại và điểm cần xử lý

Checkpoint 28/10/2026. Lượt này hoàn thành tài liệu; các task dưới đây **chưa được sửa**. Mức ưu tiên là đề xuất dựa trên ảnh hưởng kỹ thuật, không khẳng định đây là thứ tự công việc người dùng đã duyệt.

## Tổng quan

| ID | Ưu tiên | Trạng thái | Việc cần tiếp tục |
|---|---|---|---|
| TASK-01 | P0 | Đã xác nhận từ JAR/script | Chạy backend đúng source mới thay vì JAR cũ. |
| TASK-02 | P0 | Đã xác nhận từ router | Nối lại các route sản phẩm/danh mục/hồ sơ/Family/log còn thiếu. |
| TASK-03 | P0 | Đã xác nhận từ dump + source | Thống nhất schema cho trả nhà cung cấp. |
| TASK-04 | P1 | Đã thấy thiếu kiểm tra trong source | Chốt và áp dụng quyền cho API Product/Category. |
| TASK-05 | P1 | Script thiếu, chưa chạy lại Java tests | Khôi phục test kho và bổ sung kiểm tra nghiệp vụ quan trọng. |
| TASK-06 | P1 | Có code, chưa kiểm chứng đầu cuối | Thử Excel bằng file thật cho cả đặt/nhập hàng. |
| TASK-07 | P1 | Có code, cần kiểm chứng UI/DB | Kiểm tra sơ đồ 2D và đồng bộ hình học frontend/backend. |
| TASK-08 | P1 | Có cấu hình, chưa kiểm chứng dịch vụ | Kiểm tra auth/OAuth/ảnh trên môi trường người dùng. |
| TASK-09 | P2 | Tài liệu/định hướng chưa đồng bộ | Cập nhật README/cấu hình mẫu/nhãn và hành vi còn dở. |
| TASK-10 | Backlog | Chưa thấy module source | POS, online sales, payment/shipping, AI và background jobs. |

## TASK-01 — JAR gửi kèm không chứa module mới

**Bằng chứng:** mở cấu trúc JAR `backend/target/thors-backend-0.2.0.jar` chỉ thấy 49 class ứng dụng, không có package warehouse/product/category. Source hiện có ba nhóm đó. `scripts/start-backend.ps1` và `.sh` chạy `java -jar` nếu JAR tồn tại.

**Ảnh hưởng dự kiến:** frontend gọi `/api/warehouse/...` hoặc catalog nhưng backend đang chạy không có controller tương ứng. Tên/version JAR giống nhau không bảo đảm nó được build từ source hiện tại.

**Hướng tiếp tục:** trên máy có Maven/JDK, build lại từ source; sau đó khởi động JAR mới hoặc chạy `mvn spring-boot:run` từ backend. Không ghi đè cấu hình DB thật chỉ để thử khởi động.

**Đạt khi:** xác nhận process chạy đúng source; các API auth/catalog/warehouse tồn tại và trả phản hồi đúng quyền, không chỉ nhìn thấy log “server started”.

## TASK-02 — Có màn hình nhưng thiếu route

**Bằng chứng:** router hiện tại chỉ nối auth/workspace/profile/accounts/warehouse. `navigation.jsx` và các Link/navigate trong component có đường dẫn chưa khai báo.

| Nhóm đường dẫn cần nối/đối chiếu | Component đã có |
|---|---|
| `/products`, đường dẫn tạo/chi tiết/sửa sản phẩm | ProductPage, AddProductPage, ProductDetailPage, EditProductPage. |
| `/categories` | CategoryPage. |
| `/staff`, đường dẫn tạo/chi tiết/sửa theo Link/navigate hiện có | StaffListPage, StaffFormPage, StaffDetailPage. |
| `/system-log` | SystemLogPage. |
| `/profile/edit`, `/profile/password` | UpdateProfilePage, ChangePasswordPage. |

Không mặc định mọi path tạo mới là `/new`: cần đọc Link/navigate đang dùng trước khi chọn route. Layout hoạt động là `ThorsLayout`, còn `layouts/navigation.jsx` không được layout này dùng để dựng menu hiện tại.

**Đạt khi:** nút từ workspace/profile/list mở đúng trang; refresh/direct URL hoạt động; role không phù hợp bị chặn; không xóa route kho mới khi khôi phục nhóm route cũ.

## TASK-03 — SUPPLIER_RETURN bị CHECK từ chối

**Bằng chứng:** `WarehouseRequests.Document.type` và `WarehouseDocuments.returnStock()` dùng `SUPPLIER_RETURN`. Dump giới hạn:

| Vị trí | Giá trị hiện được dump cho phép |
|---|---|
| `stock_receipt.ck_receipt_type` | `PURCHASE_ORDER`, `RECEIPT`. |
| `stock_adjustment.ck_stock_adjustment_1` | `ADJUSTMENT`, `RECEIPT`, `ORDER_OUT`, `MOVE`, `RESTOCK`. |

Nếu DB đang chạy đúng các CHECK này, tạo phiếu trả và ghi movement trả sẽ bị từ chối. Đây là suy luận trực tiếp từ schema/code; chưa thực hiện INSERT để tái hiện trên DB thật.

**Hướng tiếp tục:** đối chiếu `SHOW CREATE TABLE` của hai bảng trên môi trường phù hợp. Nếu nghiệp vụ trả NCC tiếp tục dùng loại riêng, phải thống nhất cả constraint của chứng từ lẫn movement và cách kiểm thử/rollback; không chỉ đổi một dòng UI hoặc bỏ CHECK chung. Có thể cần thay đổi schema, nhưng lượt tài liệu chưa thực hiện/ủy quyền việc đó.

**Đạt khi:** phiếu trả tạo/gửi/xác nhận được; trừ đúng tổng tồn, xử lý phần chưa xếp trước rồi vị trí, ghi lịch sử; xác nhận lại không trừ lần hai; lỗi bất kỳ phải rollback toàn bộ.

## TASK-04 — Quyền API catalog chưa được kiểm soát riêng

Product/Category controller không gọi SessionAccess/kiểm tra role riêng; SecurityConfig yêu cầu authenticated chung cho các đường dẫn này. Chặn menu hay route frontend không đủ để chặn gọi API trực tiếp.

**Hướng tiếp tục:** chốt quyền xem/quản trị catalog theo vai trò; áp dụng ở backend và phản ánh trong route/menu. Không dùng ma trận quyền kho để tự suy ra mọi quyền của catalog.

**Đạt khi:** kiểm tra trực tiếp GET/POST/PUT/PATCH bằng từng vai trò; người chưa đăng nhập và vai trò không có quyền nhận kết quả phù hợp; thao tác hợp lệ vẫn hoạt động.

## TASK-05 — Thiếu kiểm thử kho có thể chạy

`frontend/package.json` có `test:warehouse`, nhưng `frontend/tests/run-warehouse.mjs` không có trong ZIP. Ba file test Java có tổng 55 `@Test`, chủ yếu auth/Facebook/OTP key; `test-schema.sql` chỉ tạo role/user/audit_log, không bao phủ các bảng kho.

**Hướng tiếp tục:** tìm lại test gốc nếu đã viết; nếu phải tạo bổ sung, tập trung quy tắc có rủi ro dữ liệu: nhập đúng một lần, nhập vượt nguồn, race, rollback, quyền Family, trả NCC, gán/chuyển không đổi tổng tồn và collision kệ. Dùng DB test tách biệt; không trỏ test-schema vào DB người dùng đang dùng.

**Đạt khi:** lệnh test được khai báo thực sự chạy; kết quả có ngày/phiên bản; không coi “không lỗi cú pháp” là đã qua nghiệp vụ kho.

## TASK-06 — Excel đã có code, cần thử với dữ liệu thật

**Giữ lại triển khai hiện có:** `ExcelImportDialog.jsx`, `excelImport.js`, `excelWorkbook.js`, `DocumentForm.jsx`. Yêu cầu là hỗ trợ cả phiếu đặt và phiếu nhập; source đã có hai nhánh này.

**Cần thử:** sheet/header thực tế, mã nội bộ và mã NCC khác nhau, tên trùng, thiếu màu/size, số có dấu phân cách, công thức, dòng trùng khác giá, nhiều NCC trong một file, file 2.000 dòng, giới hạn 200 biến thể, lượng nhập vượt phần còn lại, thay thế dòng đã có trên form.

**Đạt khi:** preview lỗi rõ; chọn/sửa/bỏ dòng được; áp dụng không tự ghi DB; lưu nháp không tăng tồn; chỉ Owner confirm receipt mới tăng tồn. Không nhận `.xls` như thể đã hỗ trợ; hiện chỉ `.xlsx`.

## TASK-07 — Sơ đồ kho và ảnh vị trí

Có cặp `RackGeometry.java`/`rackLayout.js`: width 190, gap 24, chiều cao theo số tầng, giới hạn tọa độ 0–1800. Có chuẩn hóa bố cục cũ, kéo kệ, đặt tương đối và xếp gọn. Chưa xem UI thực tế của checkpoint.

**Cần thử:** kho bốn kệ; nhiều số tầng; màn hình nhỏ; chồng lấn, kéo sát mép, thêm tầng làm kệ cao hơn; kệ/tầng bị ẩn còn hàng; Owner so với Family; vị trí mới thiếu ảnh/mô tả; chuyển ra khỏi tầng FULL.

**Đạt khi:** FE/BE thống nhất tọa độ; không chồng kệ; dữ liệu sau tải lại đúng điều đã lưu. Lưu ý snapshot chuẩn hóa tọa độ cho hiển thị có thể khác tọa độ thô trong DB; thao tác ghi/bố cục mới thực hiện lưu chuẩn hóa.

## TASK-08 — Cấu hình đã có khác với dịch vụ đã chạy thử

local.properties có giá trị DB/SMTP/Google/Cloudinary; user trước đây báo đã sửa lỗi Cloudinary. Chưa xác minh delivery email, OAuth callback/link và upload ảnh thật trong lượt này.

Cần kiểm tra đúng ba đường ảnh: catalog backend signed upload, avatar frontend unsigned upload, kho local. Mẫu local.properties chưa có Cloudinary/Facebook đầy đủ; `.env.example` chưa có cấu hình avatar. Không chép secret vào docs hoặc biến Vite.

**Đạt khi:** có bằng chứng chạy trên source mới cho các luồng được người dùng giao; số điện thoại vẫn là liên hệ nếu chưa có yêu cầu đổi auth.

## TASK-09 — Nợ tích hợp/tài liệu

- README gốc trỏ đến nhiều docs/file SQL không còn có trong ZIP; nói auth-only, SMS/phone login, DB thors và JAR build sẵn. Bộ docs mới là checkpoint bổ sung; chưa sửa README gốc.
- Một số yêu cầu duyệt cũ có bước yêu cầu chỉnh sửa/thông báo người tạo, nhưng source hiện chỉ có DRAFT/PENDING/CONFIRMED/REJECTED/CANCELLED/CLOSED và thông báo Owner. Cần chốt nếu muốn thêm luồng sửa sau bị từ chối.
- Nhà cung cấp hiện là chuỗi tổng hợp từ phiếu, chưa có danh bạ/công nợ. Không tạo thêm bảng Supplier chỉ để đổi tên màn hình.
- `services/productService.js` còn ba hàm handler UI không dùng ở cuối file; lint riêng file báo ba no-unused-vars. Chúng còn tham chiếu state của component; nên dọn khi sửa module liên quan.
- Đồng bộ tên Family/Staff và menu sau khi chốt quyền; không xóa role STAFF khỏi DB theo nhãn UI.

## TASK-10 — Backlog toàn dự án

POS, cửa hàng online, đơn bán, payment/refund/shipping, promotions, ca làm, báo cáo và DINOv2 là định hướng có DB/bối cảnh nhưng chưa có module thực thi. Không đưa chúng vào phạm vi sửa kho hoặc docs nếu người dùng chưa yêu cầu.

## Thông tin cần lấy khi tiếp tục

Với kiểm tra UI, cần biết người dùng chạy bằng IDE/source hay script/JAR. Với Excel, file thực tế sẽ giúp xác định header/định danh. Với thay đổi DB, cần đối chiếu schema đang chạy và thống nhất phạm vi trước. Các câu hỏi này phục vụ task tương ứng, không phải lý do trì hoãn công việc đọc/viết tài liệu đã được giao.
