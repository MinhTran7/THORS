import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom';
import useSWR from 'swr';
import { Alert, Box, Skeleton, Typography } from '@mui/material';
import { Stack } from '../components/Flex';
import { EditOutlined } from '@ant-design/icons';
import { useCrumbs } from 'layouts/crumbs';
import { accountsApi } from '../api';
import { STORE_NAME } from '../constants';
import { formatDate } from '../format';
import { brand, cardSx } from '../tokens';
import { BrandSwitch, OutlineButton } from '../components/Brand';
import { RoleChip } from '../components/Chips';
import { PageHeader } from '../components/Blocks';
import { useToast } from '../components/Toast';
import UserAvatar from '../components/UserAvatar';

function Row({ label, children }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '180px 1fr' }, gap: { xs: 0.25, sm: 2 }, py: 1.5 }}>
      <Typography variant="body2" sx={{ color: brand.muted }}>
        {label}
      </Typography>
      <Typography component="div" variant="body2" sx={{ color: brand.ink, fontWeight: 600, wordBreak: 'break-word' }}>
        {children || '—'}
      </Typography>
    </Box>
  );
}

export default function StaffDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const { data, error, mutate } = useSWR(['account', id], () => accountsApi.detail(id), { revalidateOnFocus: false });
  useCrumbs(['Family', data?.fullName ?? '…']);
  const [toast, showToast] = useToast();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
      window.history.replaceState({}, '');
    }
  }, [location.state, showToast]);

  async function toggle() {
    const next = data.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    setBusy(true);
    try {
      await accountsApi.setStatus(id, next);
      await mutate();
      showToast(next === 'ACTIVE' ? 'Account activated.' : 'Account deactivated.');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const locked = data?.status === 'LOCKED';

  return (
    <Box>
      <PageHeader
        back={{ to: '/family', label: 'Family List' }}
        title="Family Member Detail"
        subtitle="Account information, assigned role and access status."
        action={
          <OutlineButton component={RouterLink} to={`/family/${id}/edit`} startIcon={<EditOutlined />} disabled={!data}>
            Edit account
          </OutlineButton>
        }
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error.message}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px minmax(0, 1fr)' }, gap: 3, alignItems: 'start' }}>
        <Stack spacing={3}>
          <Box sx={{ ...cardSx, p: 3 }}>
            <Stack alignItems="center" spacing={1}>
              {data ? (
                <UserAvatar name={data.fullName} src={data.avatarUrl} size={88} />
              ) : (
                <Skeleton variant="circular" width={88} height={88} />
              )}
              <Typography variant="h4" sx={{ color: brand.ink }}>
                {data?.fullName ?? <Skeleton width={140} />}
              </Typography>
              {data && <RoleChip role={data.role} />}
              <Typography variant="caption" sx={{ color: brand.muted }}>
                {data ? `Joined ${formatDate(data.createdAt)}` : ' '}
              </Typography>
              <Typography variant="caption" sx={{ color: brand.muted }}>
                {data ? `Account ID: #${data.id}` : ' '}
              </Typography>
            </Stack>
          </Box>

          <Box sx={{ ...cardSx, p: 3 }}>
            <Typography variant="h5" sx={{ color: brand.ink, mb: 1.5 }}>
              Account access
            </Typography>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2" sx={{ color: brand.ink }}>
                Activate / Deactivate
              </Typography>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <BrandSwitch
                  checked={data?.status === 'ACTIVE'}
                  disabled={!data || locked || busy}
                  onChange={toggle}
                  slotProps={{ input: { 'aria-label': 'Activate or deactivate this account' } }}
                />
                <Typography variant="caption" sx={{ color: brand.ink, fontWeight: 600 }}>
                  {!data
                    ? ''
                    : locked
                      ? 'Locked'
                      : data.status === 'ACTIVE'
                        ? 'Active'
                        : data.status === 'DISABLED'
                          ? 'Inactive'
                          : 'Pending'}
                </Typography>
              </Stack>
            </Stack>
            <Typography variant="caption" sx={{ color: brand.muted, display: 'block', mt: 1.5 }}>
              {locked
                ? 'This account was locked by an administrator. Only an admin can unlock it.'
                : "Deactivating blocks sign-in immediately. This account's activity history will be kept."}
            </Typography>
          </Box>
        </Stack>

        <Box sx={{ ...cardSx, p: 3 }}>
          <Typography variant="h5" sx={{ color: brand.ink, mb: 1 }}>
            Contact &amp; assigned role
          </Typography>
          <Row label="Email">{data?.email}</Row>
          <Row label="Phone">{data?.phone}</Row>
          <Row label="Assigned role">{data && <RoleChip role={data.role} />}</Row>
          <Row label="Store">{data && STORE_NAME}</Row>
        </Box>
      </Box>
      {toast}
    </Box>
  );
}