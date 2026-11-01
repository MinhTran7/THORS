const KEY = 'thors:pending-cart';
const MAX_AGE_MS = 60 * 60 * 1000; // quá 1 giờ thì bỏ

// TODO: đổi thành đường dẫn trang đặt hàng của khách (ví dụ '/checkout' hoặc '/orders/new').
// Khi chưa có trang đặt hàng, tạm dùng trang giỏ hàng.
export const CHECKOUT_PATH = '/cart';

export function savePending(item) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...item, savedAt: Date.now() }));
  } catch {
    /* trình duyệt chặn lưu trữ: bỏ qua, khách chọn lại sau khi đăng nhập */
  }
}

export function takePending() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY); // chỉ dùng một lần
    const pending = JSON.parse(raw);
    if (!pending || Date.now() - pending.savedAt > MAX_AGE_MS) return null;
    return pending;
  } catch {
    return null;
  }
}