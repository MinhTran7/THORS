import { createBrowserRouter, Navigate, Link } from 'react-router-dom';
import { Button, Typography } from '@mui/material';
import WarehousePage, { warehouseRoutes } from 'features/warehouse/WarehousePage';

// Authentication
import RequireAuth from 'features/auth/RequireAuth';
import ThorsLayout from 'layouts/ThorsLayout';
import LoginPage from 'features/auth/pages/LoginPage';
import RegisterPage from 'features/auth/pages/RegisterPage';
import ForgotPage from 'features/auth/pages/ForgotPage';
import VerifyPage from 'features/auth/pages/VerifyPage';
import ResetPage from 'features/auth/pages/ResetPage';
import FacebookComplete from 'features/auth/pages/FacebookComplete';
import GoogleCallback from 'features/auth/pages/GoogleCallback';
import ProfilePage from 'features/account/pages/ProfilePage';
import AccountsPage from 'features/account/pages/AccountListPage';
import WorkspacePage from 'features/account/WorkspacePage';
import { AuthShell } from 'features/auth/components/AuthForm';

// Category Management
import CategoryPage from 'features/category/CategoryPage';

// Product Management
import ProductPage from '../features/product/ProductPage';
import AddProductPage from '../features/product/AddProductPage';
import ProductDetailPage from 'features/product/ProductDetailPage';
import EditProductPage from 'features/product/EditProductPage';

// Returns Management (Đổi trả / Hoàn hàng)
import ReturnsPage from 'features/returns/ReturnsPage';
export default createBrowserRouter([
  { path: '/', element: <Navigate to="/workspace" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPage /> },
  { path: '/auth/verify', element: <VerifyPage /> },
  { path: '/auth/reset-password', element: <ResetPage /> },
  { path: '/auth/facebook/complete', element: <FacebookComplete /> },
  { path: '/auth/facebook/callback', element: <GoogleCallback provider="facebook" /> },
  { path: '/auth/google/callback', element: <GoogleCallback /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <ThorsLayout />,
        children: [
          { path: '/workspace', element: <WorkspacePage /> },
          { path: '/profile', element: <ProfilePage /> },
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
{ element: <RequireAuth roles={['ADMIN', 'OWNER']} />, children: [{ path: '/accounts', element: <AccountsPage /> }] },
{
  element: <RequireAuth roles={['OWNER']} />,
  children: [
    // Category, Product & Returns (của DongNV)
    { path: '/categories', element: <CategoryPage /> },
    { path: '/products', element: <ProductPage /> },
    { path: '/products/add', element: <AddProductPage /> },
    { path: '/products/:productId', element: <ProductDetailPage /> },
    { path: '/products/:productId/edit', element: <EditProductPage /> },
    { path: '/returns', element: <ReturnsPage /> }
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
