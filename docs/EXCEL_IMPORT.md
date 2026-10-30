# Import Excel cho phiếu đặt và phiếu nhập

## Trạng thái

Yêu cầu người dùng là đưa cả file Excel vào lúc tạo phiếu đặt hàng **và** phiếu nhập hàng. Snapshot đã có code cho cả hai, không chỉ giao diện nút upload. Chưa được kiểm thử với file Excel thật của người dùng trong lượt bàn giao này.

| File | Trách nhiệm |
|---|---|
| `frontend/src/features/warehouse/DocumentForm.jsx` | Mở dialog, tải mẫu, nhận kết quả vào Formik, lưu phiếu qua API. |
| `ExcelImportDialog.jsx` | Chọn file/sheet/header, ghép cột, preview, sửa/chọn biến thể, bỏ dòng, xác nhận áp dụng. |
| `excelWorkbook.js` | Lazy-load ExcelJS, đọc workbook, lấy cell value, tạo template tải về. |
| `excelImport.js` | Nhận diện header, match biến thể, kiểm tra quantity/price/source/duplicate/supplier và tạo kết quả. |

## Luồng hiện tại

1. Mở tạo/sửa phiếu nháp. Với receipt phải chọn phiếu đặt CONFIRMED trước; phiếu trả không có nhánh import Excel trong form.
2. Tải mẫu hoặc chọn file `.xlsx` có sẵn.
3. Chọn sheet và dòng header; hệ thống đoán header trong 30 dòng đầu, tự ghép cột theo tên tiếng Việt/Anh.
4. Xem trước, chỉnh mapping và sửa thông tin dòng hoặc chọn biến thể thủ công khi chưa khớp; có thể bỏ qua dòng không dùng.
5. Xử lý dòng trùng, lỗi số lượng/giá/nguồn/NCC. Chỉ áp dụng khi báo cáo hợp lệ.
6. “Áp dụng vào phiếu” cập nhật form. Chưa gọi API lưu chứng từ, chưa tăng tồn.
7. Người dùng lưu nháp; gửi/Owner xác nhận là bước nghiệp vụ riêng.

File được đọc ở browser bằng ExcelJS; không có endpoint backend nhận workbook hoặc AI/LLM phân tích file. Backend nhận JSON phiếu chuẩn và vẫn validate lại dữ liệu khi lưu/submit/confirm.

## Định dạng và giới hạn

| Giới hạn | Giá trị trong code |
|---|---|
| File nhận | `.xlsx`; `.xls` phải chuyển sang `.xlsx`. Không có nhánh import CSV. |
| Kích thước file | Tối đa 5 × 1024 × 1024 byte. |
| Dòng dữ liệu | Tối đa 2.000 dòng không trống sau header. |
| Kích thước sheet trước đọc | rowCount không quá 2.030, columnCount không quá 80. |
| Biến thể trên một phiếu | Tối đa 200 dòng sau đối chiếu/gộp, tính cả các dòng có sẵn trên form. |
| Quantity | Số nguyên từ 1 đến 1.000.000 mỗi biến thể sau gộp. |
| Unit price của phiếu đặt | VNĐ nguyên từ 0 đến 999.999.999.999. |
| Công thức | Không tính hoặc lấy cached result; chuyển thành thông báo yêu cầu nhập giá trị. |
| Workbook lỗi/mật khẩu | Báo không đọc được; không tự mở khóa. |

Cell chuỗi/số, rich text và một số dạng text được chuyển thành chuỗi; kiểu không hỗ trợ và lỗi Excel được thể hiện trong preview. ExcelJS bỏ qua một số node hình/vẽ, không nhập ảnh workbook vào vị trí kho.

## Các cột mapping

| Trường | Header ví dụ | Cách dùng |
|---|---|---|
| detailId | Mã biến thể, detail_id, variant id | Ưu tiên xác định đúng biến thể trong THORS. |
| productId | Mã sản phẩm, product_id | Cần thêm màu/size khi một sản phẩm có nhiều biến thể. |
| productName | Tên sản phẩm, tên hàng, product name | Đối chiếu tên chuẩn hóa; không phải fuzzy matching hay AI. |
| color | Màu, màu sắc, color | Phân biệt biến thể. |
| size | Size, kích cỡ, kích thước | Phân biệt biến thể. |
| quantity | Số lượng, số lượng đặt/thực nhận, sl, qty | Bắt buộc mapping số lượng. |
| unitPrice | Đơn giá, giá nhập, unit_price | Dùng cho phiếu đặt; receipt lấy giá nguồn. |
| manufacturer | Nhà cung cấp, nhà sản xuất, NCC | Phiếu đặt; phải cùng một NCC và khớp form nếu form đã điền. |

