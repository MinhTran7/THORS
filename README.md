# THORS Authentication — database hiện tại, 29 bảng

Bản 0.2.0 dành cho file `thors_mysql84_init (2).sql` bạn đã gửi. Database tên **thors**. Backend chỉ dùng `user`, `role`, `audit_log` đang có. Không tạo/thêm/sửa bảng, cột, view, trigger; không chạy migration hoặc SQL khởi tạo khi mở ứng dụng.

## Chạy trên Windows

1. Giải nén ZIP sang thư mục mới. Dùng source và JAR trong bản này cùng nhau.
2. Mở **backend/local.properties**. Điền mật khẩu Aiven ngay sau `spring.datasource.password=`. Host, port 10006, db thors và user avnadmin đã điền theo thông tin của bạn. Không thêm dấu ngoặc kép, dấu nháy hoặc `${...}`. Nếu đã đổi thông tin Aiven, sửa đúng ba dòng datasource trong file này.
3. Cấu hình ít nhất một kênh OTP theo **docs/CONFIGURATION.md**. Email/SMS/Google cần thông tin dịch vụ thật của bạn; gói này không chứa mật khẩu hay credential của bạn.
4. Cài Java 17 trở lên, Node.js 22.12 trở lên. Bấm **start-backend.cmd**, rồi **start-frontend.cmd**. JAR đã build sẵn; không cần Maven để chạy JAR. Frontend tự `npm ci` lần đầu, cần Internet.
5. Mở **http://localhost:3000**. Giữ hai cửa sổ chạy ứng dụng mở.

Với IntelliJ: mở `backend/pom.xml`, chạy `ThorsApplication`, working directory là thư mục **backend** hoặc **THORS**. Spring tự đọc cùng `backend/local.properties`; không cần khai báo thủ công biến môi trường. Không mở source/JAR cũ nữa.

Linux/macOS: `bash scripts/start-backend.sh` và `bash scripts/start-frontend.sh` trong hai terminal. Build lại sau khi sửa Java: `cd backend`, `mvn clean package`, rồi chạy JAR mới.

## Các luồng đã triển khai

- Customer đăng ký họ tên/email/phone/mật khẩu/xác nhận, xác minh email hoặc SMS trước khi dùng.
- Đăng nhập bằng email hoặc số điện thoại. Nhận được cả định dạng số Việt Nam cũ, không tự sửa dữ liệu đang có. Số đã trùng giữa nhiều tài khoản: yêu cầu đăng nhập bằng email.
- OTP 6 số: 5 phút, tối đa 5 lần sai, gửi lại sau 60 giây, tối đa 10 lần/giờ/tài khoản; một mã đang hoạt động cho mỗi tài khoản.
- Quên/đổi mật khẩu, xác minh thêm liên hệ, logout, thu hồi phiên sau đổi mật khẩu hoặc đổi trạng thái qua backend.
- Google tạo Customer không bắt buộc phone; tài khoản có email trùng phải đăng nhập mật khẩu và liên kết từ hồ sơ. Google đã liên kết giữ nguyên vai trò và kiểm tra trạng thái tài khoản.
- Admin tạo Owner; Owner tạo/quản lý Staff và Family Member do mình tạo. Tài khoản nội bộ mới hoặc được quản lý đặt lại mật khẩu đều cần OTP để kích hoạt.
- Cookie HttpOnly, CSRF, bảo vệ route và đường dẫn quay lại nội bộ.

## Database và dữ liệu hiện có

**Không chạy lại `docs/database/thors_mysql84_init.sql` trên database của bạn.** Đây chỉ là bản sao nguyên file SQL để đối chiếu, không phải bước cài Authentication.

Không có các cột `google_subject`, `auth_version`, `created_by`, và không có bảng `verification_code` trong schema hiện tại. Backend mới không truy vấn chúng. OTP dùng các cột `verification_*` trong user. Google, người tạo tài khoản và thu hồi phiên được tra từ lịch sử audit_log có sẵn. **Không xóa log Authentication** nếu muốn giữ liên kết Google, quyền Owner và dấu thu hồi phiên. Chi tiết trong docs/AUTHENTICATION_FLOW.md.

Không tạo tài khoản mẫu khi chạy. Nếu đã có Admin, đăng nhập bằng tài khoản đó. Nếu database chưa có Admin, bật bootstrap theo docs/CONFIGURATION.md một lần; Admin vẫn phải OTP, rồi tắt bootstrap.

Tài khoản cũ phải có password_hash BCrypt để đăng nhập bằng mật khẩu; hệ thống không chuyển mật khẩu thường sang hash và không tự kích hoạt tài khoản cũ. Staff/Family cũ thiếu lịch sử người tạo vẫn có thể đăng nhập nếu ACTIVE, nhưng Owner không tự được gán quyền quản lý họ; Admin quản lý theo role.

## Kiểm thử

`cd backend` → `mvn test` chạy trên database H2 riêng cho test. Không trỏ profile test vào database Aiven đang dùng vì test xóa tài khoản/nhật ký trong database kiểm thử. Kết quả kiểm thử MySQL 8.4 và trình duyệt ghi ở docs/VERIFICATION.md.

Frontend `npm run build`; các trang dùng Mantis/MUI, Formik, React Router. Đây là module Authentication; trang workspace là điểm vào sau đăng nhập, chưa triển khai nghiệp vụ bán hàng/kho.
