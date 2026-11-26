import * as Yup from 'yup';

// Luật mật khẩu mới (6–64 ký tự, tối đa 72 byte) và ô xác nhận: dùng chung một bản với màn hình
// đăng ký / đặt lại mật khẩu (features/auth/validation.js), không viết lại ở đây.
export { password as newPassword, confirmation as confirmPassword } from 'features/auth/validation';

export const fullName = Yup.string().trim().required('Nhập họ và tên.').max(100, 'Dùng tối đa 100 ký tự.');

// Số điện thoại: đúng 10 chữ số, bắt đầu bằng 0 (cho phép gõ khoảng trắng, dấu chấm, gạch ngang). Cùng luật
// với backend (ContactNormalizer.phoneInput).
export const phone = Yup.string()
  .trim()
  .test('vn-phone', 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.', (v) => !v || /^0\d{9}$/.test(v.replace(/[\s.-]/g, '')));

// Số cũ có thể đang lưu dạng +84xxxxxxxxx: đổi về 0xxxxxxxxx khi đưa vào form để không bị báo sai.
export const toLocalPhone = (v) => (v ? v.replace(/^\+84/, '0') : '');