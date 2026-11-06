import { createBrowserRouter, Navigate, Link } from 'react-router-dom';
import { Button, Typography } from '@mui/material';
import WarehousePage, { warehouseRoutes } from 'features/warehouse/WarehousePage';

// Authentication
import RequireAuth from 'features/auth/RequireAuth';
import { useAuth } from 'features/auth/AuthProvider';
import OptionalLayout from 'layouts/OptionalLayout';
import LoginPage from 'features/auth/pages/LoginPage';
import RegisterPage from 'features/auth/pages/RegisterPage';
import ForgotPage from 'features/auth/pages/ForgotPage';
import VerifyPage from 'features/auth/pages/VerifyPage';
import ResetPage from 'features/auth/pages/ResetPage';
import FacebookComplete from 'features/auth/pages/FacebookComplete';
import GoogleCallback from 'features/auth/pages/GoogleCallback';
import ProfilePage from 'features/account/pages/ProfilePage';
import UpdateProfilePage from 'features/account/pages/UpdateProfilePage';
import ChangePasswordPage from 'features/account/pages/ChangePasswordPage';
import StaffListPage from 'features/account/pages/StaffListPage';
import StaffFormPage from 'features/account/pages/StaffFormPage';
import StaffDetailPage from 'features/account/pages/StaffDetailPage';
import AccountsPage from 'features/account/pages/AccountListPage';
import SystemLogPage from 'features/account/pages/SystemLogPage';
import WorkspacePage from 'features/account/WorkspacePage';
import { AuthShell } from 'features/auth/components/AuthForm';

// Notification Management
import NotificationPage from 'features/notification/NotificationPage';

// Online Order Management
import OrderListPage from 'features/order/OrderListPage';
import OrderDetailPage from 'features/order/OrderDetailPage';
import OrderTrackingPage from 'features/order/OrderTrackingPage';

// Category Management
import CategoryPage from 'features/category/CategoryPage';

// Product Management
import ProductPage from '../features/product/ProductPage';
import AddProductPage from '../features/product/AddProductPage';
import ProductDetailPage from 'features/product/ProductDetailPage';
import EditProductPage from 'features/product/EditProductPage';
//sales
import InStoreSalesPage from 'features/sales/InStoreSalesPage';
import InStoreSalesHistoryPage from 'features/sales/InStoreSalesHistoryPage';
import InStoreSaleDetailPage from 'features/sales/InStoreSaleDetailPage';
import PromotionPage from 'features/promotion/PromotionPage';
import AddPromotionPage from 'features/promotion/AddPromotionPage';
import PromotionDetailPage from 'features/promotion/PromotionDetailPage';
import EditPromotionPage from 'features/promotion/EditPromotionPage';
// Returns Management (Đổi trả / Hoàn hàng)
import ReturnsPage from 'features/returns/ReturnsPage';
import FacebookPOSPage from 'features/facebook/FacebookPOSPage';
// Customer Addresses
import CustomerAddressPage from 'features/customer/CustomerAddressPage';
import AddAddressPage from 'features/customer/AddAddressPage';
import EditAddressPage from 'features/customer/EditAddressPage';

// Shop management
import ShopPage from 'features/shop/ShopPage';
import ShopProductPage from 'features/shop/ShopProductPage';

// Cart (Giỏ hàng)
import CartPage from 'features/cart/CartPage';
import CheckoutPage from 'features/cart/CheckoutPage';
import OrderSuccessPage from 'features/cart/OrderSuccessPage';

// Sau khi đăng nhập mọi người đều vào /workspace: khách hàng được chuyển thẳng sang trang shop,
// các vai trò khác (chủ cửa hàng, nhân viên, admin) vẫn thấy trang Dashboard như cũ.
function WorkspaceEntry() {
  const { account } = useAuth();
  return account?.role === 'CUSTOMER' ? <Navigate to="/" replace /> : <WorkspacePage />;
}

