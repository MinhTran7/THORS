import { createContext, useContext, useEffect, useState } from 'react';
import { api, post, clearCsrf } from 'services/http';
/**
 * NƠI LƯU "AI ĐANG ĐĂNG NHẬP" cho cả app (React Context).
 * App.jsx bọc toàn bộ ứng dụng trong <AuthProvider>; màn hình nào cần thì gọi useAuth().
 * Đăng nhập thành công, LoginPage gọi setAccount(...) để lưu tài khoản vào đây.
 */
const Context = createContext();
export function AuthProvider({ children }) {
  // account: tài khoản đang đăng nhập (null = chưa đăng nhập)
  const [account, setAccount] = useState(null);
  // loading: đang hỏi server lúc mở app; failure: câu lỗi nếu không hỏi được (không tính 401)
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  // Hỏi server "phiên hiện tại là ai": GET /api/auth/me (dựa vào cookie JSESSIONID)
  async function reload() {
    try {
      setAccount(await api('/auth/me'));
      setFailure('');
    } catch (e) {
      setAccount(null);
      if (e.status !== 401) setFailure(e.message);
    }
  }
  // Mở app (hoặc F5): hỏi server một lần để biết còn đăng nhập không
  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);
  // http.js phát sự kiện 'thors:unauthorized' khi gặp lỗi 401 → xóa tài khoản đang lưu
  useEffect(() => {
    const clear = () => setAccount(null);
    const mustChange = () => setAccount((a) => (a ? { ...a, passwordChangeRequired: true } : a));
    window.addEventListener('thors:unauthorized', clear);
    window.addEventListener('thors:password-change-required', mustChange);
    return () => {
      window.removeEventListener('thors:unauthorized', clear);
      window.removeEventListener('thors:password-change-required', mustChange);
    };
  }, []);
  // Đăng xuất: POST /api/auth/logout, xóa tài khoản và CSRF token đang giữ
  async function logout() {
    await post('/auth/logout');
    setAccount(null);
    clearCsrf();
  }
  return <Context.Provider value={{ account, setAccount, loading, failure, reload, logout }}>{children}</Context.Provider>;
}
// Màn hình gọi useAuth() để lấy { account, setAccount, loading, failure, reload, logout }
export const useAuth = () => useContext(Context);
