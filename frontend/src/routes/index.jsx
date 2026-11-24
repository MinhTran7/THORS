import { createBrowserRouter, Navigate, Link } from 'react-router-dom';
import { Button } from '@mui/material';
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
import FamilyListPage from 'features/account/pages/FamilyListPage';
import FamilyFormPage from 'features/account/pages/FamilyFormPage';
import WebsiteSettingsPage from 'features/website/WebsiteSettingsPage';
import TryOnModelsPage from 'features/tryon/TryOnModelsPage';
import FamilyDetailPage from 'features/account/pages/FamilyDetailPage';
import AccountsPage from 'features/account/pages/AccountListPage';
import SystemLogPage from 'features/account/pages/SystemLogPage';
import WorkspacePage from 'features/account/WorkspacePage';
import ShopAuthShell from 'features/auth/components/ShopAuthShell';

// Notification Management
import NotificationPage from 'features/notification/NotificationPage';
import NotificationDetailPage from 'features/notification/NotificationDetailPage';

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

// Sales
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
// Số đo cơ thể (gợi ý size / thử đồ ảo)
import BodyProfilePage from 'features/fitting/BodyProfilePage';
import TryOnHistoryPage from 'features/tryon/TryOnHistoryPage';
import OutfitPage from 'features/outfit/OutfitPage';
// Phòng thử đồ 3D (người mẫu theo số đo + quần áo 3D)
import FittingRoomPage from 'features/fitting-room/FittingRoomPage';

// Shop management
import ShopPage from 'features/shop/ShopPage';
import ShopProductPage from 'features/shop/ShopProductPage';
import ShopCollectionPage from 'features/shop/ShopCollectionPage';

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
      { path: '/shop/category/:categoryId', element: <ShopCollectionPage /> },
      { path: '/shop/best-sellers', element: <ShopCollectionPage key="best" collection="best_selling" /> },
      { path: '/shop/new-arrivals', element: <ShopCollectionPage key="new" collection="newest" /> },
      { path: '/shop/sale', element: <ShopCollectionPage key="sale" collection="sale" /> },
      // Phối đồ theo dịp / ngân sách (module outfit)
      { path: '/outfit', element: <OutfitPage /> },
      { path: '/tracking/:orderNumber', element: <OrderTrackingPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/workspace', element: <WorkspaceEntry /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/profile/edit', element: <UpdateProfilePage /> },
          { path: '/profile/password', element: <ChangePasswordPage /> },
          { path: '/notifications', element: <NotificationPage /> },
          { path: '/notifications/:id', element: <NotificationDetailPage /> },
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
              { path: '/orders/:id', element: <OrderDetailPage /> }
            ]
          },
          {
            element: <RequireAuth roles={['CUSTOMER', 'OWNER']} />,
            children: [{ path: '/promotions', element: <PromotionPage /> }]
          },
          {
            // Quản lý địa chỉ giao hàng của Customer
            element: <RequireAuth roles={['CUSTOMER']} />,
            children: [
              { path: '/addresses', element: <CustomerAddressPage /> },
              { path: '/addresses/new', element: <AddAddressPage /> },
              { path: '/addresses/:id/edit', element: <EditAddressPage /> },
              { path: '/body-profile', element: <BodyProfilePage /> },
              // Ảnh mặc thử bằng AI đã tạo (module tryon)
              { path: '/try-on-history', element: <TryOnHistoryPage /> },
              // Phòng thử đồ 3D (dùng số đo đã lưu của khách)
              { path: '/fitting-room', element: <FittingRoomPage /> }
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
              { path: '/family', element: <FamilyListPage /> },
              { path: '/family/new', element: <FamilyFormPage /> },
              { path: '/family/:id', element: <FamilyDetailPage /> },
              { path: '/family/:id/edit', element: <FamilyFormPage /> },
              // Category, Product & Returns (của DongNV)
              { path: '/categories', element: <CategoryPage /> },
              { path: '/products', element: <ProductPage /> },
              { path: '/products/add', element: <AddProductPage /> },
              { path: '/products/:productId', element: <ProductDetailPage /> },
              { path: '/products/:productId/edit', element: <EditProductPage /> },
              { path: '/returns', element: <ReturnsPage /> },
              // Kênh bán hàng > Website: thông tin chung của website (footer, thanh thông báo)
              { path: '/website', element: <WebsiteSettingsPage /> },
              // Người mẫu dựng sẵn cho "Mặc thử bằng AI" (module tryon)
              { path: '/tryon-models', element: <TryOnModelsPage /> },
              // Promotion (của phuoc)
              { path: '/promotions/add', element: <AddPromotionPage /> },
              { path: '/promotions/:promotionId', element: <PromotionDetailPage /> },
              { path: '/promotions/:promotionId/edit', element: <EditPromotionPage /> },
              { path: '/order-discounts', element: <PromotionPage kind="ORDER" /> },
              { path: '/order-discounts/add', element: <AddPromotionPage kind="ORDER" /> },
              { path: '/order-discounts/:promotionId', element: <PromotionDetailPage kind="ORDER" /> },
              { path: '/order-discounts/:promotionId/edit', element: <EditPromotionPage kind="ORDER" /> }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    element: (
      <ShopAuthShell variant="card" title="Không tìm thấy trang" subtitle="Đường dẫn không tồn tại.">
        <Button component={Link} to="/" variant="contained" size="large">
          Về trang chính
        </Button>
      </ShopAuthShell>
    )
  }
]);