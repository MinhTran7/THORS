# Công việc đã làm và checkpoint

Đây là bản tổng hợp bằng chứng, không phải nhật ký đầy đủ mọi lần sửa. Không gán tác giả hoặc ngày hoàn thành cho các thay đổi chỉ thấy trong working tree.

## Các mốc xác định được

| Mốc | Nguồn | Nội dung và giới hạn |
|---|---|---|
| 25–28/09/2026 | CONTEXT | Xác lập mục tiêu THORS, đặc trưng tìm bằng ảnh/sơ đồ kho, cấu trúc kho → kệ → tầng; ban đầu kệ A–D/tầng 1–5. Phân quyền kho lúc đó còn rộng hơn bản hiện tại. |
| 09–10/10/2026 | CONTEXT | Trao đổi luồng nhập hàng do Owner xác nhận, nền auth/account trên schema 29 bảng; DINOv2 được xác định là chạy nội bộ. Các kết quả test lịch sử không phải kết quả của snapshot này. |
| 19/10/2026 và trao đổi tiếp | CONTEXT | Người dùng yêu cầu cải thiện bố cục kho 2D, giới hạn xem kho ở OWNER/FAMILY_MEMBER, hỗ trợ Excel khi tạo cả phiếu đặt và phiếu nhập. |
| 21/10/2026 | GIT `4169ae4` | Commit có tiêu đề sửa route edit staff. Router trong working tree hiện tại lại thiếu nhóm route đó; không dùng tiêu đề commit để khẳng định trạng thái hiện hành. |
| 22/10/2026 | GIT `53bfb9f` | Có commit bổ sung Cloudinary trong application-test.yml. Source hiện tại vẫn dùng Cloudinary bean cần ba thuộc tính cấu hình. |
| 22/10/2026 | GIT `fa75185` | Commit đổi nhãn staff thành family. STAFF vẫn tồn tại trong role/schema/AccountService ở snapshot hiện tại. |
| 22/10/2026 | CONTEXT | Người dùng cho biết đã bổ sung cấu hình Cloudinary và chạy được. local.properties trong ZIP có đủ tên khóa Cloudinary với giá trị đã điền; chưa gọi dịch vụ thật trong lượt này. |
| 22/10/2026 | GIT `c76cb9d` | Commit HEAD trong ZIP: `Merge latest main into Minh_Tran`, branch `Minh_Tran`. Không phải toàn bộ code mới nhất đã được commit. |
| 27–28/10/2026 | CONTEXT | Trao đổi gần nhất nhấn mạnh quan hệ đặt–nhập–trả, Owner xác nhận mới tăng/giảm tồn, phân biệt thiếu hàng với chưa xếp vị trí, import Excel có đối chiếu/preview. |
| 28/10/2026 | CHECK | Người dùng gửi THORS_Git.zip gồm toàn dự án và DB đang dùng, yêu cầu tạo docs để bàn giao cho AI khác. |

## Những khối công việc đã thấy kết quả trong source

1. **Nền xác thực:** email/password/OTP, thu hồi phiên, lockout, Google/Facebook, các trang auth và route bảo vệ.
2. **Tài khoản/hồ sơ:** trang và API quản lý, phạm vi người tạo, reset bởi quản lý, nhật ký, xuất CSV.
3. **Catalog:** Category và Product, biến thể, ảnh Cloudinary, thống kê sản phẩm; còn thiếu tích hợp route.
4. **Kho:** WarehousePolicy/Store/Documents/Layout/Photos, các màn tồn kho/chứng từ/nhà cung cấp/vị trí.
5. **Bố cục 2D:** cặp thuật toán Java/JS, phát hiện chồng lấn, chuẩn hóa bố cục, đặt kệ tương đối, xếp gọn theo hàng, chỉnh/kéo kệ.
6. **Excel:** ExcelImportDialog, excelImport.js, excelWorkbook.js và tích hợp trong DocumentForm cho cả hai loại phiếu.

Các mục này ghi nhận **đã có code**. Những phần chưa nối route, lệch schema, thiếu test hoặc chưa thử runtime được ghi trong `CURRENT_TASKS.md`.

## Trạng thái Git khi nhận

ZIP chứa `.git` và nhiều thay đổi trong index/working tree chưa commit. Nhóm kho có file thêm mới cùng thay đổi tiếp sau; router, cấu hình và các module khác cũng có thay đổi so với HEAD. File SQL mới là `database/SQL_v1.sql`; một số tên SQL cũ trong Git không còn trong ZIP hiện tại.

Vì vậy, source thực tế trong ZIP là đầu vào của checkpoint; không checkout/reset về HEAD chỉ để làm working tree sạch. Một phần thay đổi hiển thị có thể liên quan định dạng dòng, nên phải đọc diff nội dung trước khi suy ra khối lượng công việc.

## Đã thực hiện trong lượt tạo tài liệu này

- Kiểm kê source, router, controller/service/repository, cấu hình, schema và các file kiểm thử.
- Đối chiếu thông tin lịch sử với code; cập nhật nhận định MySQL/thors_restore và auth email-only.
- Phát hiện JAR cũ, route thiếu, CHECK không hỗ trợ supplier return và script test kho bị thiếu.
- Kiểm tra cú pháp 160 JS/JSX, thử lệnh test/build và ghi giới hạn môi trường.
- Tạo bộ `docs/*.md`, kiểm tra liên kết, đường dẫn tham chiếu và nội dung không chứa secret cấu hình thật.

Không sửa code nghiệp vụ, cấu hình chạy thật hoặc database trong lượt này. Không tạo commit, đẩy Git hoặc triển khai dịch vụ.

## Cách cập nhật về sau

Sau mỗi phần việc, thêm ngày, yêu cầu cụ thể, file đã sửa, kết quả kiểm thử thực sự và việc còn lại. Đồng thời cập nhật AI_HANDOFF/CURRENT_TASKS nếu trạng thái thay đổi; không để kết luận “còn lỗi” tồn tại sau khi đã có bằng chứng sửa xong.
