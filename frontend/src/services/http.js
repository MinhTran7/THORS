/**
 * HÀM GỌI API DÙNG CHUNG cho cả frontend.
 * Mọi request đi qua api(): tự gắn CSRF token, đổi body sang JSON, và biến lỗi của server thành ApiError.
 * Đường dẫn '/api/...' được vite.config.mjs chuyển sang backend (localhost:8080).
 */

// CSRF token đang giữ: { token, headerName }. Backend bắt mọi POST/PUT/DELETE phải gửi kèm token này.
let csrf;

/** Lỗi trả về từ server: status = mã HTTP (401, 403...), code = mã lỗi backend (vd CREDENTIALS). */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
// Lấy CSRF token mới: GET /api/auth/csrf (AuthController.csrf). Token gắn với phiên (cookie) hiện tại.
async function refreshCsrf() {
  const res = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  if (!res.ok) throw new ApiError(res.status, 'CONNECTION', 'Không kết nối được với hệ thống.');
  csrf = await res.json();
}
// Bỏ token đang giữ (sau khi đăng xuất hoặc bị 401/403) để lần gửi sau lấy token mới
export function clearCsrf() {
  csrf = undefined;
}
/**
 * Gửi request tới /api + path. options: { method, body (đổi sang JSON), form (FormData khi tải ảnh) }.
 * Thành công: trả dữ liệu JSON. Lỗi: ném ApiError với câu lỗi server gửi về.
 */
export async function api(path, options = {}) {
  const method = options.method || 'GET';
  // Request ghi dữ liệu (POST/PUT/DELETE) cần CSRF token: chưa có thì lấy trước
  if (!['GET', 'HEAD'].includes(method) && !csrf) await refreshCsrf();
  let response;
  try {
    // credentials 'same-origin': gửi kèm cookie JSESSIONID (phiên đăng nhập)
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(!options.form ? { 'Content-Type': 'application/json' } : {}),
        ...(!['GET', 'HEAD'].includes(method) ? { [csrf.headerName]: csrf.token } : {})
      },
      ...(options.form ? { body: options.form } : options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
    });
  } catch {
    // Không tới được server (mất mạng, backend tắt)
    throw new ApiError(0, 'CONNECTION', 'Không kết nối được với hệ thống. Vui lòng thử lại.');
  }
  const data = await response.json().catch(() => ({}));
  // Server trả lỗi (mã HTTP không phải 2xx). Backend gửi về { code, message } (ApiErrors.java)
  if (!response.ok) {
    // 401/403: phiên có thể đã đổi → bỏ CSRF token cũ
    if (response.status === 401 || response.status === 403) clearCsrf();
    // 401: báo cho AuthProvider xóa tài khoản đang lưu (coi như chưa đăng nhập)
    if (response.status === 401) window.dispatchEvent(new Event('thors:unauthorized'));
    if (response.status === 403 && data.code === 'PASSWORD_CHANGE_REQUIRED')
      window.dispatchEvent(new Event('thors:password-change-required'));
    throw new ApiError(response.status, data.code, data.message || 'Không xử lý được yêu cầu.');
  }
  return data;
}
// Viết tắt cho POST, vd post('/auth/login', { identifier, password })
export const post = (path, body) => api(path, { method: 'POST', body });
