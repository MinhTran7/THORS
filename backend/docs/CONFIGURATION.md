# Cấu hình và chạy đúng phiên bản

## Điều kiện

Java **JDK** 17, Maven để build source, Node.js >=22.12, npm, MySQL phù hợp schema. `package-lock.json` có trong frontend; dùng `npm ci` để cài theo lockfile. ZIP gửi kèm node_modules từ môi trường khác có thể thiếu native package cho hệ điều hành đang chạy.

File `backend/local.properties` hiện đã có thông tin cấu hình thật. Giữ giá trị của người dùng; không ghi đè nó bằng file example. Spring nạp `./backend/local.properties` hoặc `./local.properties` tùy working directory.

## Điểm đặc biệt: build lại backend trước khi dùng script

JAR trong ZIP không có class warehouse/product/category; các script lại ưu tiên chạy JAR có sẵn. Khi cần chạy phiên bản source hiện tại, ở thư mục gốc:

```powershell
mvn -f backend/pom.xml clean package
```

Sau khi build thành công, chạy backend/frontend bằng hai terminal hoặc script Windows hiện có:

```powershell
.\start-backend.cmd
```

```powershell
.\start-frontend.cmd
```

Hoặc chạy backend trực tiếp từ source, ở thư mục `backend`:

```powershell
mvn spring-boot:run
```

Frontend, ở thư mục `frontend`:

```powershell
npm ci
npm run start
```

IntelliJ: mở backend/pom.xml, chạy `com.thors.ThorsApplication`, working directory `backend` hoặc thư mục gốc. Cần phân biệt process chạy source với process java -jar cũ còn mở.

Linux/macOS có `bash scripts/start-backend.sh` và `bash scripts/start-frontend.sh`; quy tắc ưu tiên JAR giống Windows. Chỉ cần một backend lắng nghe đúng cổng cho phiên thử.

## Cổng và proxy

| Cấu hình | Mặc định/ý nghĩa |
|---|---|
| Frontend | `http://localhost:3000`; Vite strictPort=true. |
| Backend | 8080, đổi qua PORT. |
| BACKEND_PROXY_TARGET | Biến trong frontend/.env; mặc định http://localhost:8080. |
| THORS_FRONTEND_URL | URL frontend dùng cho redirect sau OAuth. |
| Proxy | `/api`, `/oauth2`, `/login/oauth2`. |

Frontend HTTP client dùng API cùng origin và cookie phiên. Nếu truy cập khác host/cổng hoặc qua proxy production, cần kiểm tra đường đi cookie/CSRF/redirect; không tự đổi sang token localStorage.

## Database

Các khóa trực tiếp trong local.properties:

```properties
spring.datasource.url=jdbc:mysql://<host>:<port>/<database>?sslMode=REQUIRED&connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true
spring.datasource.username=<database-user>
spring.datasource.password=<database-password>
```

Đây là placeholder, không phải cấu hình có thể copy chạy ngay. Bản ZIP đang chọn `thors_restore`; file example/application.yml mặc định chọn `thors`. Kiểm tra đúng tên trước khi chạy. Không cần chạy lại dump để auth/kho “tạo bảng”; source chính tắt SQL init và chỉ dùng schema sẵn.

Cấu hình mặc định dùng UTC và transaction READ_COMMITTED. Không đổi timezone một phía mà bỏ qua việc đọc ngày/giờ ở frontend.

## Email OTP, khóa OTP và bootstrap

| Nhóm | Khóa cần biết |
|---|---|
| Email | thors.delivery.email-enabled, thors.delivery.email-from, spring.mail.host/port/username/password và thuộc tính SMTP auth/STARTTLS. |
| Khóa OTP | thors.auth.otp-secret: trống thì sinh khóa ngẫu nhiên mỗi lần chạy; nếu cấu hình phải >=32 ký tự. Nhiều backend cần dùng chung khóa. |
| Giới hạn mặc định | otp-seconds=300, resend-seconds=60, max-sends-per-hour=10. |
| Bootstrap | thors.bootstrap.enabled mặc định false; chỉ tạo Admin nếu bật và chưa có Admin, vẫn PENDING_VERIFICATION. |

