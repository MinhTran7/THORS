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
import { brand, cardSx, fs } from '../tokens';
import { BrandButton, OutlineButton } from '../components/Brand';
import { RoleChip } from '../components/Chips';
import { PageHeader } from '../components/Blocks';
import UserAvatar from '../components/UserAvatar';

// Tên hiển thị của các action trong audit_log. Action lạ rơi về nhãn chung.
const ACTIVITY_LABEL = {
  LOGIN: 'Đăng nhập',
  LOGIN_FAILURE: 'Đăng nhập thất bại',
  LOGIN_FAILED: 'Đăng nhập thất bại',
  LOGIN_LOCK: 'Tạm khóa đăng nhập do nhập sai nhiều lần',
  PROFILE_UPDATE: 'Cập nhật hồ sơ',
  PHONE_ADDED: 'Thêm số điện thoại',
  PASSWORD_CHANGE: 'Đổi mật khẩu',
  PASSWORD_RESET_ADMIN: 'Mật khẩu được đặt lại',
  PASSWORD_RESET_REQUEST: 'Gửi yêu cầu đặt lại mật khẩu',
  ACCOUNT_LOCK: 'Tài khoản bị khóa',
  ACCOUNT_UNLOCK: 'Tài khoản được mở khóa',
  ACCOUNT_ACTIVATE: 'Tài khoản được kích hoạt',
  ACCOUNT_DEACTIVATE: 'Tài khoản bị vô hiệu hóa',
  ACCOUNT_EDIT: 'Thông tin tài khoản được chỉnh sửa'
};

const DOT_COLOR = { SUCCESS: brand.successInk, WARNING: brand.warningInk, FAILED: brand.dangerInk };

// audit_log lưu giờ UTC và API trả về không kèm múi giờ, nên thêm 'Z' trước khi đổi sang giờ máy người dùng.
function toDate(value) {
  if (!value) return null;
  const text = String(value);
  const date = new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMemberSince(value) {
  const date = toDate(value);
  return date ? `tháng ${date.getMonth() + 1}/${date.getFullYear()}` : '';
}

function InfoItem({ label, value }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ color: brand.muted, fontSize: fs.caption }}>{label}</Typography>
      <Typography component="div" sx={{ color: brand.ink, fontWeight: 600, fontSize: fs.strong, mt: 0.5, wordBreak: 'break-word' }}>
        {value || '—'}
      </Typography>
    </Box>
  );
}

function SecurityRow({ label, value }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2} sx={{ py: 1 }}>
      <Typography sx={{ color: brand.muted, fontSize: fs.body }}>{label}</Typography>
      <Typography component="div" sx={{ color: brand.ink, fontWeight: 600, fontSize: fs.body, textAlign: 'right', wordBreak: 'break-word' }}>
        {value || '—'}
      </Typography>
    </Stack>
  );
}

function ActivityRow({ item }) {
  const title = ACTIVITY_LABEL[item.action] ?? 'Hoạt động tài khoản';
  const meta = [formatDateTime(item.performedAt), item.ip && `IP ${item.ip}`, item.byManager && 'do người quản lý thực hiện']
    .filter(Boolean)
    .join(' · ');
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ py: 0.75 }}>
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', mt: '7px', flexShrink: 0, bgcolor: DOT_COLOR[item.status] ?? brand.neutralInk }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ color: brand.ink, fontWeight: 600, fontSize: fs.body }}>{title}</Typography>
        <Typography sx={{ color: brand.muted, fontSize: fs.caption }}>{meta}</Typography>
      </Box>
    </Stack>
  );
}

