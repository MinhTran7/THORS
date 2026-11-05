# Kiểm chứng

## Đợt 06/11/2026 — Tồn kho, giữ hàng, kiểm kê, báo cáo

| Lệnh | Kết quả |
|---|---|
| `mvn test` (backend) | 301 test, 0 fail (13 test `WarehouseInventoryTest`, 31 `WarehouseOrderFlowTest`). |
| MySQL thật `thors_restore`, harness rollback (RealInventory) | 36/36 pass: đặt online giữ 3 không đổi tồn; đặt/bán tại quầy vượt có thể bán bị chặn; xác nhận đơn trừ 3 đúng một lần (ORDER_OUT gắn dòng đơn, stock_deducted_at), xác nhận lặp bị chặn; từ chối/khách hủy giải phóng giữ; đơn cũ chưa giữ vẫn trừ đúng; báo cáo hôm nay: tồn cuối = đầu + tăng − giảm = tồn hiện tại; Family không nhận giá vốn; thẻ kho tồn sau = tồn hiện tại; danh sách tồn báo cần migration (503) thay vì 500. Sau rollback DB giữ nguyên. |
| `node tests/run-inventory-ui.mjs` (API giả lập) | Pass: thẻ thống kê lọc qua backend, chi tiết theo mã (2 sản phẩm trùng tên), ngưỡng 0 gửi đúng 0, thẻ kho mở chứng từ, chuyển vị trí tách riêng, Excel gọi `all=true`, báo cáo/giá trị theo vai trò, kiểm kê Owner xác nhận trực tiếp / Family gửi xác nhận. |
| `npm run test:barcode`, `test:warehouse`, `run-order-ui.mjs`, `vite build`, `eslint --quiet` | Pass / thành công / 0 lỗi. |

**Đợt 2 (05/11/2026, sau migration):**

- Sao lưu `mysqldump` toàn bộ `thors_restore` (32 bảng) ra `C:\Users\Admin\Downloads\THORS_backups\thors_restore_before_2026-11-06_inventory.sql`; kiểm tra trước: 0/0/0 (chưa áp dụng); chạy migration; kiểm tra sau: **1, 2, 0**, 44 biến thể, tổng tồn 106 không đổi. Backend khởi động lại bằng source mới.
- RealCounts (MySQL thật, rollback): **54/54** — danh sách/thống kê toàn bộ dữ liệu, lọc hết hàng/chưa xếp/mã vạch, dòng trùng tên tách theo mã, sắp xếp, Family không nhận giá vốn, STAFF bị chặn; ngưỡng NULL/0/dương, Family không đặt được; kiểm kê Family lập/gửi, Owner không có "Gửi xác nhận", xuất trong lúc chờ duyệt → `COUNT_STALE`, sửa phiếu rồi duyệt trừ đúng, xác nhận lặp không áp dụng lần hai, nhập trong lúc chờ duyệt → chặn, thiếu chứng từ → chặn, gửi lặp cùng requestKey không tạo trùng; tổng tồn = đã xếp + chưa xếp sau mọi bước; giá trị tồn hiện tại = giá trị cuối kỳ báo cáo; hai giao dịch đồng thời trên MySQL: giao dịch thứ hai chờ khóa kho của giao dịch thứ nhất (~3 s). DB giữ nguyên sau rollback.
- RealInventory chạy lại: 36/36. `mvn test` 304/304 (gồm 2 test giá vốn liên hoàn, 1 test hai Owner xác nhận cùng phiếu). UI test giả lập, barcode, order-ui, warehouse import, build, eslint: pass.
- Giá trị thật (05/11): #6 102 × 85.000 = 8.670.000 ₫; #5 4 × 85.000 = 340.000 ₫; tổng 9.010.000 ₫ = giá trị cuối kỳ báo cáo 01/11→hôm nay.
- **Chưa làm:** kiểm tra giao diện với dữ liệu thật bằng tài khoản đăng nhập (không có mật khẩu tài khoản Owner/Family trong môi trường này).

## Đợt 05/11/2026 — Công nợ, thanh toán nhập hàng, xử lý tiền / đổi hàng phiếu trả

Không kết nối DB thật; H2 có `supplier_settlement` và `stock_receipt.paid_before_tracking` theo `database/migrations/2026-11-05_supplier_settlement.sql` (đối chiếu `database/SQL_v2.sql`).

