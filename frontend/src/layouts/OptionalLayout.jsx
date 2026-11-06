import { Outlet, useLocation } from 'react-router-dom';
import { CircularProgress, Stack } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import ThorsLayout from './ThorsLayout';

// Trang chủ cửa hàng tự có header + footer riêng nên luôn hiển thị tràn màn hình, không bọc sidebar.
const STOREFRONT_PATHS = ['/'];

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
  return account ? <ThorsLayout /> : <Outlet />;
}
