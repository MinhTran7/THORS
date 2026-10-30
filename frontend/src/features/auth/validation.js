import * as Yup from 'yup';

export const password = Yup.string()
  .required('Nhập mật khẩu.')
  .min(10, 'Mật khẩu cần ít nhất 10 ký tự.')
  .max(64, 'Mật khẩu tối đa 64 ký tự.')
  .test(
    'bytes',
    'Mật khẩu tối đa 72 byte.',
    (v) => !v || new TextEncoder().encode(v).length <= 72
  );

export const confirmation = Yup.string()
  .required('Xác nhận mật khẩu.')
  .oneOf([Yup.ref('password')], 'Mật khẩu xác nhận không khớp.');

export const identity = Yup.string()
  .trim()
  .email('Email không hợp lệ.')
  .required('Nhập email.');

export const registerSchema = Yup.object({
  fullName: Yup.string()
    .trim()
    .required('Nhập họ tên.')
    .max(100, 'Họ tên tối đa 100 ký tự.'),
  identifier: identity,
  password,
  confirmPassword: confirmation
});

export const safeReturn = (path) =>
  typeof path === 'string' &&
  path.startsWith('/') &&
  !path.startsWith('//') &&
  !path.includes('\\') &&
  !path.startsWith('/login') &&
  !path.startsWith('/register') &&
  !path.startsWith('/auth')
    ? path
    : '/workspace';