Mỗi cột Excel chỉ ghép với một trường đang áp dụng. Cần có ít nhất một loại định danh: mã biến thể, mã sản phẩm hoặc tên. Mã là mã nội bộ THORS, chưa có bảng chuyển mã riêng của NCC.

## Đối chiếu sản phẩm/màu/size

Định danh tự động ưu tiên detailId, tiếp đến productId, rồi productName. Nếu file cung cấp thêm mã sản phẩm/tên/màu/size, các giá trị này tiếp tục lọc để phát hiện không khớp. Không có kết quả hoặc nhiều kết quả đều là lỗi cần xử lý; người dùng có thể chọn biến thể thủ công.

Tên/màu/size được normalize Unicode NFKC, bỏ khoảng trắng thừa và chuyển chữ thường theo locale vi. Header còn được bỏ dấu/chuẩn hóa riêng. Match nội dung không tự bỏ dấu hoặc đoán một sản phẩm gần giống; không tự tạo sản phẩm/biến thể mới từ file.

## Dòng trùng và dữ liệu đã có trên form

- Mặc định nhiều dòng cùng biến thể bị báo trùng. Bật gộp cho phép cộng số lượng nếu đơn giá giống nhau.
- Cùng biến thể nhưng khác đơn giá vẫn lỗi, không tự lấy giá cuối hoặc tính trung bình.
- Tổng sau gộp vẫn phải trong giới hạn số lượng và phần còn được nhập của nguồn.
- Nếu biến thể đã có trên form, kết quả import **thay thế dòng tương ứng**, không tự cộng vào quantity cũ. Các dòng khác đang có được giữ.
- Dialog báo số dòng thay thế; cần xem lại trước khi áp dụng. Một phiếu không tự tách thành nhiều phiếu theo NCC hoặc theo giới hạn 200 biến thể.

## Khác biệt giữa đặt và nhập

| Nội dung | PURCHASE_ORDER | RECEIPT |
|---|---|---|
| Nguồn | Không có sourceId | Phiếu đặt CONFIRMED đang chọn. |
| Danh sách có thể match | Catalog variants đang được cung cấp | Phải thuộc sourceItems của phiếu đặt. |
| Giá | Từ file/form, kiểm tra VNĐ nguyên | Bắt buộc lấy unit_price dòng nguồn. |
| Nhà cung cấp | Từ form/file, chỉ một tên nhất quán | Kế thừa phiếu đặt. |
| Giới hạn nhận | Giới hạn quantity chung | Không vượt source.quantity − source.handled_quantity. |
| sourceItemId | Không có | Được gắn receipt_item_id nguồn. |

## Template được tạo

Template gồm ba sheet: `DuLieu` (điền để import), `DanhMuc` (mã/tên/màu/size tham khảo), `HuongDan`. Với receipt, DanhMuc chỉ liệt kê dòng nguồn còn có thể nhập, kèm phần còn lại và giá nguồn. Cột quantity trên DuLieu đổi theo loại phiếu; phiếu đặt có giá và NCC.

Tên tải về: `THORS_Mau_Dat_Hang.xlsx` hoặc `THORS_Mau_Nhap_Hang.xlsx`. Đây là file được ứng dụng tạo khi người dùng bấm tải; bộ tài liệu không kèm một file giả định đã lấy từ DB thật.

## Kiểm chứng tiếp

Thử ít nhất một file đúng mẫu và một file thực tế của NCC. Kiểm tra đặc biệt `1,000`/`1.000`, số Excel bị đổi định dạng, thiếu màu/size, công thức, header nhiều dòng, nhiều sheet, dòng duplicate, stale source quantities và việc áp dụng vào form đang có dữ liệu. Kết quả phải ghi theo phiên bản code; hiện chưa có kết quả E2E được xác nhận.
