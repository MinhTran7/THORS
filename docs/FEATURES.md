# Ma trận chức năng và mức hoàn thành

Checkpoint 28/10/2026. “Có source” trong bảng không phải xác nhận đã chạy đúng trên database thật. Xem `VERIFICATION.md` để biết phạm vi kiểm chứng.

| Nhóm | Đã thấy triển khai | Tích hợp/điểm còn thiếu |
|---|---|---|
| Đăng ký Customer | Họ tên, email, mật khẩu/xác nhận; tạo PENDING_VERIFICATION; OTP email. | Có route `/register`, `/auth/verify`; cần SMTP và thử đầu cuối. |
| Đăng nhập | Email/mật khẩu; kiểm tra trạng thái, lockout, session. | Có `/login`; phone login và SMS đang tắt ở luồng auth hiện tại. |
| OTP | 6 số, 300 giây, chờ gửi lại 60 giây, tối đa 10 lần/giờ; 5 lần sai dẫn tới cooldown 15 phút. | Có code và test định nghĩa; chưa chạy lại trong lượt bàn giao. |
| Quên/đổi mật khẩu | OTP/grant reset, đổi bằng mật khẩu cũ, thu hồi phiên; yêu cầu reset Owner cho Admin xử lý. | Trang forgot/reset có route; trang đổi mật khẩu từ profile thiếu route. |
| Google/Facebook | Login/link, callback; Facebook có bước bổ sung email/xác minh. | Có route callback/complete; chưa kiểm chứng tài khoản dịch vụ thật. |
| Hồ sơ | Xem/sửa tên, phone, địa chỉ, avatar; email giữ nguyên trong update profile. | `/profile` có route; `/profile/edit`, `/profile/password` chưa có. |
| Quản lý account | List/filter/page/summary/detail/create/edit/status/lock/unlock/reset. | `/accounts` đã nối cho ADMIN/OWNER; các màn hình Staff/Family độc lập chưa nối. |
| Audit log | List/filter/summary/actions; frontend có trang và xuất CSV. | Backend chỉ ADMIN; `/system-log` chưa nối router. |
| Danh mục | Danh sách, tạo, sửa, đổi trạng thái. | FE và API có source; `/categories` chưa nối router. |
| Sản phẩm | Danh sách/chi tiết/thống kê, tạo/sửa/đổi trạng thái, biến thể màu–size–giá, ảnh. | FE và API có source; nhóm `/products...` chưa nối router. |
| Dashboard | Workspace có gọi thống kê sản phẩm và các vùng hiển thị quản trị. | Không được coi các card/bảng template là doanh thu/đơn hàng đã tích hợp. |
| Tồn kho | Tổng/đã xếp/chưa xếp, đang giữ, có thể bán, đang đặt; thống kê bấm lọc; tìm (tên/mã SP/mã biến thể/mã vạch), lọc màu/size/danh mục/vị trí/trạng thái, sắp xếp, phân trang phía backend, giữ bộ lọc trên URL; chi tiết biến thể; thẻ kho + lịch sử chuyển vị trí; ngưỡng tối thiểu; cảnh báo; xuất Excel toàn bộ kết quả lọc. | `/warehouse/inventory`; cần migration `2026-11-06_inventory.sql`. |
| Giữ hàng đơn bán | Kho chỉ đọc `order_item.reserved_quantity` để hiển thị đang giữ/có thể bán. | **Chưa tích hợp** vào đơn online/bán tại quầy (code của module khác, cần chủ module đồng ý). |
| Kiểm kê | Phiếu theo vị trí/phần chưa xếp, Family gửi xác nhận, Owner xác nhận/duyệt, chặn khi tồn đổi sau lúc đếm, chặn chênh lệch thiếu chứng từ. | `/warehouse/counts`; cần migration 06/11. |
| Báo cáo tồn kho | Nhập–xuất–tồn theo kỳ, giá trị tồn theo giá vốn bình quân phiếu nhập (Owner), Excel. | `/warehouse/report`. Chưa có phân hệ báo cáo chung — trang nằm trong Kho. |
| Phiếu đặt | Nháp, sửa/gửi/xác nhận/hủy/đóng; nhà cung cấp; nhiều dòng biến thể. | Có `/warehouse/orders`; không tăng tồn khi xác nhận. |
| Phiếu nhập | Liên kết đơn đặt, nhiều đợt nhập, giới hạn theo nguồn; Owner xác nhận tăng tồn. | Có `/warehouse/receipts`; Family tạo phiếu của mình. |
| Trả hàng nhà cung cấp | Chứng từ liên kết phiếu nhập; Owner duyệt (chưa trừ tồn) rồi xác nhận xuất trả theo vị trí đã chọn; ghi lịch sử. Sau xuất trả: hoàn tiền nhiều lần, giảm công nợ phiếu nhập, giữ/dùng tiền đối trừ, đổi hàng (nhập qua phiếu nhập từ phiếu trả). Thanh toán phiếu nhập nhiều lần và công nợ theo NCC. | Có `/warehouse/returns`, nút trong chi tiết phiếu nhập; cần migration `2026-11-05_supplier_settlement.sql` (SQL_v2 đã có phần 04/11). Phiếu nhập cũ cần khai báo số đã trả trước. |
| Nhập Excel | Cả phiếu đặt/phiếu nhập; mapping/preview/sửa dòng/gộp trùng/tải mẫu. | Đã tích hợp DocumentForm; chưa thử với file thực tế của người dùng. |
| Sơ đồ kệ/tầng | Xem, lọc vị trí, chỉnh kệ/tầng, kéo kệ, đặt tương đối, xếp gọn, tránh chồng lấn. | Có `/warehouse/locations`, `/warehouse/layout`; cần kiểm chứng hình ảnh thực tế. |
| Gán/chuyển vị trí | Gán hàng chưa xếp, chuyển giữa tầng, rút về chưa xếp; mô tả/ảnh; idempotency. | Trong LocationsPage/dialog; không phải các route `/warehouse/assign` cũ. |
| Nhà cung cấp | Tổng hợp tên, chứng từ, lượng nhận/trả và giá trị sau trả. | Có `/warehouse/suppliers`; chưa có bảng Supplier, danh bạ hay công nợ. |
| Thông báo kho | Phiếu chờ xác nhận, đơn đặt còn thiếu; Owner xem/đánh dấu đọc. | Dùng notification/user_notification; chưa có push realtime. |