export default function ProfilePage() {
  useCrumbs(['Hồ sơ']);
  const { account } = useAuth();
  const capabilities = useCapabilities();
  const [error, setError] = useState('');
  const { data, error: loadError, isLoading } = useSWR('account-profile', accountsApi.profile, { revalidateOnFocus: false });
  const {
    data: activity,
    error: activityError,
    isLoading: activityLoading
  } = useSWR('account-activity', () => accountsApi.activity(5), { revalidateOnFocus: false });

  const passwordEnabled = data?.passwordEnabled ?? account.passwordEnabled;
  const googleLinked = data?.googleLinked ?? account.googleLinked;
  const items = activity?.items ?? [];
  const lastLogin = activity?.lastLogin;

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
      <PageHeader title="Hồ sơ cá nhân" subtitle="Thông tin cá nhân và cài đặt tài khoản của bạn." />
      {(loadError || error) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError?.message || error}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '360px minmax(0, 1fr)' }, gap: 3, alignItems: 'start' }}>
        <Stack spacing={3}>
          <Box sx={{ ...cardSx, overflow: 'hidden' }}>
            <Box sx={{ bgcolor: brand.yellowSoft, height: 72 }} />
            <Stack alignItems="center" spacing={1.25} sx={{ px: 3, pb: 3, mt: '-48px' }}>
              {isLoading || !data ? (
                <Skeleton variant="circular" width={96} height={96} />
              ) : (
                <UserAvatar name={data.fullName} src={data.avatarUrl} size={96} sx={{ border: '4px solid #fff' }} />
              )}
              <Typography variant="h4" sx={{ color: brand.ink, fontSize: fs.name }}>
                {data?.fullName ?? account.fullName}
              </Typography>
              {(data?.role ?? account.role) !== 'CUSTOMER' && <RoleChip role={data?.role ?? account.role} />}
              <Typography sx={{ color: brand.muted, fontSize: fs.caption }}>
                {data ? `Thành viên từ ${formatMemberSince(data.createdAt)}` : ' '}
              </Typography>
            </Stack>
          </Box>

          <Box sx={{ ...cardSx, p: 3 }}>
            <Typography variant="h5" sx={{ color: brand.ink, fontSize: fs.cardTitle }}>
              Bảo mật tài khoản
            </Typography>
            <Box sx={{ mt: 1 }}>
              <SecurityRow label="Liên kết Google" value={googleLinked ? 'Đã liên kết' : 'Chưa liên kết'} />
              <Divider />
              <SecurityRow
                label="Đăng nhập gần nhất"
                value={activityLoading ? <Skeleton width={110} /> : lastLogin ? formatDateTime(lastLogin.performedAt) : '—'}
              />
              {lastLogin?.ip && (
                <>
                  <Divider />
                  <SecurityRow label="Địa chỉ IP" value={lastLogin.ip} />
                </>
              )}
            </Box>
            {!passwordEnabled && (
              <Typography sx={{ color: brand.muted, display: 'block', mt: 1.5, fontSize: fs.caption }}>
                Tài khoản này đăng nhập bằng Google nên không có mật khẩu THORS để đổi.
              </Typography>
            )}
            {capabilities?.google && !googleLinked && (
              <>
                <Typography sx={{ color: brand.muted, mt: 1.5, mb: 1.5, fontSize: fs.caption }}>
                  Liên kết tài khoản Google dùng cùng email để đăng nhập nhanh hơn.
                </Typography>
                <OutlineButton fullWidth onClick={linkGoogle} sx={{ fontSize: fs.body }}>
                  Liên kết tài khoản Google
                </OutlineButton>
              </>
            )}
          </Box>
        </Stack>

        <Stack spacing={3}>
          <Box sx={{ ...cardSx, p: 3 }}>
            <Typography variant="h5" sx={{ color: brand.ink, fontSize: fs.cardTitle }}>
              Thông tin cá nhân
            </Typography>
            <Typography sx={{ color: brand.muted, fontSize: fs.caption, mt: 0.25 }}>
              Các thông tin này được dùng để liên lạc về tài khoản.
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' },
                gap: 3,
                mt: 2.5
              }}
            >
              <InfoItem label="Họ và tên" value={data?.fullName} />
              <InfoItem label="Địa chỉ email" value={data?.email} />
              <InfoItem label="Số điện thoại" value={data?.phone} />
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 3 }}>
              <BrandButton component={RouterLink} to="/profile/edit" startIcon={<EditOutlined />} sx={{ fontSize: fs.body }}>
                Cập nhật hồ sơ
              </BrandButton>
              {passwordEnabled && (
                <BrandButton component={RouterLink} to="/profile/password" startIcon={<KeyOutlined />} sx={{ fontSize: fs.body }}>
                  Đổi mật khẩu
                </BrandButton>
              )}
            </Stack>
          </Box>

          <Box sx={{ ...cardSx, p: 3 }}>
            <Typography variant="h5" sx={{ color: brand.ink, fontSize: fs.cardTitle }}>
              Hoạt động gần đây
            </Typography>
            <Typography sx={{ color: brand.muted, fontSize: fs.caption, mt: 0.25 }}>
              Các sự kiện gần đây liên quan đến tài khoản của bạn. Nếu thấy điều gì lạ, hãy đổi mật khẩu ngay.
            </Typography>
            <Box sx={{ mt: 1.5 }}>
              {activityLoading ? (
                [0, 1, 2].map((index) => <Skeleton key={index} height={52} />)
              ) : activityError ? (
                <Typography sx={{ color: brand.muted, fontSize: fs.body, py: 2 }}>Không tải được hoạt động gần đây.</Typography>
              ) : items.length === 0 ? (
                <Typography sx={{ color: brand.muted, fontSize: fs.body, py: 2 }}>Chưa có hoạt động nào.</Typography>
              ) : (
                items.map((item, index) => (
                  <Box key={item.id}>
                    {index > 0 && <Divider />}
                    <ActivityRow item={item} />
                  </Box>
                ))
              )}
            </Box>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}