export default createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPage /> },
  { path: '/auth/verify', element: <VerifyPage /> },
  { path: '/auth/reset-password', element: <ResetPage /> },
  { path: '/auth/facebook/complete', element: <FacebookComplete /> },
  { path: '/auth/facebook/callback', element: <GoogleCallback provider="facebook" /> },
  { path: '/auth/google/callback', element: <GoogleCallback /> },

  {
    // Khung chung: đã đăng nhập thì có sidebar + header (ThorsLayout), chưa đăng nhập thì trang trần.
    // Trang shop mở được cho cả khách chưa đăng nhập; các trang còn lại bắt buộc đăng nhập (RequireAuth).
    element: <OptionalLayout />,
    children: [
      { path: '/', element: <ShopPage /> },
      { path: '/shop/products/:productId', element: <ShopProductPage /> },
      { path: '/tracking/:orderNumber', element: <OrderTrackingPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/workspace', element: <WorkspaceEntry /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/profile/edit', element: <UpdateProfilePage /> },
          { path: '/profile/password', element: <ChangePasswordPage /> },
          { path: '/notifications', element: <NotificationPage /> },
          {
            // Giỏ hàng và đặt hàng chỉ dành cho khách hàng
            element: <RequireAuth roles={['CUSTOMER']} />,
            children: [
              { path: '/cart', element: <CartPage /> },
              { path: '/checkout', element: <CheckoutPage /> },
              { path: '/order-success', element: <OrderSuccessPage /> }
            ]
          },
          {
            // Customer xem đơn của mình; Owner và Family Member xem đơn online của cửa hàng
            element: <RequireAuth roles={['CUSTOMER', 'OWNER', 'FAMILY_MEMBER']} />,
            children: [
              { path: '/orders', element: <OrderListPage /> },
              { path: '/orders/:id', element: <OrderDetailPage /> },
              { path: '/promotions', element: <PromotionPage /> }
            ]
          },
          {
            // Quản lý địa chỉ giao hàng của Customer
            element: <RequireAuth roles={['CUSTOMER']} />,
            children: [
              { path: '/addresses', element: <CustomerAddressPage /> },
              { path: '/addresses/new', element: <AddAddressPage /> },
              { path: '/addresses/:id/edit', element: <EditAddressPage /> }
            ]
          },
          {
            element: <RequireAuth roles={['OWNER', 'FAMILY_MEMBER']} />,
            children: [
              {
                path: '/warehouse',
                element: <WarehousePage />,
                children: [{ index: true, element: <Navigate to="locations" replace /> }, ...warehouseRoutes]
              }
            ]
          },
          {
            element: <RequireAuth roles={['ADMIN', 'OWNER']} />,
            children: [{ path: '/accounts', element: <AccountsPage /> }]
          },
          {
            element: <RequireAuth roles={['ADMIN']} />,
            children: [{ path: '/system-log', element: <SystemLogPage /> }]
          },
         {
            element: <RequireAuth roles={['OWNER', 'FAMILY_MEMBER']} />,
            children: [
              { path: '/in-store-sales', element: <InStoreSalesPage /> },
              { path: '/in-store-sales/history', element: <InStoreSalesHistoryPage /> },
              { path: '/in-store-sales/history/:orderId', element: <InStoreSaleDetailPage /> },
              { path: '/facebook', element: <FacebookPOSPage /> }
            ]
          },
          {
            element: <RequireAuth roles={['OWNER']} />,
            children: [
              { path: '/family', element: <StaffListPage /> },
              { path: '/family/new', element: <StaffFormPage /> },
              { path: '/family/:id', element: <StaffDetailPage /> },
              { path: '/family/:id/edit', element: <StaffFormPage /> },
              // Category, Product & Returns (của DongNV)
              { path: '/categories', element: <CategoryPage /> },
              { path: '/products', element: <ProductPage /> },
              { path: '/products/add', element: <AddProductPage /> },
              { path: '/products/:productId', element: <ProductDetailPage /> },
              { path: '/products/:productId/edit', element: <EditProductPage /> },
              { path: '/returns', element: <ReturnsPage /> },
              // Promotion (của phuoc)
              { path: '/promotions/add', element: <AddPromotionPage /> },
              { path: '/promotions/:promotionId', element: <PromotionDetailPage /> },
              { path: '/promotions/:promotionId/edit', element: <EditPromotionPage /> }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    element: (
      <AuthShell title="Không tìm thấy trang">
        <Typography>Đường dẫn không tồn tại.</Typography>
        <Button component={Link} to="/">
          Về trang chính
        </Button>
      </AuthShell>
    )
  }
]);
