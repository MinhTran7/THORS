# Đọc trước khi tiếp tục THORS

**Ngày lập: 28/10/2026 · Nguồn: `THORS_Git.zip` do người dùng cung cấp.**

## 1. Dự án là gì?

THORS (TH Omnichannel Retail System) là dự án DATN về quản lý cửa hàng/bán hàng và kho. Định hướng gồm bán tại quầy, cửa hàng online dùng chung tồn kho, tra cứu sản phẩm bằng ảnh và sơ đồ vị trí kho 2D. Snapshot hiện có tập trung vào xác thực, tài khoản, sản phẩm/danh mục và quản lý kho; các nghiệp vụ bán hàng/AI chưa có triển khai tương ứng.

Frontend là React 19 + Vite 8 + MUI 9; backend là Spring Boot 3.5.7/Java 17 dùng JDBC; database là **MySQL**, không phải SQL Server. Bản dump có 29 bảng. `backend/local.properties` đang chọn `thors_restore`, trùng tên database trong `database/SQL_v1.sql`. Cấu hình mẫu và mặc định còn dùng tên `thors`.

## 2. Ba điểm cần biết ngay

1. **JAR đóng gói trong ZIP là bản cũ.** Kiểm tra nội dung `backend/target/thors-backend-0.2.0.jar` không thấy class thuộc module `warehouse`, `product`, `category`. Các script khởi động ưu tiên chạy JAR này nếu nó tồn tại. Phải build lại từ source hoặc chạy source đúng cách trước khi đánh giá API mới. Xem `TASK-01`.
2. **Router hiện tại thiếu nhiều trang đã có code.** `frontend/src/routes/index.jsx` đã nối auth, workspace, profile, accounts và các trang kho; chưa nối products/categories/staff/system-log/profile edit/password. Không được kết luận các trang đó chưa được viết. Xem `TASK-02`.
3. **Trả nhà cung cấp lệch schema.** Code dùng `SUPPLIER_RETURN`, nhưng `stock_receipt.ck_receipt_type` và `stock_adjustment.ck_stock_adjustment_1` trong dump không cho phép giá trị này. Cần đối chiếu schema DB thật trước khi chốt hướng sửa; chưa thực hiện migration trong lượt bàn giao. Xem `TASK-03`.

## 3. Những gì đã có trong source

| Nhóm | Trạng thái ngắn |
|---|---|
| Auth | Đăng ký/đăng nhập **email**, OTP email, kích hoạt, quên/đổi mật khẩu, logout, Google, Facebook. Google/Facebook cần cấu hình dịch vụ thật để kiểm chứng. |
| Account | Hồ sơ, cập nhật, danh sách/chi tiết, tạo tài khoản nội bộ, trạng thái/khóa/mở khóa, reset bởi quản lý, audit log. Một số màn hình chưa nối router. |
| Catalog | Category list/create/update/status; Product list/detail/statistics/create/update/status, biến thể và ảnh Cloudinary. Chưa nối router quản trị hiện tại. |
| Warehouse | Tồn kho; phiếu đặt/nhập/trả; nhà cung cấp tổng hợp từ chứng từ; kệ/tầng; sơ đồ 2D; gán/chuyển vị trí; ảnh thực tế; lịch sử và thông báo kho. |
| Excel | Đã có code nhập `.xlsx` cho **cả phiếu đặt và phiếu nhập**: chọn sheet/header, ghép cột, preview, sửa/chọn biến thể, kiểm tra trùng, tải mẫu. Cần thử với file thực tế. |
| Chưa thấy triển khai | POS/checkout/giỏ hàng, thanh toán/vận chuyển thực tế, khuyến mại, ca làm, DINOv2/image search, các background job nghiệp vụ. Có bảng DB không có nghĩa là module đã được viết. |

**SMS và đăng nhập bằng số điện thoại đang bị tắt ở luồng auth hiện tại.** `AuthController.capabilities()` trả `sms=false`; `AuthService` chuẩn hóa email; `OtpService` chỉ nhận `EMAIL`. Code Twilio và chuẩn hóa phone còn được giữ cho liên hệ/di sản. README gốc nói khác vì đã cũ.

## 4. Quy tắc kho phải giữ

- Chỉ `OWNER` và `FAMILY_MEMBER` vào kho. `ADMIN`, `STAFF`, `CUSTOMER` bị chặn ở cả router và backend warehouse.
- `OWNER` quản lý bố cục/vị trí, đặt hàng, trả hàng và xác nhận chứng từ. `FAMILY_MEMBER` được xem, tạo/sửa/gửi phiếu nhập nháp của mình; không tự làm tăng tồn.
- Xác nhận phiếu đặt **không tăng tồn**. Chỉ Owner xác nhận phiếu nhập mới tăng `product_detail.stock_quantity`.
- Phiếu nhập phải liên kết phiếu đặt đã xác nhận; giá và giới hạn lượng nhập lấy từ dòng nguồn. Có thể nhập nhiều đợt.
- Gán/chuyển/rút hàng khỏi vị trí **giữ nguyên tổng tồn**. `unassigned = stock_quantity − SUM(product_location.quantity)`.
- “Còn thiếu của phiếu đặt” là hàng chưa nhập; “chưa xếp vị trí” là hàng đã tồn trong kho nhưng chưa gán kệ/tầng.
- Vị trí mới cần mô tả và ít nhất một ảnh thực tế. Không dùng ảnh catalog thay cho ảnh sản phẩm tại vị trí.
- Tầng đích phải hoạt động, thuộc kệ hoạt động và `AVAILABLE`; tầng `FULL` vẫn xem/tìm/chuyển ra được.
- Phiếu đã xác nhận không sửa/hủy trực tiếp; việc trả hàng dùng chứng từ riêng, hiện còn `TASK-03`.
- Phạm vi source là một cửa hàng/một kho, không có cô lập kho theo từng Owner hoặc đa chi nhánh.

