import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Chip, Divider, Skeleton, Typography } from '@mui/material';
import { C, SERIF } from 'features/shop/storeTheme';
import { StoreAccountShell, storePanelSx, storePanelTitleSx } from '../components/StoreAccount';
import { Stack } from '../components/Flex';
import {
  CalendarOutlined,
  CheckCircleFilled,
  EditOutlined,
  GoogleOutlined,
  KeyOutlined,
  LockOutlined,
  MailOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  UserOutlined
} from '@ant-design/icons';
import { useAuth } from 'features/auth/AuthProvider';
import { useCapabilities } from 'features/auth/components/ChannelPicker';
import { useCrumbs } from 'layouts/crumbs';
import { accountsApi } from '../api';
import { formatMonthYear } from '../format';
import { useProfile } from '../hooks';
import { brand, cardSx, fs } from '../tokens';
import { BrandButton, OutlineButton } from '../components/Brand';
import { RoleChip } from '../components/Chips';
import { PageHeader } from '../components/Blocks';
import UserAvatar from '../components/UserAvatar';

const CRUMBS = ['Hồ sơ'];

// TODO: đưa các màu này vào tokens.js (brand) khi có dịp.
const surface = { base: '#FBFBF8', hover: '#F6F7F0', hoverBorder: '#DCDDD5', google: '#EA4335' };

const iconBoxSx = {
  borderRadius: '10px',
  bgcolor: brand.cyanSoft,
  color: brand.inkOnCyan,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0
};

// TODO: có thể chuyển SectionHeader và SecurityRow sang components/Blocks.jsx để dùng chung.
function SectionHeader({ icon, title, subtitle }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 2 }}>
      <Box sx={{ ...iconBoxSx, width: 38, height: 38, fontSize: 18 }}>{icon}</Box>
      <Box>
        <Typography variant="h5" component="h2" sx={{ color: brand.ink, fontSize: fs.cardTitle, fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography sx={{ color: brand.muted, fontSize: fs.caption }}>{subtitle}</Typography>
      </Box>
    </Stack>
  );
}

