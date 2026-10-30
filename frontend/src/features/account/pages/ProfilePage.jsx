import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import useSWR from 'swr';
import { Alert, Box, Divider, Skeleton, Typography } from '@mui/material';
import { Stack } from '../components/Flex';
import { EditOutlined, KeyOutlined } from '@ant-design/icons';
import { useAuth } from 'features/auth/AuthProvider';
import { useCapabilities } from 'features/auth/components/ChannelPicker';
import { useCrumbs } from 'layouts/crumbs';
import { post } from 'services/http';
import { accountsApi } from '../api';
import { PROFILE_TAGLINE, STORE_NAME } from '../constants';
import { formatMonthYear } from '../format';
import { brand, cardSx } from '../tokens';
import { BrandButton, OutlineButton } from '../components/Brand';
import { RoleChip } from '../components/Chips';
import { PageHeader } from '../components/Blocks';
import UserAvatar from '../components/UserAvatar';

function InfoRow({ label, value }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '200px 1fr' }, gap: { xs: 0.25, sm: 2 }, py: 1.25 }}>
      <Typography variant="body2" sx={{ color: brand.muted }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: brand.ink, fontWeight: 600, wordBreak: 'break-word' }}>
        {value || '—'}
      </Typography>
    </Box>
  );
}

export default function ProfilePage() {
  useCrumbs(['Profile']);
  const { account } = useAuth();
  const capabilities = useCapabilities();
  const [error, setError] = useState('');
  const { data, error: loadError, isLoading } = useSWR('account-profile', accountsApi.profile, { revalidateOnFocus: false });

  async function linkGoogle() {
    setError('');
    try {
      const result = await post('/auth/google/link');
      sessionStorage.setItem('thorsReturnTo', '/profile');
      window.location.assign(result.url);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <Box>
      <PageHeader title="User Profile" subtitle="Your personal information and account settings." />
      {(loadError || error) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError?.message || error}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px minmax(0, 1fr)' }, gap: 3, alignItems: 'start' }}>
        <Box sx={{ ...cardSx, overflow: 'hidden' }}>
          <Box sx={{ bgcolor: brand.yellowSoft, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
            <Typography sx={{ fontSize: 11, letterSpacing: 0.8, fontWeight: 600, color: brand.ink, textAlign: 'center' }}>
              {PROFILE_TAGLINE}
            </Typography>
          </Box>
          <Stack alignItems="center" spacing={1} sx={{ px: 3, pb: 3, mt: '-44px' }}>
            {isLoading || !data ? (
              <Skeleton variant="circular" width={88} height={88} />
            ) : (
              <UserAvatar name={data.fullName} src={data.avatarUrl} size={88} sx={{ border: '4px solid #fff' }} />
            )}
            <Typography variant="h4" sx={{ color: brand.ink }}>
              {data?.fullName ?? account.fullName}
            </Typography>
            <RoleChip role={data?.role ?? account.role} />
            <Typography variant="caption" sx={{ color: brand.muted }}>
              {data ? `Member since ${formatMonthYear(data.createdAt)}` : ' '}
            </Typography>
            {account.role !== 'ADMIN' && account.role !== 'CUSTOMER' && (
              <>
                <Divider flexItem sx={{ my: 1 }} />
                <Typography variant="subtitle2" sx={{ color: brand.ink }}>
                  {STORE_NAME}
                </Typography>
              </>
            )}
          </Stack>
        </Box>

        <Stack spacing={3}>
          <Box sx={{ ...cardSx, p: 3 }}>
            <Typography variant="h5" sx={{ color: brand.ink }}>
              Personal information
            </Typography>
            <Typography variant="caption" sx={{ color: brand.muted }}>
              These details are used for account communication.
            </Typography>
            <Box sx={{ mt: 2 }}>
              <InfoRow label="Full name" value={data?.fullName} />
              <InfoRow label="Email address" value={data?.email} />
              <InfoRow label="Phone number" value={data?.phone} />
              <InfoRow label="Account role" value={data ? <RoleChip role={data.role} /> : null} />
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
              <BrandButton component={RouterLink} to="/profile/edit" startIcon={<EditOutlined />}>
                Update Profile
              </BrandButton>
              {account.passwordEnabled && (
                <BrandButton component={RouterLink} to="/profile/password" startIcon={<KeyOutlined />}>
                  Change Password
                </BrandButton>
              )}
            </Stack>
            {!account.passwordEnabled && (
              <Typography variant="caption" sx={{ color: brand.muted, display: 'block', mt: 1.5 }}>
                This account signs in with Google, so it has no THORS password to change.
              </Typography>
            )}
          </Box>

          {capabilities?.google && !account.googleLinked && (
            <Box sx={{ ...cardSx, p: 3 }}>
              <Typography variant="h5" sx={{ color: brand.ink }}>
                Google sign-in
              </Typography>
              <Typography variant="body2" sx={{ color: brand.muted, my: 1 }}>
                Link the Google account that uses the same email to sign in faster.
              </Typography>
              <OutlineButton onClick={linkGoogle}>Link Google account</OutlineButton>
            </Box>
          )}
        </Stack>
      </Box>
    </Box>
  );
}