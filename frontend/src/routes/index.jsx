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
import { AuthShell } from 'features/auth/components/AuthForm';
import { Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
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
          { element: <RequireAuth roles={['ADMIN', 'OWNER']} />, children: [{ path: '/accounts', element: <AccountsPage /> }] }
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
