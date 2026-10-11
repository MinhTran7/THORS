import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Alert, CircularProgress, Stack } from '@mui/material';
import { useAuth } from './AuthProvider';
export default function RequireAuth({ roles }) {
  const { account, loading, failure } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <Stack sx={{ pt: 12, alignItems: 'center' }}>
        <CircularProgress />
      </Stack>
    );
  if (failure) return <Alert severity="error">{failure}</Alert>;
  if (!account) return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && !roles.includes(account.role)) return <Navigate to="/workspace" replace />;
  return <Outlet />;
}
