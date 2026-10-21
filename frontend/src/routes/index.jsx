
import { createBrowserRouter, Navigate, Link } from 'react-router-dom';
import { Button, Typography } from '@mui/material';

// Authentication
import RequireAuth from 'features/auth/RequireAuth';
import LoginPage from 'features/auth/pages/LoginPage';
import RegisterPage from 'features/auth/pages/RegisterPage';
import ForgotPage from 'features/auth/pages/ForgotPage';
import VerifyPage from 'features/auth/pages/VerifyPage';
import ResetPage from 'features/auth/pages/ResetPage';
import GoogleCallback from 'features/auth/pages/GoogleCallback';
import { AuthShell } from 'features/auth/components/AuthForm';

// Layout
import ThorsLayout from 'layouts/ThorsLayout';

// Account Management
import ProfilePage from 'features/account/ProfilePage';
import AccountsPage from 'features/account/AccountsPage';
import WorkspacePage from 'features/account/WorkspacePage';

// Category Management
import CategoryPage from 'features/category/CategoryPage';

// Product Management
import ProductPage from '../features/product/ProductPage';
// add product
import AddProductPage from '../features/product/AddProductPage';
// product detail
import ProductDetailPage from 'features/product/ProductDetailPage';
//update product
import EditProductPage from 'features/product/EditProductPage';
export default createBrowserRouter([
  // Default Route
  {
    path: '/',
    element: <Navigate to="/workspace" replace />
  },

  // Public Routes
  {
    path: '/login',
    element: <LoginPage />
  },
  {
    path: '/register',
    element: <RegisterPage />
  },
  {
    path: '/forgot-password',
    element: <ForgotPage />
  },
  {
    path: '/auth/verify',
    element: <VerifyPage />
  },
  {
    path: '/auth/reset-password',
    element: <ResetPage />
  },
  {
    path: '/auth/google/callback',
    element: <GoogleCallback />
  },

  // Protected Routes
  {
    element: <RequireAuth />,
    children: [
      {
        element: <ThorsLayout />,
        children: [
          // Workspace
          {
            path: '/workspace',
            element: <WorkspacePage />
          },

          // Profile
          {
            path: '/profile',
            element: <ProfilePage />
          },

          // Category Management - OWNER

    // Category & Product Management - OWNER

          // Category & Product Management - OWNER
          {
            element: <RequireAuth roles={['OWNER']} />,
            children: [
              {
                path: '/categories',
                element: <CategoryPage />
              },
              {
                path: '/products',
                element: <ProductPage />
              },
              {
                path: '/products/add',
                element: <AddProductPage />
              },
              {
                path: '/products/:productId',
                element: <ProductDetailPage />
              },
              {
                path: 'products/:productId/edit',
                element: <EditProductPage />
              }
            ]
          },



          // Account Management - ADMIN, OWNER
          {
            element: <RequireAuth roles={['ADMIN', 'OWNER']} />,
            children: [
              {
                path: '/accounts',
                element: <AccountsPage />
              }
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
