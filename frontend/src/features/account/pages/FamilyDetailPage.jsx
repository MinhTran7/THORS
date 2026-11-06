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

export default function FamilyDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const { data, error, mutate } = useSWR(['account', id], () => accountsApi.detail(id), { revalidateOnFocus: false });
  useCrumbs(['Gia đình', data?.fullName ?? '…']);
  const [toast, showToast] = useToast();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
      window.history.replaceState({}, '');
    }
  }, [location.state, showToast]);

  const locked = data?.status === 'LOCKED';
  const pending = data?.status === 'PENDING_VERIFICATION';

  async function toggle() {
    // Chỉ cho bật/tắt khi tài khoản đang ACTIVE hoặc DISABLED.
    if (data.status !== 'ACTIVE' && data.status !== 'DISABLED') return;
    const next = data.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    setBusy(true);
    try {
      await accountsApi.setStatus(id, next);
      await mutate();
      showToast(next === 'ACTIVE' ? 'Đã kích hoạt tài khoản.' : 'Đã vô hiệu hóa tài khoản.');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box>
      <PageHeader
        back={{ to: '/family', label: 'Danh sách gia đình' }}
        title="Chi tiết thành viên gia đình"
        subtitle="Thông tin tài khoản, vai trò được gán và trạng thái truy cập."
        action={
          <OutlineButton component={RouterLink} to={`/family/${id}/edit`} startIcon={<EditOutlined />} disabled={!data}>
            Chỉnh sửa tài khoản
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
                {data ? `Tham gia ${formatDate(data.createdAt)}` : ' '}
              </Typography>
              <Typography variant="caption" sx={{ color: brand.muted }}>
                {data ? `Mã tài khoản: #${data.id}` : ' '}
              </Typography>
            </Stack>
          </Box>

          <Box sx={{ ...cardSx, p: 3 }}>
            <Typography variant="h5" sx={{ color: brand.ink, mb: 1.5 }}>
              Quyền truy cập tài khoản
            </Typography>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2" sx={{ color: brand.ink }}>
                Kích hoạt / Vô hiệu hóa
              </Typography>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                {/* Tài khoản chờ xác minh chưa thể khóa/mở khóa: ẩn công tắc nhưng vẫn giữ chỗ để khung không bị nhảy. */}
                <Box component="span" sx={{ display: 'inline-flex', visibility: pending ? 'hidden' : 'visible' }} aria-hidden={pending || undefined}>
                  <BrandSwitch
                    checked={data?.status === 'ACTIVE'}
                    disabled={!data || locked || pending || busy}
                    onChange={toggle}
                    slotProps={{ input: { 'aria-label': 'Kích hoạt hoặc vô hiệu hóa tài khoản này' } }}
                  />
                </Box>
                <Typography
                  variant="caption"
                  sx={{ color: brand.ink, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-block', minWidth: 96 }}
                >
                  {!data
                    ? ''
                    : locked
                      ? 'Đã khóa'
                      : data.status === 'ACTIVE'
                        ? 'Đã kích hoạt'
                        : data.status === 'DISABLED'
                          ? 'Đã vô hiệu hóa'
                          : 'Chờ xác minh'}
                </Typography>
              </Stack>
            </Stack>
            <Typography variant="caption" sx={{ color: brand.muted, display: 'block', mt: 1.5, minHeight: '5em' }}>
              {locked
                ? 'Tài khoản này đã bị quản trị viên khóa. Chỉ quản trị viên mới có thể mở khóa.'
                : pending
                  ? 'Tài khoản đang chờ xác minh email. Sau khi xác minh, bạn mới có thể kích hoạt hoặc vô hiệu hóa.'
                  : 'Vô hiệu hóa sẽ chặn đăng nhập ngay lập tức. Lịch sử hoạt động của tài khoản này vẫn được giữ lại.'}
            </Typography>
          </Box>
        </Stack>

        <Box sx={{ ...cardSx, p: 3 }}>
          <Typography variant="h5" sx={{ color: brand.ink, mb: 1 }}>
            Liên hệ &amp; vai trò được gán
          </Typography>
          <Row label="Email">{data?.email}</Row>
          <Row label="Số điện thoại">{data?.phone}</Row>
          <Row label="Vai trò được gán">{data && <RoleChip role={data.role} />}</Row>
          <Row label="Cửa hàng">{data && STORE_NAME}</Row>
        </Box>
      </Box>
      {toast}
    </Box>
  );
}