## 5. Công việc gần nhất và phần tiếp theo

Người dùng trước đây yêu cầu cải thiện sơ đồ kệ và cho đưa cả file Excel vào lúc tạo phiếu đặt lẫn phiếu nhập. Snapshot đã có `RackGeometry.java`, `rackLayout.js`, ba file xử lý Excel và tích hợp trong `DocumentForm.jsx`; do đó bước tiếp theo là kiểm chứng/sửa phần còn thiếu trên code hiện có, không mặc định viết lại từ đầu.

Ở cuộc chat tạo checkpoint này, người dùng chỉ giao **lập tài liệu bàn giao từ toàn bộ source và DB**. Các task trong `CURRENT_TASKS.md` là phát hiện/ưu tiên đề xuất; chưa phải phần đã sửa. Chưa xác nhận một lỗi đang hiện trên màn hình máy người dùng ở thời điểm bàn giao.

Trình tự kỹ thuật đề xuất khi được giao tiếp tục: chạy đúng backend source → khôi phục các route còn thiếu với phân quyền đúng → xử lý chênh lệch schema trả hàng sau khi thống nhất → kiểm tra kho/Excel đầu cuối. Không suy ra các bước này đều đã được người dùng yêu cầu thực hiện ngay.

## 6. Dữ liệu và cấu hình dễ bị hiểu nhầm

- Không tạo thêm cột `created_by`, `google_subject`, `auth_version` vào bảng `user` chỉ vì thấy các thuộc tính tương ứng trong Java. Nhiều giá trị được suy ra từ `audit_log`.
- `audit_log` lưu cả liên kết OAuth, người tạo tài khoản và dấu thu hồi phiên; xóa log có thể ảnh hưởng chức năng.
- Ảnh sản phẩm: Cloudinary qua backend; avatar: upload unsigned từ frontend khi có biến Vite; ảnh vị trí kho: file local qua API riêng. Đây là ba cơ chế khác nhau.
- `local.properties` có thông tin cấu hình thật; tài liệu chỉ mô tả tên khóa, không chép giá trị bí mật. File này hiện đã có cấu hình Cloudinary, không mặc định coi lỗi thiếu Cloudinary trước đây vẫn còn.
- `STAFF` vẫn tồn tại trong schema/backend dù một số nhãn UI đổi thành Family. Không tự xóa hoặc đổi role hàng loạt.

## 7. Mức kiểm chứng ở checkpoint

- Đọc source và dump; xác nhận 29 bảng, 68 file Java chính, 160 file JS/JSX trong `frontend/src`.
- Parse cú pháp 160 file JS/JSX: không có lỗi cú pháp. Đây không phải kiểm thử UI/build đầu cuối.
- `npm run test:warehouse`: thất bại vì thiếu `frontend/tests/run-warehouse.mjs` trong ZIP.
- Build Vite với dependencies đi kèm bị chặn do thiếu native binding Linux của Rolldown; chưa kết luận build trên máy người dùng bị lỗi.
- Có 55 phương thức `@Test` trong ba file Java; chưa chạy lại do môi trường không có Maven và trình biên dịch `javac`.
- Không kết nối hoặc sửa DB đang dùng; không gọi SMTP/OAuth/Cloudinary thật. Các kết quả “đã pass” trong trao đổi cũ không được tính là kết quả kiểm thử lượt này.

Chi tiết, đường dẫn và tiêu chí kiểm tra tiếp nằm trong `VERIFICATION.md`, `CURRENT_TASKS.md`, `SOURCE_MAP.md`.

## 8. Lời nhắn có thể dùng ở chat AI mới

> Đây là dự án DATN THORS của tôi. Hãy đọc `docs/AI_HANDOFF.md`, `docs/CURRENT_TASKS.md` và `docs/DECISIONS.md` trước; sau đó mở code và schema liên quan. Phân biệt rõ phần đã có code, phần chưa nối vào app, lỗi đã thấy và việc chưa được kiểm chứng. Giữ đúng quy tắc quyền/tổng tồn/nhập hàng/ảnh kho trong tài liệu. Trước khi sửa nghiệp vụ, nêu phạm vi và hỏi các điểm còn chưa rõ. Nếu tài liệu không khớp code mới, chỉ ra chỗ khác nhau và cập nhật checkpoint sau khi làm. Công việc tôi muốn tiếp tục là: [ghi yêu cầu cụ thể ở đây].
