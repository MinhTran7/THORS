import { Outlet, matchPath, useLocation } from 'react-router-dom';
import { CircularProgress, Stack } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import ThorsLayout from './ThorsLayout';
import StorefrontLayout from './StorefrontLayout';
import CustomerChatWidget from 'features/chat/CustomerChatWidget';

// Các trang mua sắm của khách dùng chung giao diện cửa hàng (header + footer kiểu thời trang)
const STOREFRONT_PATHS = [
  '/',
  '/shop/category/:categoryId',
  '/shop/best-sellers',
  '/shop/new-arrivals',
  '/shop/sale',
  '/outfit',
  '/shop/products/:productId',
  '/cart',
  '/checkout',
  '/order-success'
];

// Các trang tài khoản chỉ dùng giao diện cửa hàng khi người xem là KHÁCH HÀNG;
// Owner / Family Member / Admin mở cùng đường dẫn vẫn thấy giao diện quản trị (sidebar).
const CUSTOMER_STOREFRONT_PATHS = [
  '/orders',
  '/orders/:id',
  '/orders/:id/return',
  '/profile',
  '/profile/edit',
  '/profile/password',
  '/notifications',
  '/notifications/:id',
  '/addresses',
  '/addresses/new',
  '/addresses/:id/edit',
  '/body-profile',
  '/try-on-history',
  '/promotions'
];

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
  const layout = STOREFRONT_PATHS.some((path) => matchPath(path, pathname)) ? (
    <StorefrontLayout />
  ) : account?.role === 'CUSTOMER' && CUSTOMER_STOREFRONT_PATHS.some((path) => matchPath(path, pathname)) ? (
    <StorefrontLayout />
  ) : account ? (
    <ThorsLayout />
  ) : (
    <Outlet />
  );
  // Khách hàng đã đăng nhập: nút chat "Liên hệ người bán" nổi ở góc phải dưới trên mọi trang
  return (
    <>
      {layout}
      {account?.role === 'CUSTOMER' && <CustomerChatWidget />}
    </>
  );
}
