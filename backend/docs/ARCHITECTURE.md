# Kiến trúc và cấu trúc source

Checkpoint 28/10/2026. Các phiên bản bên dưới được đọc từ manifest trong ZIP, không phải khuyến nghị nâng cấp.

## Công nghệ

| Thành phần | Source hiện tại |
|---|---|
| Frontend | JavaScript/JSX, React `19.2.6`, React Router `7.15.1`, Vite `8.0.13`. |
| UI | MUI `9.0.1`, Ant Design Icons, Emotion; có nền template Mantis. |
| Form/cache | Formik `2.4.9`, Yup `1.7.1`, SWR `2.4.1`, Context API. |
| Excel | ExcelJS `4.4.0`, tải động bản browser khi cần. |
| Backend | Spring Boot `3.5.7`, Java 17, Maven, Spring Web/Security/OAuth2/JDBC/Validation/Mail. |
| Database | MySQL Connector/J; dump ghi MySQL `8.4.11`, 29 bảng, InnoDB/utf8mb4. |
| Ảnh catalog | Cloudinary Java SDK `2.3.0`. |
| Test | Spring Boot Test, Spring Security Test, H2; frontend chưa có file chạy test kho được package script trỏ tới. |
| Yêu cầu Node | `>=22.12.0` trong `frontend/package.json`. |

## Cấu trúc có ý nghĩa nghiệp vụ

| Vị trí | Trách nhiệm |
|---|---|
| `frontend/src/routes/index.jsx` | Router thực tế của ứng dụng. |
| `frontend/src/layouts/ThorsLayout.jsx` | Layout đang được router dùng, menu theo vai trò và menu kho. |
| `frontend/src/features/auth/` | AuthProvider, RequireAuth, trang đăng nhập/đăng ký/OTP/OAuth. |
| `frontend/src/features/account/` | Hồ sơ, tài khoản, Family/Staff, nhật ký, workspace. |
| `frontend/src/features/product/`, `category/` | Các màn hình catalog, hiện còn thiếu route tích hợp. |
| `frontend/src/features/warehouse/` | Tồn kho, chứng từ, sơ đồ, vị trí, nhập Excel và state kho. |
| `frontend/src/services/` | HTTP client, API product/category, upload avatar. |
| `frontend/src/layout/`, `sections/`, `menu-items/` | Thành phần template Mantis còn giữ; không đồng nghĩa đang được router hiện tại dùng. |
| `backend/src/main/java/com/thors/module/` | Các module `auth`, `account`, `product`, `category`, `warehouse`. |
| `backend/.../security/`, `config/`, `common/` | Session, phân quyền, CSRF, cấu hình, chuẩn hóa và lỗi API. |
| `backend/.../integration/otp/` | Gửi email và adapter Twilio còn giữ. |
| `backend/src/main/resources/application.yml` | Giá trị mặc định và nạp cấu hình local. |
| `database/SQL_v1.sql` | Dump schema và dữ liệu người dùng cung cấp. |
| `scripts/`, `start-*.cmd` | Script khởi động; chú ý ưu tiên JAR cũ. |
| `.github/workflows/ci.yml` | Chạy Maven verify và npm build trong CI. |

## Luồng HTTP và xác thực

Browser truy cập frontend ở cổng 3000. Vite proxy `/api`, `/oauth2`, `/login/oauth2` về backend mặc định cổng 8080. Các request dùng đường dẫn cùng origin; không thiết kế theo JWT lưu localStorage.

`services/http.js` gắn prefix `/api`, gửi cookie phiên và lấy token từ `/api/auth/csrf` trước request thay đổi dữ liệu. JSON được gửi qua `body`; FormData qua tùy chọn `form` để browser tự đặt Content-Type multipart. Phản hồi 401 phát sự kiện `thors:unauthorized` để AuthProvider xóa trạng thái đăng nhập phía UI.

Spring Security dùng session cookie HttpOnly, SameSite=Lax, timeout 30 phút. `SESSION_COOKIE_SECURE` mặc định false cho môi trường local. `SessionAccess`, `SessionUser`, `AccountStateFilter` kiểm tra tài khoản và thu hồi quyền của phiên khi dữ liệu auth thay đổi. `RequireAuth` bảo vệ route phía frontend; backend vẫn phải tự kiểm tra quyền.

Không có retry tự động toàn bộ request ghi sau lỗi CSRF trong HTTP client hiện tại. Khi gặp 403 cần phân biệt CSRF với thiếu quyền; không mặc định bỏ bảo vệ CSRF để khắc phục.

## Cách truy cập database

Backend dùng `JdbcTemplate`/SQL trực tiếp, không dùng JPA/Hibernate entity mapping. Các lớp tên `entity` là model/record; không có cơ chế tự tạo schema từ entity. `spring.sql.init.mode=never` ở cấu hình chạy chính.

Auth/account/product/category dùng controller → service → repository/mapper. Module warehouse gom truy vấn trong `WarehouseStore` và nghiệp vụ trong `WarehouseDocuments`, `WarehouseLayout`; dữ liệu thường trả dạng `Map` với khóa snake_case.

Mutation kho dùng transaction READ_COMMITTED; `WarehouseStore.lock()` khóa dòng role OWNER hiện có bằng `FOR UPDATE` để tuần tự hóa cập nhật cho một kho. Snapshot và danh sách chứng từ dùng transaction đọc REPEATABLE_READ. Đây là khóa DB, không phải khóa chỉ có hiệu lực trong một JVM.

`WarehouseContext` gọi ba nguồn SWR: snapshot, documents, notifications. Sau thao tác thành công, hàm `run()` gọi `reload()` để lấy lại cả ba. Lỗi snapshot/documents chặn hiển thị nội dung kho; lỗi notifications được hiển thị riêng. Chưa có WebSocket hay polling định kỳ được cấu hình trong provider này.

## Lưu ảnh

| Loại | Đường đi | Dữ liệu lưu |
|---|---|---|
| Ảnh sản phẩm | Multipart → backend ProductImageService → Cloudinary | `product_image.image_url`, `cloud_public_id`, cờ primary/xóa mềm. |
| Avatar | Frontend unsigned upload → Cloudinary → API profile | URL HTTPS trong `user.avatar_url`. |
| Ảnh vị trí kho | Multipart → `/api/warehouse/photos` → thư mục local | URL API trong `product_location_image`, file ảnh nằm ngoài DB. |

Không dùng cấu hình upload avatar để thay thế cấu hình signed upload của backend hoặc kho ảnh local.

## Những ranh giới hiện chưa có

Không có module source POS/orders/payment/shipping/AI hoạt động trong bản này; không có cách ly dữ liệu theo cửa hàng/chi nhánh. Sự tồn tại của bảng `orders`, `payment`, `image_search`, `work_shift` chỉ thể hiện thiết kế database.

Tệp JAR được gửi kèm chưa chứa các module catalog/kho mới. Xem `CURRENT_TASKS.md`, `CONFIGURATION.md` trước khi dùng script chạy.
