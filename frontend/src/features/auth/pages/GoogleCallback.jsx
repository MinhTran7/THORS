import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircularProgress, Stack, Typography } from '@mui/material';
import { api, clearCsrf } from 'services/http';
import { useAuth } from '../AuthProvider';
import { landingAfterLogin, safeReturn } from '../validation';
export default function GoogleCallback({ provider = 'google' }) {
  const { setAccount } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    clearCsrf();
    api('/auth/me')
      .then((a) => {
        setAccount(a);
        const saved = sessionStorage.getItem('thorsReturnTo');
        // Đang liên kết Google từ trang Hồ sơ (đã đăng nhập sẵn) thì quay lại Hồ sơ cho mọi vai trò
        const linking = sessionStorage.getItem('thorsLinking') === '1';
        sessionStorage.removeItem('thorsReturnTo');
        sessionStorage.removeItem('thorsLinking');
        navigate(linking ? safeReturn(saved) : landingAfterLogin(a, saved), { replace: true });
      })
      .catch(() => navigate('/login?error=' + provider + '_failed', { replace: true }));
  }, [navigate, setAccount, provider]);
  return (
    <Stack spacing={2} sx={{ pt: 12, alignItems: 'center' }}>
      <CircularProgress />
      <Typography>Đang đăng nhập…</Typography>
    </Stack>
  );
}