| Lệnh | Kết quả |
|---|---|
| `mvn test` (backend) | 288 test, 0 fail (31 test `WarehouseOrderFlowTest`). |
| `node tests/run-order-ui.mjs` | Pass (API giả lập): hoàn tiền có ngày/hình thức, đổi hàng không đổi tồn, phiếu nhập hàng đổi từ phiếu trả, thanh toán phiếu nhập, dùng tiền đối trừ, phiếu nhập cũ “Chưa xác định” + khai báo, cột Còn nợ/phiếu chưa khai báo ở trang NCC, Family chỉ xem. |
| `npm run test:warehouse`, `npx vite build`, `eslint --quiet src/features/warehouse` | Pass / thành công / 0 lỗi. |

Test backend: thanh toán nhiều lần, chặn vượt công nợ, bắt buộc hình thức; xuất trả không tự giảm nợ; giảm công nợ bằng hàng trả rồi không hoàn tiền trùng; tổng hợp theo NCC; phiếu nhập cũ (NULL) bị chặn ghi đến khi khai báo, khai báo không vượt giá trị còn lại, Family bị chặn; đổi hàng không đổi tồn, nhập hàng đổi qua phiếu nhập từ phiếu trả (Family lập, Owner xác nhận, tăng tồn đúng một lần, không vượt số đổi), phiếu nhập hàng đổi không phát sinh nợ, không hủy phần đổi đã nhận; cùng các test hoàn tiền/đối trừ/giữ tiền trước đó.

**MySQL thật (thors_restore, MySQL 8.4.11, sql_mode ANSI + ONLY_FULL_GROUP_BY), 04/11/2026 22:xx:** migration 2026-11-05 đã chạy (kiểm tra 1, 1, 5, 0; 8 phiếu). Chạy toàn luồng qua đúng các service backend trong một transaction rồi rollback (savepoint cho từng thao tác bị chặn): **57/57 kiểm tra đạt**: nhập + thanh toán 2 lần, ghi trùng request_key, chặn vượt nợ/thiếu hình thức/Family; xuất trả không tự giảm nợ; hoàn tiền 3 lần, giảm nợ, chặn vượt; giữ/dùng tiền đối trừ, chặn vượt số dư, chặn hủy tiền giữ đã dùng, hủy theo thứ tự; đổi hàng không đổi tồn, phiếu nhập hàng đổi (Family lập, Owner xác nhận 2 lần, tồn +2 một lần), không phát sinh nợ, chặn hủy đổi đã nhận; phiếu nhập cũ thật (PN00002) chưa xác định → chặn → khai báo; tổng hợp NCC; UNIQUE request_key và CHECK EXCHANGE của DB. Sau rollback số phiếu, bút toán, biến động, tồn và khai báo giữ nguyên. Backend bản mới khởi động lại 22:07, không lỗi trong log.

**Chưa kiểm chứng:** thao tác giao diện với backend thật (cần đăng nhập người dùng).

## Đợt 04/11/2026 (2) — Trả hàng nhà cung cấp

Cùng máy/công cụ, **không kết nối DB thật**; backend test trên H2 với CHECK theo `database/migrations/2026-11-04_supplier_return.sql`.

| Lệnh | Kết quả |
|---|---|
| `mvn test` (backend) | 284 test, 0 fail (27 test `WarehouseOrderFlowTest`, 7 test mới cho trả NCC). |
| `node tests/run-order-ui.mjs` (Chromium headless của Playwright) | Pass; thêm bước: lập phiếu trả từ chi tiết phiếu nhập, cột/nhãn mới, tìm theo mã phiếu nhập, hộp xuất trả với vị trí gợi ý chỉnh được và chặn phân bổ sai, Family “Gửi duyệt” không có nút duyệt/xuất trả. API giả lập. |
| `npm run test:warehouse` | 7 kiểm tra pass. |
| `npx vite build` | Thành công (cảnh báo chunk lớn có sẵn). |
| `eslint --quiet src/features/warehouse` | 0 lỗi. |

Test trả NCC: Owner duyệt trực tiếp, duyệt không trừ tồn, xuất trả chỉ trừ vị trí đã chọn và trừ một lần khi gọi lặp; duyệt + xuất trong một bước; Family lập/sửa/gửi duyệt, cần lý do, không duyệt/xuất được, STAFF bị chặn; trả một phần, nhiều lần, vượt số còn được trả (kể cả phần đang giữ bởi phiếu `APPROVED`); thiếu tồn, sai vị trí, vượt số tại vị trí/phần chưa xếp, lỗi thì hoàn tác cả bước duyệt; hủy phiếu `APPROVED` giải phóng số giữ chỗ; hai lần xuất trả đồng thời chỉ một thành công, tồn không âm.

