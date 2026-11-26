import * as Yup from 'yup';

/**
 * LUẬT KIỂM TRA DỮ LIỆU NHẬP (Yup) dùng chung cho các màn hình xác thực,
 * và các hàm chọn trang chuyển tới sau khi đăng nhập.
 * Backend kiểm tra lại lần nữa (ContactNormalizer.java), nên luật ở đây chỉ để báo lỗi sớm cho người dùng.
 */

// Mật khẩu MỚI (đăng ký, đổi / đặt lại mật khẩu): 6–64 ký tự và tối đa 72 byte (giới hạn của BCrypt).
// Màn hình ĐĂNG NHẬP không dùng luật này, chỉ yêu cầu không để trống.
// features/account/validation.js dùng lại luật này (tên newPassword) cho đổi mật khẩu / tạo thành viên.
export const password = Yup.string()
  .required('Nhập mật khẩu.')
  .min(6, 'Mật khẩu cần ít nhất 6 ký tự.')
  .max(64, 'Mật khẩu tối đa 64 ký tự.')
  .test(
    'bytes',
    'Mật khẩu có nhiều chữ có dấu nên bị quá dài. Hãy bớt chữ có dấu hoặc rút ngắn mật khẩu.',
    (v) => !v || new TextEncoder().encode(v).length <= 72
  );

// Ô "Xác nhận mật khẩu": không trống và phải trùng ô password
export const confirmation = Yup.string()
  .required('Xác nhận mật khẩu.')
  .oneOf([Yup.ref('password')], 'Mật khẩu xác nhận không khớp.');

// Ô email (tên trường là identifier): bỏ khoảng trắng đầu/cuối, đúng dạng email, không trống.
// Dùng ở ĐĂNG NHẬP (LoginPage.jsx) và đăng ký.
export const identity = Yup.string()
  .trim()
  .email('Email không hợp lệ.')
  .required('Nhập email.');

// Bộ luật cho màn hình đăng ký
export const registerSchema = Yup.object({
  fullName: Yup.string()
    .trim()
    .required('Nhập họ tên.')
    .max(100, 'Họ tên tối đa 100 ký tự.'),
  identifier: identity,
  password,
  confirmPassword: confirmation
});

// Chỉ chấp nhận đường dẫn nội bộ an toàn để quay lại (bắt đầu bằng "/", không phải "//", không chứa "\",
// không quay lại chính các trang đăng nhập / đăng ký / xác thực). Sai thì về /workspace.
// Mục đích: chặn kẻ xấu gửi link ?returnTo=https://trang-gia-mao để đẩy người dùng sang web khác.
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

/**
 * Trang mở ra ngay sau khi ĐĂNG NHẬP:
 *  - Khách hàng: quay lại trang đang xem dở (giỏ hàng, sản phẩm, đặt hàng...).
 *  - Owner / Family Member / Admin: luôn vào Dashboard (/workspace), không quay lại trang trước.
 */
export const landingAfterLogin = (account, path) => (account?.role === 'CUSTOMER' ? safeReturn(path) : '/workspace');