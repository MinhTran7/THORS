import { Outlet, matchPath, useLocation } from 'react-router-dom';
import { CircularProgress, Stack } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import ThorsLayout from './ThorsLayout';
import StorefrontLayout from './StorefrontLayout';

// Các trang mua sắm của khách dùng chung giao diện cửa hàng (header + footer kiểu thời trang)
const STOREFRONT_PATHS = ['/', '/shop/category/:categoryId', '/shop/best-sellers', '/shop/new-arrivals', '/shop/sale', '/shop/products/:productId', '/cart', '/checkout', '/order-success'];

/**
 * Khung giao diện dùng cho cả trang công khai và trang cần đăng nhập:
 *  - Trang mua sắm (STOREFRONT_PATHS): StorefrontLayout, kể cả khi đã đăng nhập.
 *  - Đã đăng nhập: có sidebar + header chung (ThorsLayout).
 *  - Chưa đăng nhập: chỉ hiện trang trần.
 * ThorsLayout và StorefrontLayout bên trong đều dùng <Outlet /> nên không cần sửa routes.
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
  if (STOREFRONT_PATHS.some((path) => matchPath(path, pathname))) return <StorefrontLayout />;
  return account ? <ThorsLayout /> : <Outlet />;
}
