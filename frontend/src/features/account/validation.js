import * as Yup from 'yup';

// Luật mật khẩu mới (6–64 ký tự, tối đa 72 byte) và ô xác nhận: dùng chung một bản với màn hình
// đăng ký / đặt lại mật khẩu (features/auth/validation.js), không viết lại ở đây.
export { password as newPassword, confirmation as confirmPassword } from 'features/auth/validation';

export const fullName = Yup.string().trim().required('Nhập họ và tên.').max(100, 'Dùng tối đa 100 ký tự.');

export const phone = Yup.string()
  .trim()
  .matches(/^[+0-9][0-9 ()\-.]{7,19}$/, { message: 'Nhập số điện thoại hợp lệ.', excludeEmptyString: true });