Snapshot local.properties đã điền SMTP và bật email. Điều này không xác nhận thư đã gửi thành công ở lượt này. Có `scripts/mailpit.compose.yml` cho thử email local; cần cấu hình ứng dụng trỏ đúng SMTP thử nếu dùng.

Luồng auth hiện chỉ EMAIL. Dù adapter Twilio và khóa SMS tồn tại, capabilities vẫn trả sms=false, OtpService từ chối channel khác EMAIL. Không bật SMS trong cấu hình rồi coi đã có hỗ trợ SMS đăng nhập.

## Google và Facebook

Google dùng thors.google.enabled/client-id/client-secret/redirect-uri; callback mặc định qua `http://localhost:3000/login/oauth2/code/google`. Facebook dùng nhóm thors.facebook.* hoặc các placeholder FACEBOOK_ENABLED/CLIENT_ID/CLIENT_SECRET/REDIRECT_URI/API_VERSION trong application.yml.

Các callback trên provider phải khớp redirect cấu hình. Browser đi qua Vite proxy; frontend có `/auth/google/callback`, `/auth/facebook/callback`, `/auth/facebook/complete`. Không nhầm callback backend `/login/oauth2/code/...` với trang kết quả frontend.

Có khóa Google/Facebook trong local.properties; chưa gọi provider thật trong lượt này. Không đổi scope, liên kết email hoặc vai trò chỉ để bỏ qua lỗi callback.

## Cloudinary: ảnh catalog và avatar

CloudinaryConfig tạo bean vô điều kiện và yêu cầu:

```properties
cloudinary.cloud-name=<cloud-name>
cloudinary.api-key=<api-key>
cloudinary.api-secret=<api-secret>
```

local.properties hiện đã có ba khóa này với giá trị đã điền. application.yml/local.properties.example chưa mô tả đầy đủ nên một checkout mới thiếu chúng có thể không khởi tạo bean được. Không ghi các giá trị thật vào docs.

ProductImageService upload ảnh sản phẩm qua backend, folder `thors/products`. Multipart Spring giới hạn 5 MB mỗi file và 6 MB mỗi request; request nhiều ảnh phải tính cả tổng request.

Avatar dùng `frontend/src/services/imageUpload.js` và cần riêng:

```dotenv
VITE_CLOUDINARY_CLOUD_NAME=<cloud-name>
VITE_CLOUDINARY_UPLOAD_PRESET=<unsigned-upload-preset>
```

Frontend chỉ chứa cloud name/preset public; api-secret của backend không được đưa vào biến Vite. `.env.example` hiện mới có BACKEND_PROXY_TARGET nên avatar không tự được cấu hình từ đó.

## Ảnh vị trí kho

Khóa `thors.warehouse.photo-directory` mặc định `./data/warehouse-photos`. Đường dẫn tương đối tính theo working directory tiến trình backend; chạy từ thư mục gốc và từ backend có thể tạo hai thư mục khác nhau nếu không cố định cấu hình.

Upload qua `/api/warehouse/photos`, Owner mới được upload; Owner/Family đọc ảnh qua session. Chỉ upload JPG/PNG, <=5 MiB, <=20 triệu pixel; tối đa tám ảnh/location. File local cần được giữ cùng dữ liệu DB khi chuyển môi trường; DB chỉ chứa URL/key tham chiếu.

## Kiểm thử và build

```powershell
mvn -f backend/pom.xml test
```

```powershell
cd frontend
npm run build
npm run lint
npm run test:warehouse
```

Các lệnh là cách chạy dự kiến, không phải kết quả đã pass. `test:warehouse` hiện thiếu file script. Java integration tests dùng profile test/H2 với schema có DROP TABLE; phải giữ tách biệt DB đang dùng. Kết quả thực tế của lượt bàn giao nằm trong `VERIFICATION.md`.
