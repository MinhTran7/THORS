# Mã vạch tại Tồn kho

## Cập nhật và chạy

1. Chép các file trong gói bổ sung vào đúng đường dẫn của dự án sau merge.
2. Trong HeidiSQL, chọn đúng database THORS đang dùng và chạy `database/add_product_detail_barcode.sql`. Script thêm cột `product_detail.barcode`, index UNIQUE và điền mã cho các biến thể hiện có. Có thể chạy lại; mã đã có được giữ nguyên. Không cần nhập lại `SQL_v1.sql`.
3. Trong `frontend`, chạy `npm ci` để cài đúng dependencies trong lockfile.
4. Build/chạy lại backend từ source: `mvn clean package` rồi chạy JAR mới hoặc `mvn spring-boot:run`. Không sử dụng lại JAR cũ trong bản ZIP.
5. Chạy frontend: `npm start`.

## Sử dụng

- Vào **Quản lý kho → Tồn kho**.
- Biến thể chưa có mã: Owner bấm **Tạo mã còn thiếu**. Một lần tạo cho toàn bộ biến thể chưa có mã, kể cả các biến thể mới được thêm/import sau này.
- Chọn các dòng cần in → **In mã vạch** → nhập số tem cho từng biến thể → chọn giấy A4 hoặc tem cuộn 50 × 30 mm → **In / Lưu PDF**.
- Mẫu A4 bố trí 3 cột tem 50 × 30 mm, khoảng cách 2 mm, lề trang 10 mm. Dùng giấy phù hợp với bố cục này; mẫu cuộn dùng trang 50 × 30 mm. In tỷ lệ 100%, tắt đầu/chân trang. Nên thử một trang trước khi in nhiều.
- Mỗi lần in tối đa 5.000 tem để tránh làm treo trình duyệt. Số tem không bị giới hạn theo tồn kho vì có thể cần in lại tem.
- **Quét mã tìm hàng**: bật camera, đưa mã vào vùng hình ảnh hoặc nhập mã thủ công. Sau khi đọc được mã, camera dừng và hệ thống hiển thị đúng biến thể, tổng tồn, phần chưa xếp và tất cả vị trí còn hàng. Bấm **Xem vị trí trên sơ đồ** để mở sơ đồ kho có sẵn.
- Có thể chọn webcam khác sau khi đã cấp quyền camera. Dùng camera sau trên điện thoại khi có thể.
- Điện thoại cần truy cập địa chỉ **HTTPS** mà điện thoại mở được và cấp quyền camera. `localhost` chỉ dùng trên chính máy đang chạy; địa chỉ HTTP trong mạng LAN không đủ để bật camera trên trình duyệt thông thường. Không có HTTPS vẫn có thể nhập mã thủ công.

## Quy tắc giữ nguyên

- Mỗi `product_detail` (màu/size) có một mã cố định, ví dụ ID 1 là `TH000001`. ID dài hơn 6 số được giữ đầy đủ.
- Code 128 biểu diễn mã đã lưu; nhiều món cùng biến thể dùng cùng mã. Tạo lại/in lại không đổi mã đã có.
- Owner được tạo mã; Owner và Family Member được tra cứu/in trong khu vực kho theo quyền xem hiện có.
- Tạo mã, in tem và tra cứu không tăng/giảm tồn, không chuyển vị trí và không tạo chứng từ nhập/xuất.
- Không thêm bảng, không sửa cấu hình DB, auth hoặc các module bán hàng của nhóm.

## File chính và API

- Backend theo cấu trúc module kho: `WarehouseBarcodes.java`; thêm endpoint trong `WarehouseController.java`; bổ sung barcode vào snapshot của `WarehouseLayout.java`.
- `POST /api/warehouse/barcodes/generate`: tạo mã còn thiếu, trả số lượng `generated`; gọi lại không đổi các mã cũ.
- `GET /api/warehouse/barcodes/lookup?code=TH000001`: trả `variant` và `locations`; mã không tồn tại trả 404, mã sai định dạng trả 400.
- Frontend: `InventoryPage.jsx`, `BarcodePrintDialog.jsx`, `BarcodeScannerDialog.jsx`, `barcodeLabels.js`; dùng theme MUI và lớp gọi API/CSRF hiện có.
- Thư viện: `jsbarcode` để tạo Code 128; `@zxing/browser` và `@zxing/library` để đọc camera. Được cài qua npm và đóng gói cùng frontend, không phụ thuộc CDN khi dùng.

## Kiểm thử

- Backend: `mvn -Dtest=WarehouseBarcodesTest test`. Dùng H2 độc lập, không kết nối DB đang dùng. Bao phủ tạo mã thiếu, mã cũ, chạy lại, ID lớn, rollback khi trùng, quyền, kết quả nhiều vị trí và bảo toàn tồn kho.
- Frontend: `npx playwright install chromium`, sau đó `npm run test:barcode`. Dùng API giả lập và camera video kiểm thử có mã Code 128; kiểm tra chọn hàng, số tem thực sự in, tra cứu, xử lý quyền camera, dừng camera, liên kết sơ đồ và giao diện màn hình điện thoại.
- Kiểm tra thêm trên máy sử dụng thật: in một tem, quét bằng điện thoại/webcam thực tế và đối chiếu đúng màu/size. Kiểm thử camera mô phỏng không thay thế bước này.

## Kết quả kiểm chứng bản bổ sung ngày 29/10/2026

- Backend biên dịch thành công; 8 kiểm thử `WarehouseBarcodesTest` đạt trên H2 riêng.
- Frontend build production và lint các file giao diện mã vạch đạt.
- Bộ kiểm thử trình duyệt đạt: tạo mã thiếu, chọn biến thể, in đúng 2 tem M + 3 tem L, tra cứu theo mã, đọc Code 128 qua luồng video camera mô phỏng, dừng camera, xử lý từ chối quyền, mở sơ đồ, giao diện điện thoại và quyền Family.
- Kiểm tra PDF A4 có đúng 5 tem và đủ mã chữ; PDF tem cuộn có kích thước khoảng 50 × 30 mm.
- Chưa chạy migration trên MySQL của người dùng; chưa in trên máy in hoặc quét bằng điện thoại/webcam vật lý.

## Danh sách file của gói bổ sung

File sửa:

- `backend/src/main/java/com/thors/module/warehouse/WarehouseController.java`
- `backend/src/main/java/com/thors/module/warehouse/WarehouseLayout.java`
- `frontend/src/features/warehouse/InventoryPage.jsx`
- `frontend/package.json`
- `frontend/package-lock.json`

File thêm:

- `backend/src/main/java/com/thors/module/warehouse/WarehouseBarcodes.java`
- `backend/src/test/java/com/thors/module/warehouse/WarehouseBarcodesTest.java`
- `database/add_product_detail_barcode.sql`
- `frontend/src/features/warehouse/barcodeLabels.js`
- `frontend/src/features/warehouse/BarcodePrintDialog.jsx`
- `frontend/src/features/warehouse/BarcodeScannerDialog.jsx`
- `frontend/tests/run-barcode.mjs`
- `docs/BARCODE.md`
