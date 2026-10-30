# THORS — Tài liệu dự án và bàn giao cho AI

**Checkpoint: 28/10/2026.** Được lập từ mã nguồn, lịch sử Git và database trong `THORS_Git.zip` do người dùng gửi. Mục tiêu là để một AI ở cuộc chat mới có thể tiếp tục dự án mà không phải đoán lại bối cảnh.

## Bắt đầu từ đâu?

1. Đọc [AI_HANDOFF.md](AI_HANDOFF.md) trước để nắm trạng thái và các điểm dễ hiểu nhầm.
2. Đọc [CURRENT_TASKS.md](CURRENT_TASKS.md) để biết phần còn dang dở và ưu tiên đề xuất.
3. Đọc tài liệu nghiệp vụ tương ứng, sau đó mở các file được chỉ dẫn trong [SOURCE_MAP.md](SOURCE_MAP.md).
4. Kiểm tra code hiện tại nếu nó đã được sửa sau checkpoint này.

## Danh mục tài liệu

| File | Nội dung |
|---|---|
| [AI_HANDOFF.md](AI_HANDOFF.md) | Bản bàn giao ngắn, điều cần giữ và lời nhắn dùng ở chat mới. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Công nghệ, cấu trúc và luồng dữ liệu giữa frontend/backend/database. |
| [FEATURES.md](FEATURES.md) | Chức năng đã có, trạng thái tích hợp và phân quyền hiện tại. |
| [WORK_LOG.md](WORK_LOG.md) | Những công việc đã xác định được từ code, Git và trao đổi trước. |
| [CURRENT_TASKS.md](CURRENT_TASKS.md) | Lỗi/điểm thiếu đã thấy, phần cần kiểm chứng và tiêu chí hoàn thành. |
| [DECISIONS.md](DECISIONS.md) | Quyết định nghiệp vụ, yêu cầu trước đây và cách xử lý khi tài liệu khác nhau. |
| [DATABASE.md](DATABASE.md) | Database đang dùng, quan hệ dữ liệu và chênh lệch với code. |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | Từ điển cột và khóa của đủ 29 bảng trong dump. |
| [API_REFERENCE.md](API_REFERENCE.md) | Danh sách endpoint có trong controller và hợp đồng dữ liệu quan trọng. |
| [WAREHOUSE_FLOW.md](WAREHOUSE_FLOW.md) | Đặt–nhập–trả hàng, tổng tồn, vị trí, kệ/tầng và trạng thái chứng từ. |
| [EXCEL_IMPORT.md](EXCEL_IMPORT.md) | Cách đọc Excel, đối chiếu biến thể, kiểm tra lỗi và áp dụng vào phiếu. |
| [CONFIGURATION.md](CONFIGURATION.md) | Chạy từ source, cấu hình DB/OTP/OAuth/Cloudinary và lưu ảnh kho. |
| [VERIFICATION.md](VERIFICATION.md) | Những gì đã kiểm tra trong lượt bàn giao và giới hạn của kết quả. |
| [SOURCE_MAP.md](SOURCE_MAP.md) | Bản đồ file, vị trí cần đọc/sửa và dấu vân tay của snapshot. |

## Ý nghĩa trạng thái

- **Có trong source:** đã thấy code triển khai, chưa đồng nghĩa đã chạy đúng đầu cuối.
- **Đã nối route:** có thể xác định đường dẫn trong router hiện tại.
- **Chưa tích hợp:** có component/API nhưng thiếu một phần nối với ứng dụng.
- **Lệch schema:** hành vi trong code không được file SQL đi kèm cho phép.
- **Chưa kiểm chứng runtime:** cần chạy thử với môi trường và dữ liệu phù hợp.
- **Định hướng:** yêu cầu/bối cảnh trước đây, chưa thấy triển khai trong snapshot.

Nhãn bằng chứng dùng trong tài liệu: `[CODE]`, `[DB_DUMP]`, `[GIT]`, `[CONTEXT]`, `[CHECK]`. Với các thông tin trước đây mâu thuẫn bản source hiện tại, tài liệu nêu rõ cả hai thay vì coi mô tả cũ là trạng thái hoàn thành.

## Đặt bộ tài liệu vào dự án

Giải nén gói tài liệu vào thư mục gốc, để `docs/` nằm cùng cấp với `backend/`, `frontend/`, `database/` và `scripts/`.

Khi gửi dự án sang chat khác, gửi kèm thư mục này và nhắn: **“Đọc `docs/AI_HANDOFF.md` và `docs/CURRENT_TASKS.md` trước khi tiếp tục.”**

## Phạm vi checkpoint

Lượt này bổ sung tài liệu bàn giao, không triển khai các đề xuất sửa lỗi trong danh sách công việc. Mã nghiệp vụ và file SQL gốc được giữ nguyên. Không đưa mật khẩu, API secret, token hoặc các bản ghi người dùng thật vào tài liệu.