function SecurityRow({ icon, title, description, action }) {
  return (
    <Box
      sx={{
        bgcolor: surface.base,
        border: `1px solid ${brand.line}`,
        borderRadius: '12px',
        p: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 2
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.75}>
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: '10px',
            bgcolor: '#FFFFFF',
            border: `1px solid ${brand.line}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            flexShrink: 0
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography sx={{ color: brand.ink, fontWeight: 600, fontSize: fs.strong }}>{title}</Typography>
          <Typography sx={{ color: brand.muted, fontSize: fs.caption, mt: 0.25 }}>{description}</Typography>
        </Box>
      </Stack>
      <Stack direction="row" spacing={1.25} alignItems="center">
        {action}
      </Stack>
    </Box>
  );
}

function InfoItem({ label, value, caption, icon }) {
  return (
    <Box
      sx={{
        bgcolor: surface.base,
        border: `1px solid ${brand.line}`,
        borderRadius: '12px',
        p: 2,
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
        '&:hover': { bgcolor: surface.hover, borderColor: surface.hoverBorder },
        minWidth: 0,
        flex: 1
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        {icon && <Box sx={{ ...iconBoxSx, width: 42, height: 42, fontSize: 18 }}>{icon}</Box>}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ color: brand.muted, fontSize: fs.caption, fontWeight: 500, lineHeight: 1.2 }}>{label}</Typography>
          <Typography
            component="div"
            sx={{
              color: brand.ink,
              fontWeight: 600,
              fontSize: fs.body,
              mt: 0.35,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
            title={typeof value === 'string' ? value : undefined}
          >
            {value || '—'}
          </Typography>
          {caption && (
            <Typography
              sx={{ color: brand.muted, fontSize: 11.5, mt: 0.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {caption}
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  );
}

/* ------------------------------------------------------------------ Khách hàng (giao diện cửa hàng) */

function StoreInfoRow({ label, children }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 2,
        py: 1.75,
        borderTop: `1px solid ${C.line}`,
        fontSize: 14
      }}
    >
      <Box component="span" sx={{ color: C.muted, flexShrink: 0 }}>
        {label}
      </Box>
      <Box component="span" sx={{ textAlign: 'right', fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' }}>
        {children || '—'}
      </Box>
    </Box>
  );
}

function StoreSecurityRow({ title, description, action }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 2,
        py: 2.25,
        borderTop: `1px solid ${C.line}`
      }}
    >
      <Box sx={{ minWidth: 0, flex: '1 1 260px' }}>
        <Box sx={{ fontSize: 15, fontWeight: 600 }}>{title}</Box>
        <Box sx={{ fontSize: 13, color: C.muted, mt: 0.5, lineHeight: 1.55 }}>{description}</Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>{action}</Box>
    </Box>
  );
}

const storeTagSx = { fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' };

function CustomerProfile({ data, loading, fullName, passwordEnabled, googleLinked, canLinkGoogle, linking, onLinkGoogle, errorText }) {
  return (
    <StoreAccountShell title="Hồ sơ của tôi" subtitle="Thông tin cá nhân và bảo mật tài khoản của bạn.">
      {errorText && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {errorText}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px minmax(0, 1fr)' }, gap: 3, alignItems: 'start' }}>
        {/* Cột trái: ảnh, tên và nút thao tác */}
        <Box sx={{ ...storePanelSx, p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
          {loading ? (
            <Skeleton variant="circular" width={112} height={112} sx={{ mx: 'auto' }} />
          ) : (
            <UserAvatar
              name={fullName}
              src={data?.avatarUrl}
              size={112}
              sx={{ mx: 'auto', bgcolor: C.photo, color: C.ink, fontFamily: SERIF }}
            />
          )}
          <Box
            component="h2"
            sx={{ m: 0, mt: 2.5, fontFamily: SERIF, fontWeight: 400, fontSize: 26, lineHeight: 1.2, overflowWrap: 'anywhere' }}
          >
            {fullName}
          </Box>
          {data?.createdAt && <Box sx={{ fontSize: 13, color: C.muted, mt: 1 }}>Thành viên từ {formatMonthYear(data.createdAt)}</Box>}
          <Stack spacing={1.25} sx={{ mt: 3.5 }}>
            <Button component={RouterLink} to="/profile/edit" variant="contained" fullWidth sx={{ py: 1.5 }}>
              CẬP NHẬT HỒ SƠ
            </Button>
            {passwordEnabled && (
              <Button component={RouterLink} to="/profile/password" variant="outlined" fullWidth sx={{ py: 1.5 }}>
                ĐỔI MẬT KHẨU
              </Button>
            )}
          </Stack>
        </Box>

        {/* Cột phải: thông tin và bảo mật */}
        <Stack spacing={3}>
          <Box component="section" sx={{ ...storePanelSx, p: { xs: 3, sm: 4 } }}>
            <Box component="h2" sx={{ ...storePanelTitleSx, mb: 1 }}>
              Thông tin cá nhân
            </Box>
            <StoreInfoRow label="Họ và tên">{loading ? <Skeleton width={140} /> : data?.fullName}</StoreInfoRow>
            <StoreInfoRow label="Email">{loading ? <Skeleton width={180} /> : data?.email}</StoreInfoRow>
            <StoreInfoRow label="Số điện thoại">{loading ? <Skeleton width={110} /> : data?.phone}</StoreInfoRow>
          </Box>

          <Box component="section" sx={{ ...storePanelSx, p: { xs: 3, sm: 4 } }}>
            <Box component="h2" sx={{ ...storePanelTitleSx, mb: 1 }}>
              Bảo mật & đăng nhập
            </Box>
            <StoreSecurityRow
              title="Tài khoản Google"
              description={
                googleLinked
                  ? 'Đã liên kết với email này để đăng nhập nhanh.'
                  : 'Liên kết Google dùng cùng email để đăng nhập thuận tiện hơn.'
              }
              action={
                googleLinked ? (
                  <Box component="span" sx={{ ...storeTagSx, color: '#2F6B3F' }}>
                    Đã liên kết
                  </Box>
                ) : canLinkGoogle ? (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={onLinkGoogle}
                    disabled={linking}
                    startIcon={<GoogleOutlined />}
                    sx={{ px: 2 }}
                  >
                    {linking ? 'Đang chuyển hướng…' : 'Liên kết ngay'}
                  </Button>
                ) : (
                  <Box component="span" sx={{ ...storeTagSx, color: C.muted }}>
                    Chưa liên kết
                  </Box>
                )
              }
            />
            <StoreSecurityRow
              title="Mật khẩu"
              description={
                passwordEnabled
                  ? 'Bạn nên đổi mật khẩu định kỳ để giữ tài khoản an toàn.'
                  : 'Tài khoản đăng nhập bằng Google nên không có mật khẩu riêng.'
              }
              action={
                passwordEnabled ? (
                  <Button component={RouterLink} to="/profile/password" variant="outlined" size="small" sx={{ px: 2 }}>
                    Đổi mật khẩu
                  </Button>
                ) : (
                  <Box component="span" sx={{ ...storeTagSx, color: C.muted }}>
                    Đăng nhập Google
                  </Box>
                )
              }
            />
          </Box>
        </Stack>
      </Box>
    </StoreAccountShell>
  );
}

export default function ProfilePage() {
  useCrumbs(CRUMBS);
  const { account } = useAuth();
  const capabilities = useCapabilities();
  const [error, setError] = useState('');
  const [linking, setLinking] = useState(false);
  const { data, error: loadError, isLoading } = useProfile();

  // Chỉ hiện skeleton khi đang tải lần đầu; nếu lỗi thì hiện '—' thay vì quay mãi.
  const loading = isLoading && !data;
  const fullName = data?.fullName ?? account.fullName;
  const role = data?.role ?? account.role;
  const passwordEnabled = data?.passwordEnabled ?? account.passwordEnabled;
  const googleLinked = data?.googleLinked ?? account.googleLinked;

  async function linkGoogle() {
    if (linking) return;
    setError('');
    setLinking(true);
    try {
      const result = await accountsApi.linkGoogle();
      sessionStorage.setItem('thorsReturnTo', '/profile');
      // Đánh dấu là liên kết (không phải đăng nhập) để sau khi Google trả về vẫn quay lại Hồ sơ
      sessionStorage.setItem('thorsLinking', '1');
      window.location.assign(result.url);
    } catch (e) {
      setError(e.message || 'Không thể liên kết tài khoản Google. Vui lòng thử lại.');
      setLinking(false);
    }
  }

  if (role === 'CUSTOMER') {
    return (
      <CustomerProfile
        data={data}
        loading={loading}
        fullName={fullName}
        passwordEnabled={passwordEnabled}
        googleLinked={googleLinked}
        canLinkGoogle={Boolean(capabilities?.google)}
        linking={linking}
        onLinkGoogle={linkGoogle}
        errorText={loadError || error ? error || loadError?.message || 'Không thể tải hồ sơ. Vui lòng thử lại.' : ''}
      />
    );
  }

  return (
    <Box>
      <PageHeader title="Hồ sơ cá nhân" subtitle="Thông tin cá nhân và cài đặt tài khoản của bạn." />
      {(loadError || error) && (
        <Alert severity="error" sx={{ mb: 2.5, borderRadius: '10px' }}>
          {error || loadError?.message || 'Không thể tải hồ sơ. Vui lòng thử lại.'}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '320px minmax(0, 1fr)', lg: '350px minmax(0, 1fr)' },
          gap: 2.5,
          alignItems: 'start'
        }}
      >
        {/* Cột trái: thẻ tóm tắt hồ sơ và nút thao tác */}
        <Box sx={{ ...cardSx, overflow: 'hidden' }}>
          <Box
            sx={{
              background: `linear-gradient(135deg, ${brand.cyanSoft} 0%, #D2F4F7 45%, ${brand.yellowSoft} 100%)`,
              height: 72
            }}
          />

          <Box sx={{ px: 3, pb: 2.5, pt: 0, textAlign: 'center' }}>
            <Box sx={{ mt: '-48px', display: 'inline-flex', position: 'relative', zIndex: 2 }}>
              {loading ? (
                <Skeleton variant="circular" width={96} height={96} />
              ) : (
                <UserAvatar
                  name={fullName}
                  src={data?.avatarUrl}
                  size={96}
                  sx={{
                    border: '4px solid #fff',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.1)',
                    bgcolor: brand.cyanSoft
                  }}
                />
              )}
            </Box>

            <Typography variant="h4" component="h2" sx={{ color: brand.ink, fontSize: 20, fontWeight: 700, mt: 1.25, letterSpacing: -0.2 }}>
              {fullName}
            </Typography>

            <Box sx={{ mt: 0.75, display: 'flex', justifyContent: 'center' }}>{role !== 'CUSTOMER' && <RoleChip role={role} />}</Box>

            <Stack spacing={0.75} sx={{ mt: 1.5, color: brand.muted, fontSize: fs.caption }}>
              {data?.email && (
                <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center">
                  <MailOutlined style={{ fontSize: 13 }} />
                  <Typography sx={{ color: 'inherit', fontSize: 'inherit' }}>{data.email}</Typography>
                </Stack>
              )}
              {data?.createdAt && (
                <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center">
                  <CalendarOutlined style={{ fontSize: 13 }} />
                  <Typography sx={{ color: 'inherit', fontSize: 'inherit' }}>Thành viên từ {formatMonthYear(data.createdAt)}</Typography>
                </Stack>
              )}
            </Stack>

            <Divider sx={{ my: 1.75, borderColor: brand.line }} />

            <Stack spacing={1.25}>
              <BrandButton
                component={RouterLink}
                to="/profile/edit"
                startIcon={<EditOutlined />}
                fullWidth
                sx={{ fontSize: fs.body, py: 1 }}
              >
                Cập nhật hồ sơ
              </BrandButton>
              {passwordEnabled && (
                <OutlineButton
                  component={RouterLink}
                  to="/profile/password"
                  startIcon={<KeyOutlined />}
                  fullWidth
                  sx={{ fontSize: fs.body, py: 1 }}
                >
                  Đổi mật khẩu
                </OutlineButton>
              )}
            </Stack>

            <Box
              sx={{
                mt: 1.5,
                py: 0.85,
                px: 1.5,
                bgcolor: brand.successBg,
                color: brand.successInk,
                borderRadius: '8px',
                fontSize: 12.5,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.75
              }}
            >
              <CheckCircleFilled style={{ fontSize: 13 }} />
              Tài khoản đang hoạt động
            </Box>
          </Box>
        </Box>

        {/* Cột phải: thông tin chi tiết và bảo mật */}
        <Stack spacing={2.5}>
          {/* Thông tin cá nhân */}
          <Box sx={{ ...cardSx, p: 2.5 }}>
            <SectionHeader
              icon={<UserOutlined />}
              title="Thông tin cá nhân"
              subtitle="Thông tin liên hệ chính thức dùng cho tài khoản của bạn."
            />

            {/* auto-fit: tự chia 3/2/1 cột theo chỗ trống thực tế của khung, không theo độ rộng cửa sổ */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 2 }}>
              <InfoItem
                label="Họ và tên"
                value={loading ? <Skeleton width="70%" /> : data?.fullName}
                caption="Tên hiển thị người dùng"
                icon={<UserOutlined style={{ fontSize: 18 }} />}
              />
              <InfoItem
                label="Địa chỉ email"
                value={loading ? <Skeleton width="85%" /> : data?.email}
                caption="Tài khoản đăng nhập chính"
                icon={<MailOutlined style={{ fontSize: 18 }} />}
              />
              <InfoItem
                label="Số điện thoại"
                value={loading ? <Skeleton width="60%" /> : data?.phone}
                caption="Số liên lạc phục vụ công việc"
                icon={<PhoneOutlined style={{ fontSize: 18 }} />}
              />
            </Box>
          </Box>

          {/* Bảo mật tài khoản */}
          <Box sx={{ ...cardSx, p: 2.5 }}>
            <SectionHeader
              icon={<SafetyCertificateOutlined />}
              title="Bảo mật & Xác thực"
              subtitle="Quản lý các phương thức đăng nhập và bảo vệ tài khoản"
            />

            <Stack spacing={1.75}>
              <SecurityRow
                icon={<GoogleOutlined style={{ color: surface.google }} />}
                title="Liên kết tài khoản Google"
                description={
                  googleLinked
                    ? 'Tài khoản Google đã được liên kết với email này để đăng nhập nhanh'
                    : 'Liên kết Google dùng cùng email để đăng nhập thuận tiện hơn'
                }
                action={
                  googleLinked ? (
                    <Chip
                      size="small"
                      icon={<CheckCircleFilled style={{ color: brand.successInk, fontSize: 13 }} />}
                      label="Đã liên kết"
                      sx={{
                        bgcolor: brand.successBg,
                        color: brand.successInk,
                        fontWeight: 600,
                        fontSize: fs.caption,
                        height: 28,
                        '& .MuiChip-icon': { ml: '6px' }
                      }}
                    />
                  ) : (
                    <>
                      <Chip
                        size="small"
                        label="Chưa liên kết"
                        sx={{ bgcolor: brand.neutralBg, color: brand.muted, fontWeight: 600, fontSize: fs.caption, height: 28 }}
                      />
                      {capabilities?.google && (
                        <OutlineButton
                          size="small"
                          onClick={linkGoogle}
                          disabled={linking}
                          startIcon={<GoogleOutlined style={{ color: surface.google }} />}
                          sx={{ fontSize: fs.caption, py: 0.6, px: 2 }}
                        >
                          {linking ? 'Đang chuyển hướng…' : 'Liên kết ngay'}
                        </OutlineButton>
                      )}
                    </>
                  )
                }
              />

              <SecurityRow
                icon={<LockOutlined style={{ color: brand.ink }} />}
                title="Mật khẩu tài khoản"
                description={
                  passwordEnabled
                    ? 'Mật khẩu đang hoạt động. Bạn nên đổi mật khẩu định kỳ để nâng cao an toàn'
                    : 'Tài khoản đăng nhập bằng Google nên không có mật khẩu THORS'
                }
                action={
                  passwordEnabled ? (
                    <OutlineButton
                      component={RouterLink}
                      to="/profile/password"
                      size="small"
                      startIcon={<KeyOutlined />}
                      sx={{ fontSize: fs.caption, py: 0.6, px: 2 }}
                    >
                      Đổi mật khẩu
                    </OutlineButton>
                  ) : (
                    <Chip
                      size="small"
                      label="Xác thực Google SSO"
                      sx={{ bgcolor: brand.cyanSoft, color: brand.inkOnCyan, fontWeight: 600, fontSize: fs.caption, height: 28 }}
                    />
                  )
                }
              />
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
