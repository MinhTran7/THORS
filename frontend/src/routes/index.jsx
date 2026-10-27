import { createBrowserRouter, Navigate } from 'react-router-dom';
import RequireAuth from 'features/auth/RequireAuth';
import ThorsLayout from 'layouts/ThorsLayout';
import LoginPage from 'features/auth/pages/LoginPage';
import RegisterPage from 'features/auth/pages/RegisterPage';
import ForgotPage from 'features/auth/pages/ForgotPage';
import VerifyPage from 'features/auth/pages/VerifyPage';
import ResetPage from 'features/auth/pages/ResetPage';
import GoogleCallback from 'features/auth/pages/GoogleCallback';
import ProfilePage from 'features/account/ProfilePage';
import AccountsPage from 'features/account/AccountsPage';
import WorkspacePage from 'features/account/WorkspacePage';
<<<<<<< Updated upstream
import { AuthShell } from 'features/auth/components/AuthForm';
import { Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';


// Category Management
import CategoryPage from 'features/category/CategoryPage';

// Category Management
import CartPage from 'features/cart/CartPage';

// Cart
import CartPage from 'features/cart/CartPage';

// Product Management
import ProductPage from '../features/product/ProductPage';
// add product
import AddProductPage from '../features/product/AddProductPage';
// product detail
import ProductDetailPage from 'features/product/ProductDetailPage';
//update product
import EditProductPage from 'features/product/EditProductPage';
>>>>>>> Stashed changes
export default createBrowserRouter([
  { path: '/', element: <Navigate to="/workspace" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPage /> },
  { path: '/auth/verify', element: <VerifyPage /> },
  { path: '/auth/reset-password', element: <ResetPage /> },
  { path: '/auth/google/callback', element: <GoogleCallback /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <ThorsLayout />,
        children: [
          { path: '/workspace', element: <WorkspacePage /> },
          { path: '/profile', element: <ProfilePage /> },
<<<<<<< Updated upstream
          { element: <RequireAuth roles={['ADMIN', 'OWNER']} />, children: [{ path: '/accounts', element: <AccountsPage /> }] }
=======
          { path: '/profile/edit', element: <UpdateProfilePage /> },
          { path: '/profile/password', element: <ChangePasswordPage /> },
          {
            element: <RequireAuth roles={['CUSTOMER']} />,
            children: [{ path: '/cart', element: <CartPage /> }]
          },
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
                    // Category & Product (của DongNV)
      { path: '/categories', element: <CategoryPage /> },
      { path: '/products', element: <ProductPage /> },
      { path: '/products/add', element: <AddProductPage /> },
      { path: '/products/:productId', element: <ProductDetailPage /> },
      { path: '/products/:productId/edit', element: <EditProductPage /> }
            ]
          }
>>>>>>> Stashed changes
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
