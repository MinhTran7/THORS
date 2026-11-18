import { useState } from 'react';
import { Alert, Button, Stack } from '@mui/material';
import { Formik, Form } from 'formik';

/**
 * KHUÔN FORM DÙNG CHUNG cho mọi màn hình xác thực (đăng nhập, đăng ký, quên mật khẩu, nhập OTP,
 * đặt lại mật khẩu, hoàn tất Facebook). Gom phần giống nhau: giữ giá trị các ô, kiểm tra dữ liệu,
 * nút gửi, hiện lỗi / thành công.
 * Khung màn hình và ô nhập nằm ở ShopAuthShell.jsx (ShopAuthShell, ShopField).
 */

/**
 * FORM CHUNG dùng thư viện Formik (quản lý form) + Yup (luật kiểm tra).
 *
 * Tham số (màn hình gọi tới truyền vào):
 *   - initialValues: giá trị ban đầu các ô, vd { identifier: '', password: '' }
 *   - schema       : luật kiểm tra Yup. Formik tự kiểm tra theo luật này; bấm nút mà còn lỗi
 *                    thì Formik DỪNG, không gọi onSubmit → không có request nào được gửi.
 *   - onSubmit     : việc cần làm khi dữ liệu hợp lệ (ở đăng nhập là hàm login() của LoginPage)
 *   - submitLabel  : chữ trên nút, vd "Đăng nhập"
 *   - children     : hàm vẽ các ô nhập, nhận `form` để biết giá trị / lỗi của từng ô
 *
 * Lưu ý: Formik kiểm tra ngầm cả khi gõ và khi rời ô, nhưng ô ShopField chỉ HIỆN lỗi
 * sau khi đã bấm nút ít nhất 1 lần (xem ShopAuthShell.jsx).
 */
export function FieldsForm({ initialValues, schema, onSubmit, submitLabel, children }) {
  // Câu lỗi (khung đỏ) và câu thành công (khung xanh) hiện ở đầu form; ban đầu trống
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  return (
    <Formik
      enableReinitialize
      initialValues={initialValues}
      validationSchema={schema}
      onSubmit={async (values, helpers) => {
        // Chỉ chạy khi bấm nút VÀ dữ liệu đã qua luật `schema`.
        // values = giá trị các ô; helpers = công cụ Formik đưa kèm (vd setSubmitting).
        // Xóa thông báo của lần bấm trước
        setError('');
        setSuccess('');
        try {
          // Gọi việc của màn hình (đăng nhập: login() → POST /api/auth/login) và chờ xong
          const result = await onSubmit(values, helpers);
          // Nếu hàm trả về một câu chữ thì hiện khung xanh (login() không trả gì nên bỏ qua)
          if (typeof result === 'string') setSuccess(result);
        } catch (e) {
          // Server báo lỗi (401 sai mật khẩu, 429 đang bị khóa, 403 tài khoản bị khóa...) → hiện khung đỏ
          setError(e.message);
        } finally {
          // Dù thành công hay lỗi: báo Formik "gửi xong" để mở khóa nút bấm
          helpers.setSubmitting(false);
        }
      }}
    >
      {/* form = trạng thái hiện tại của Formik: values, errors, touched, isSubmitting, submitCount... */}
      {(form) => (
        // noValidate: tắt kiểm tra mặc định của trình duyệt, chỉ dùng luật Yup (câu lỗi tiếng Việt)
        <Form noValidate>
          <Stack spacing={2.5}>
            {/* Khung đỏ: lỗi server trả về */}
            {error && (
              <Alert severity="error" role="alert">
                {error}
              </Alert>
            )}
            {/* Khung xanh: câu thành công */}
            {success && <Alert severity="success">{success}</Alert>}
            {/* Các ô nhập do màn hình truyền vào (đăng nhập: ô Email, ô Mật khẩu, link Quên mật khẩu) */}
            {children(form)}
            {/* Nút gửi: bị khóa và đổi chữ thành "Đang xử lý…" trong lúc chờ server, tránh bấm 2 lần */}
            <Button type="submit" variant="contained" size="large" disabled={form.isSubmitting} fullWidth>
              {form.isSubmitting ? 'Đang xử lý…' : submitLabel}
            </Button>
          </Stack>
        </Form>
      )}
    </Formik>
  );
}
