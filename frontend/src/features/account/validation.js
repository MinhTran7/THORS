import * as Yup from 'yup';

// Cùng quy tắc với backend: mật khẩu 10–64 ký tự, tối đa 72 byte.
export const newPassword = Yup.string()
  .required('Enter a password.')
  .min(10, 'Use at least 10 characters.')
  .max(64, 'Use at most 64 characters.')
  .test('bytes', 'Use at most 72 bytes.', (value) => !value || new TextEncoder().encode(value).length <= 72);

export const confirmPassword = Yup.string()
  .required('Confirm the password.')
  .oneOf([Yup.ref('password')], 'The passwords do not match.');

export const fullName = Yup.string().trim().required('Enter a name.').max(100, 'Use at most 100 characters.');

export const phone = Yup.string()
  .trim()
  .matches(/^[+0-9][0-9 ()\-.]{7,19}$/, { message: 'Enter a valid phone number.', excludeEmptyString: true });