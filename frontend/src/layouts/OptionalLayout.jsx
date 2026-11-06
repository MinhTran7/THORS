import { Outlet, useLocation } from 'react-router-dom';
import { CircularProgress, Stack } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import StorefrontLayout from './StorefrontLayout';
import ThorsLayout from './ThorsLayout';

// Trang chủ cửa hàng tự có header + footer riêng nên luôn hiển thị tràn màn hình, không bọc sidebar.
const STOREFRONT_PATHS = ['/'];

// Các trang của khách hàng dùng khung cửa hàng (header + footer của shop) thay cho sidebar quản trị.
// Owner / Family Member mở cùng đường dẫn vẫn thấy giao diện quản trị như cũ.
const CUSTOMER_STOREFRONT_PATHS = ['/orders'];
const inStorefront = (pathname) => CUSTOMER_STOREFRONT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Khung giao diện dùng cho cả trang công khai và trang cần đăng nhập:
 *  - Trang chủ cửa hàng ('/'): luôn là trang trần, kể cả khi đã đăng nhập.
 *  - Đã đăng nhập: có sidebar + header chung (ThorsLayout).
 *  - Chưa đăng nhập: chỉ hiện trang trần (trang shop tự có header riêng).
 * ThorsLayout bên trong vẫn dùng <Outlet /> như cũ nên không cần sửa file đó.
 */
export default function OptionalLayout() {
  const { account, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) {
    return (
      <Stack sx={{ pt: 12, alignItems: 'center' }}>
        <CircularProgress />
      </Stack>
    );
  }
  if (STOREFRONT_PATHS.includes(pathname)) return <Outlet />;
  if (account?.role === 'CUSTOMER' && inStorefront(pathname)) return <StorefrontLayout />;
  return account ? <ThorsLayout /> : <Outlet />;
}
