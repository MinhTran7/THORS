import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircularProgress, Stack, Typography } from '@mui/material';
import { api, clearCsrf } from 'services/http';
import { useAuth } from '../AuthProvider';
import { safeReturn } from '../validation';
export default function GoogleCallback() {
  const { setAccount } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    clearCsrf();
    api('/auth/me')
      .then((a) => {
        setAccount(a);
        const target = safeReturn(sessionStorage.getItem('thorsReturnTo'));
        sessionStorage.removeItem('thorsReturnTo');
        navigate(target, { replace: true });
      })
      .catch(() => navigate('/login?error=google_failed', { replace: true }));
  }, [navigate, setAccount]);
  return (
    <Stack spacing={2} sx={{ pt: 12, alignItems: 'center' }}>
      <CircularProgress />
      <Typography>Đang đăng nhập…</Typography>
    </Stack>
  );
}
