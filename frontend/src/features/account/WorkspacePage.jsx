import { Link } from 'react-router-dom';
import { Button, Stack, Typography } from '@mui/material';
import MainCard from 'components/MainCard';
import { useAuth } from 'features/auth/AuthProvider';
export default function WorkspacePage() {
  const { account } = useAuth();
  return (
    <Stack spacing={3}>
      <Typography variant="h3">Trang chính</Typography>
      <MainCard title={`Xin chào, ${account.fullName}`}>
        <Stack spacing={2}>
          <Typography>Bạn đã đăng nhập thành công vào THORS.</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Button component={Link} to="/profile" variant="contained">
              Xem hồ sơ
            </Button>
            {account.role === 'ADMIN' && (
              <Button component={Link} to="/accounts" variant="outlined">
                Quản lý tài khoản
              </Button>
            )}
            {account.role === 'OWNER' && (
              <Button component={Link} to="/staff" variant="outlined">
                Quản lý nhân viên
              </Button>
            )}
          </Stack>
        </Stack>
      </MainCard>
    </Stack>
  );
}