**Chưa kiểm chứng:** MySQL thật và migration trên DB thật; UI với backend thật.

## Đợt 04/11/2026 — Đặt hàng nhập / nhập hàng / trả NCC

Chạy trên máy người dùng (Windows, JDK 21 biên dịch target 17, Maven 3.9.16, Node 24). **Không kết nối DB thật**; mọi test backend dùng H2 in-memory.

| Lệnh | Kết quả | Phạm vi kết luận |
|---|---|---|
| `mvn test` (thư mục backend) | BUILD SUCCESS, 276 test, 0 fail (gồm 19 test `WarehouseOrderFlowTest`; lần chạy cuối sau khi cho giá bán tùy chọn). Kiểm tra giá bán NULL chạy trên H2 **sau khi mô phỏng ALTER**; DB thật chưa chạy SQL. | Spring context nạp được bean mới (integration test auth/account dùng H2). Luồng kho chạy trên H2 với bảng mô phỏng dump (`warehouse-flow-schema.sql`), không phải MySQL thật. |
| `npm run test:warehouse` | 7 kiểm tra pass (`tests/run-warehouse.mjs`, khôi phục script bị thiếu). | Logic thuần `checkImport` (Excel), không có browser/backend. |
| `PLAYWRIGHT_CHANNEL=chrome node tests/run-order-ui.mjs` | Pass. | Smoke test UI với API **giả lập**: danh sách/chi tiết phiếu đặt, chọn NCC trước, chọn hàng qua hai tab, tạo nhanh hàng mới với số lượng đặt/giá nhập/giá bán dự kiến (validate 0, âm, số lẻ, giá trống/âm, trùng dòng; lỗi API giữ dữ liệu; double-click tạo 1 lần; catalog chỉ nhận giá bán; dòng vào phiếu đúng 10×80.000 và 5×90.000), cảnh báo đổi NCC, lưu lỗi rồi lưu lại không tạo lại sản phẩm, Family không thấy nút tạo. Không kiểm chứng backend thật. Cần Chrome hệ thống (chưa tải trình duyệt Playwright). |
| `npm run build` | Thành công. | Build production; cảnh báo chunk lớn có sẵn từ trước. |
| `eslint` các file kho đã sửa | 0 lỗi; cảnh báo prettier CRLF có sẵn trên toàn repo (core.autocrlf=true). | Chỉ các file kho đã sửa/tạo. |

`WarehouseOrderFlowTest` bao phủ: tạo phiếu nhiều biến thể; xác nhận phiếu đặt không đổi tồn; 100 → 60 + 40 (tồn chỉ tăng khi Owner xác nhận, nháp/chờ duyệt không tăng); 60 + 25 rồi đóng thiếu 15 giữ lịch sử; nhận vượt bị chặn kèm số liệu (Family và Owner); thay thế màu/size và đổi giá bị chặn, giá đặt gốc giữ nguyên; xác nhận lặp/retry chỉ tăng tồn một lần; phiếu thứ hai bị kiểm tra lại; `WAREHOUSE_STALE` khi số còn thiếu đã đổi; hai luồng xác nhận đồng thời chỉ một thành công; hủy phiếu đặt đã xác nhận chỉ khi chưa nhập; sao chép không mang lịch sử; quyền backend (Family/Staff); lịch sử hàng theo NCC (chỉ CONFIRMED/CLOSED, NCC mới rỗng, phân biệt dấu, lọc danh mục, phân trang); danh sách lọc/phân trang ở backend; tạo nhanh tồn 0 + không bán online + chống trùng khi retry + giá bán không bị phiếu nhập ghi đè; trả NCC **bị CHECK của dump từ chối**; với CHECK đề xuất thì trả giảm tồn đúng một lần và không vượt số đã nhận chưa trả.

**Chưa kiểm chứng:** chạy với MySQL/DB thật; UI với backend thật; file Excel thực tế; các nghiệp vụ còn chờ schema (xem `SCHEMA_PROPOSAL_PURCHASE_RECEIVING.md`). Snapshot kho dùng `product_detail.barcode` không có trong dump — nếu DB thật giống dump thì màn hình kho lỗi trước cả các luồng trên.

---

## Checkpoint 28/10/2026 (giữ nguyên để đối chiếu)

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
