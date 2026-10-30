# Kiểm chứng tại checkpoint 28/10/2026

## Đã thực hiện

| Kiểm tra | Kết quả | Phạm vi kết luận |
|---|---|---|
| Kiểm kê ZIP/source | Đọc project/config/router/controller/service/schema/Git; source chính có 68 Java, frontend/src có 160 JS/JSX. | Đủ cơ sở lập bản đồ source; không phải chạy thử chức năng. |
| Parse JS/JSX | Dùng @babel/parser với JSX/module trên 160 file: 0 lỗi cú pháp. | Chỉ cú pháp; không chứng minh import/runtime/UI đúng. |
| Đối chiếu route | Các nhóm products/categories/staff/system-log/profile edit/password chưa khai báo trong router hiện tại. | Có code component nhưng còn thiếu tích hợp. |
| Đối chiếu DB | 29 CREATE TABLE; hai CHECK không có SUPPLIER_RETURN trong khi code sử dụng. | Nếu DB thật cùng CHECK thì thao tác bị từ chối; chưa thử ghi DB thật. |
| Đối chiếu cấu hình local | Tên DB là thors_restore; có khóa SMTP/Google/Facebook/Cloudinary đã điền. | Chỉ xác nhận khóa/giá trị có mặt, không xác nhận dịch vụ chạy. Không in secret. |
| Kiểm tra JAR trong ZIP | 49 class ứng dụng; không có package warehouse/product/category. | JAR không chứa module mới; script ưu tiên JAR có thể chạy bản cũ. |
| `npm run test:warehouse` từ frontend | FAIL: MODULE_NOT_FOUND, thiếu tests/run-warehouse.mjs. | Lỗi đóng gói/script có thể xác nhận trực tiếp. |
| Build bằng dependencies trong ZIP | Chạy Vite qua Node trực tiếp bị thiếu @rolldown/binding-linux-x64-gnu. | Bị chặn bởi dependency native của môi trường Linux; chưa kết luận build trên Windows/source sạch lỗi. |
| Lint riêng productService.js | Có ba lỗi no-unused-vars cho openStatusDialog, closeStatusDialog, confirmChangeProductStatus. | Chỉ lint một file; chưa chạy lint toàn dự án. |
| Đếm test Java | AuthIntegrationTest: 42; FacebookIntegrationTest: 10; OtpKeyProviderTest: 3. Tổng 55 @Test. | Đây là số test được định nghĩa, không phải 55 test đã pass. |

## Chưa chạy hoặc bị chặn

- Môi trường có Java runtime 17 và Node 24 nhưng không có Maven hoặc trình biên dịch javac; chưa compile/package lại backend hoặc chạy bộ Java tests.
- Không cài dependency mới qua mạng; dùng node_modules đã có trong ZIP cho các kiểm tra trên. Phần native đi kèm không đủ cho Linux hiện tại.
- Chưa chạy UI trong browser với backend/database thật; chưa có kiểm tra hình ảnh sơ đồ bốn kệ hoặc các màn quản trị.
- Chưa gửi email OTP, thực hiện login OAuth thật, upload Cloudinary hoặc upload ảnh vào một backend đang chạy.
- Chưa import workbook thực tế từ người dùng/NCC; chưa kiểm tra vòng đặt → nhập → xác nhận → xếp vị trí/trả bằng dữ liệu thật.
- Không kết nối DB online; không chạy SQL_v1.sql, ALTER, INSERT, UPDATE hay migration lên DB đang dùng.

## Test Java đang bao phủ gì?

AuthIntegrationTest định nghĩa các trường hợp đăng ký/email/OTP, CSRF/session, lockout, thu hồi phiên, quyền quản lý account, Google account/link, phone contact và chống lộ thông tin reset. FacebookIntegrationTest kiểm tra các tình huống tài khoản/liên kết Facebook. OtpKeyProviderTest kiểm tra khóa OTP.

Schema H2 test chỉ tạo `role`, `user`, `audit_log`. Không có bộ integration test kho/catalog tương ứng trong snapshot được gửi. Không lấy kết quả test auth làm bằng chứng cho nghiệp vụ nhập/xuất/vị trí.

## Các kiểm tra nên chạy khi được giao tiếp tục

1. Build và xác nhận backend đúng source, không dùng JAR cũ.
2. Chạy lại Java tests trên H2 riêng; chạy npm ci/build trên đúng hệ điều hành; khôi phục test:warehouse trước khi dựa vào nó.
3. Test route/menu/direct URL của từng vai trò sau khi nối trang thiếu.
4. Đối chiếu schema DB thử rồi kiểm tra confirm receipt/return, rollback, confirm lại và lượng nguồn bị thay đổi đồng thời.
5. Kiểm tra import Excel với dữ liệu thật, gán/chuyển giữ tổng tồn và hình học kho.

Đây là kế hoạch kiểm chứng tiếp, chưa phải những bước đã hoàn thành. Những trao đổi trước có nhắc kết quả test cũ không được chuyển thành dấu PASS của checkpoint mới.

## Kiểm tra chính bộ tài liệu

Đã kiểm tra file Markdown được ghi UTF-8, các liên kết nội bộ và đường dẫn nguồn tồn tại, đủ 29 bảng trong từ điển schema, không có giá trị mật khẩu/secret cấu hình thật và gói ZIP có thể đọc lại. Kiểm tra này được thực hiện khi đóng gói tài liệu; không thay thế kiểm thử ứng dụng.
