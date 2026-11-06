// Kiểm tra nhanh ảnh đại diện trên trình duyệt trước khi xem trước. Ảnh chỉ được gửi lên backend
// (và backend đẩy lên Cloudinary) khi người dùng bấm Lưu; backend kiểm tra lại nội dung ảnh.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Trả về thông báo lỗi, hoặc '' nếu ảnh dùng được. */
export function imageError(file) {
  if (!['image/jpeg', 'image/png'].includes(file.type)) return 'Vui lòng chọn ảnh JPG hoặc PNG.';
  if (file.size > MAX_IMAGE_BYTES) return 'Ảnh đại diện tối đa 5 MB.';
  return '';
}
