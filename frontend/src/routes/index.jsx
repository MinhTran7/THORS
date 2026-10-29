import { createBrowserRouter, Navigate, Link } from 'react-router-dom';
import { Button, Typography } from '@mui/material';

// Authentication
import RequireAuth from 'features/auth/RequireAuth';
import LoginPage from 'features/auth/pages/LoginPage';
import RegisterPage from 'features/auth/pages/RegisterPage';
import ForgotPage from 'features/auth/pages/ForgotPage';
import VerifyPage from 'features/auth/pages/VerifyPage';
import ResetPage from 'features/auth/pages/ResetPage';
import FacebookComplete from 'features/auth/pages/FacebookComplete';
import GoogleCallback from 'features/auth/pages/GoogleCallback';
import { AuthShell } from 'features/auth/components/AuthForm';
import ThorsLayout from 'layouts/ThorsLayout';
import ProfilePage from 'features/account/pages/ProfilePage';
import UpdateProfilePage from 'features/account/pages/UpdateProfilePage';
import ChangePasswordPage from 'features/account/pages/ChangePasswordPage';
import StaffListPage from 'features/account/pages/StaffListPage';
import StaffDetailPage from 'features/account/pages/StaffDetailPage';
import StaffFormPage from 'features/account/pages/StaffFormPage';
import AccountListPage from 'features/account/pages/AccountListPage';
import SystemLogPage from 'features/account/pages/SystemLogPage';
import WorkspacePage from 'features/account/WorkspacePage';

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
          { path: '/profile/edit', element: <UpdateProfilePage /> },
          { path: '/profile/password', element: <ChangePasswordPage /> },
          {
            element: <RequireAuth roles={['ADMIN']} />,
            children: [
              { path: '/accounts', element: <AccountListPage /> },
              { path: '/system-log', element: <SystemLogPage /> }
            ]
          },
          {
            element: <RequireAuth roles={['OWNER']} />,
            children: [
              { path: '/staff', element: <StaffListPage /> },
              { path: '/staff/new', element: <StaffFormPage /> },
              { path: '/staff/:id', element: <StaffDetailPage /> },
              { path: '/staff/:id/edit', element: <StaffFormPage /> },

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

  // 404 - Not Found
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
