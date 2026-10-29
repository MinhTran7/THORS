# Quyết định và yêu cầu cần giữ khi tiếp tục

## Cách xử lý nguồn thông tin

| Khi cần xác định | Nguồn cần đọc |
|---|---|
| Chương trình hiện đang làm gì | Source hiện tại và kết quả chạy đúng phiên bản. |
| Dump cho phép dữ liệu gì | `database/SQL_v1.sql`; với DB đang chạy cần đối chiếu schema thật nếu có quyền truy cập. |
| Người dùng muốn gì | Yêu cầu hiện tại và những quyết định nghiệp vụ đã xác nhận. |
| Việc nào thực sự đã qua kiểm thử | `VERIFICATION.md` hoặc kết quả có ngày/phiên bản cụ thể. |

Source và schema có thể mâu thuẫn. Khi đó không tự tuyên bố một phía đã được cập nhật ở DB thật; ghi chênh lệch, xác định mục tiêu và hướng xử lý trước khi thay đổi.

## Quyết định còn hiệu lực trong snapshot/bối cảnh

| Quyết định | Bằng chứng và tác động |
|---|---|
| Phạm vi một cửa hàng/một kho | Module kho không có warehouse_id/shop_id. Không suy ra đã hỗ trợ nhiều Owner độc lập hay nhiều chi nhánh. |
| Sản phẩm → biến thể màu/size | `product_detail.detail_id` là đơn vị tham chiếu tồn kho/chứng từ/vị trí. |
| Tổng tồn khác tồn theo vị trí | `product_detail.stock_quantity` là tổng; `product_location` là phân bổ. Không lấy việc gán kệ làm một lần nhập hàng. |
| Owner là người duyệt kho | Xác nhận nhập/trả và thay đổi vị trí/bố cục được WarehousePolicy giới hạn. |
| Kho chỉ OWNER/FAMILY_MEMBER | Yêu cầu mới hơn và code hiện tại đều chặn STAFF/ADMIN/CUSTOMER. Mô tả tháng 9 cho Staff sửa kho là bối cảnh cũ. |
| Family tạo phiếu nhập của mình | Không tạo phiếu đặt/trả, không tự xác nhận; chỉ sửa/gửi nháp do mình tạo. |
| Đơn đặt và nhập hàng là hai nghiệp vụ | Đặt không tăng tồn; nhận nhiều đợt; nhập dùng dòng nguồn/giá nguồn. |
| Excel ở cả bước tạo phiếu đặt và phiếu nhập | Người dùng yêu cầu; DocumentForm đã có tích hợp. Áp dụng Excel chỉ điền form, chưa ghi DB/tăng tồn. |
| Vị trí cần ảnh thực tế | Lần đầu gán cần mô tả/ảnh; giữ ít nhất một ảnh khi còn hàng. |
| Tầng FULL vẫn được tra cứu | Trạng thái chặn nhận thêm, không biến dữ liệu vị trí thành không thể xem. |
| Giữ lịch sử | Phiếu xác nhận không sửa/hủy trực tiếp; kệ/tầng dùng is_active, ảnh dùng deleted_at; auth phụ thuộc audit_log. |
| DINOv2 dự kiến chạy nội bộ | Đây là định hướng, không được mô tả như External API hoặc tính năng đã hoàn thành. |
| Không dựa vào barcode/QR cho đặc trưng tìm hàng | Định hướng đã trao đổi là tìm bằng ảnh và sơ đồ vị trí; không tự thay đặc trưng này. |

## Các điểm đã thay đổi so với tài liệu cũ

- **Database:** README cũ nói `thors`/file MySQL init; snapshot đang có dump `SQL_v1.sql` tạo `thors_restore`, local.properties cũng chọn database này.
- **Auth:** README cũ nói login email/phone, OTP SMS. Luồng hiện tại chỉ email/OTP email; phone còn là thông tin liên hệ.
- **Kho:** README cũ nói chưa triển khai kho, trong khi source hiện đã có module kho lớn.
- **Route kho:** các đường dẫn cũ như `/warehouse/map`, `/warehouse/search`, `/warehouse/assign` không có trong router hiện tại; hiện dùng `locations`, `layout`, `inventory`, `orders`, `receipts`, `returns`, `suppliers`.
- **Trạng thái chứng từ:** các tên mô tả trước đây như Revision Requested/Received chưa có tương đương đầy đủ trong source. Không tự đổi status trong DB/UI theo tài liệu cũ.
- **Family/Staff:** đổi nhãn UI không đồng nghĩa đã xóa role STAFF. AccountService vẫn quản lý cả STAFF và FAMILY_MEMBER.
- **Cloudinary:** lỗi cấu hình trước đây được người dùng báo đã bổ sung. Snapshot có các khóa đã điền; kiểm chứng runtime lại khi cần, không chép lỗi cũ thành lỗi đang xảy ra.

## Cách cộng tác với người dùng

Người dùng muốn AI mới hiểu đã làm gì, đang dở gì và tiếp tục đúng chỗ. Khi được giao sửa code, nêu phạm vi dự kiến và hỏi những điểm nghiệp vụ thực sự chưa rõ trước khi triển khai. Danh sách phát hiện trong checkpoint không tự tạo quyền sửa schema, đổi nghiệp vụ hoặc chạy tác vụ trên DB thật.

Người dùng thường muốn biết chính xác file cần thay và có thể muốn xem nội dung trực tiếp để copy. Khi sửa về sau, liệt kê file và lý do; với thay đổi nhỏ có thể cung cấp đoạn/file đầy đủ theo yêu cầu. Bản docs này được tạo theo phạm vi đã giao, không phải đề xuất viết lại toàn bộ ứng dụng.
