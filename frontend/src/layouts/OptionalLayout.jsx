import { Outlet } from 'react-router-dom';
import { CircularProgress, Stack } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import ThorsLayout from './ThorsLayout';

/**
 * Khung giao diện dùng cho cả trang công khai và trang cần đăng nhập:
 *  - Đã đăng nhập: có sidebar + header chung (ThorsLayout).
 *  - Chưa đăng nhập: chỉ hiện trang trần (trang shop tự có header riêng).
 * ThorsLayout bên trong vẫn dùng <Outlet /> như cũ nên không cần sửa file đó.
 */
export default function OptionalLayout() {
  const { account, loading } = useAuth();
  if (loading) {
    return (
      <Stack sx={{ pt: 12, alignItems: 'center' }}>
        <CircularProgress />
      </Stack>
    );
  }
  return account ? <ThorsLayout /> : <Outlet />;
}
