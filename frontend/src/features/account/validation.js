import * as Yup from 'yup';

// Cùng quy tắc với backend: mật khẩu 10–64 ký tự, tối đa 72 byte.
export const newPassword = Yup.string()
  .required('Nhập mật khẩu.')
  .min(10, 'Dùng ít nhất 10 ký tự.')
  .max(64, 'Dùng tối đa 64 ký tự.')
  .test('bytes', 'Mật khẩu tối đa 72 byte.', (value) => !value || new TextEncoder().encode(value).length <= 72);

export const confirmPassword = Yup.string()
  .required('Nhập lại mật khẩu để xác nhận.')
  .oneOf([Yup.ref('password')], 'Hai mật khẩu không khớp.');

export const fullName = Yup.string().trim().required('Nhập họ và tên.').max(100, 'Dùng tối đa 100 ký tự.');

export const phone = Yup.string()
  .trim()
  .matches(/^[+0-9][0-9 ()\-.]{7,19}$/, { message: 'Nhập số điện thoại hợp lệ.', excludeEmptyString: true });