## Quyền hiện tại của kho

| Thao tác | OWNER | FAMILY_MEMBER | ADMIN | STAFF | CUSTOMER |
|---|---|---|---|---|---|
| Vào trang kho / xem snapshot, chứng từ, ảnh, lịch sử | Có | Có | Không | Không | Không |
| Tạo phiếu đặt | Có | Không | Không | Không | Không |
| Lập/sửa nháp/gửi duyệt phiếu trả NCC | Có | Có (phiếu của mình) | Không | Không | Không |
| Duyệt / xác nhận xuất trả phiếu trả NCC | Có | Không | Không | Không | Không |
| Tạo phiếu nhập nháp | Có | Có | Không | Không | Không |
| Sửa/gửi phiếu nhập nháp | Có | Chỉ phiếu do mình tạo | Không | Không | Không |
| Xác nhận/từ chối/hủy/đóng chứng từ | Có, theo trạng thái hợp lệ | Không | Không | Không | Không |
| Thay đổi kệ/tầng/vị trí/mô tả/ảnh | Có | Không | Không | Không | Không |
| Thấy nút thông báo kho trong UI | Có | Không | Không | Không | Không |

Nguồn: `routes/index.jsx`, `ThorsLayout.jsx`, `WarehousePolicy.java`, `WarehouseLayout.java`, `WarehouseDocuments.java`. Backend notices vẫn kiểm tra quyền xem và lọc theo user; thông báo hiện được gửi cho Owner ACTIVE, không gửi chung cho mọi Family.

## Quyền tài khoản và catalog

- Account list/summary/detail/create/edit được kiểm tra trong AccountService: ADMIN có phạm vi quản trị; OWNER chỉ quản lý STAFF/FAMILY_MEMBER do mình tạo theo lịch sử audit.
- ADMIN tạo OWNER. OWNER vẫn có thể tạo STAFF hoặc FAMILY_MEMBER trong backend; nhãn Family trên UI không xóa role STAFF khỏi hệ thống.
- Khóa/mở khóa LOCKED là quyền Admin; Owner không tự mở tài khoản đã bị Admin khóa. Không ép ACTIVE cho tài khoản còn PENDING_VERIFICATION.
- Audit log chỉ ADMIN. Mỗi người được xem/cập nhật hồ sơ của mình theo API profile.
- ProductController/CategoryController chưa thấy kiểm tra vai trò riêng; SecurityConfig hiện áp dụng authenticated chung ngoài warehouse. Đây là điểm cần xử lý (`TASK-04`), không phải một chính sách quyền đã chốt cho Customer/Staff.

## Định hướng đã trao đổi nhưng chưa có source triển khai

POS/bán tại quầy, cửa hàng online/checkout, giỏ hàng, hóa đơn bán, thanh toán/refund, vận chuyển, khuyến mại/coupon, đổi trả khách hàng, ca làm, báo cáo doanh thu đầy đủ và các background job chưa có module nghiệp vụ tương ứng trong snapshot.

Tra cứu ảnh dự kiến dùng DINOv2 chạy nội bộ với dữ liệu sản phẩm riêng. Chưa thấy service embedding, vector index, model, endpoint tìm ảnh hoặc pipeline huấn luyện. Bảng `image_search` và ảnh Cloudinary không chứng minh đã có tính năng này.
