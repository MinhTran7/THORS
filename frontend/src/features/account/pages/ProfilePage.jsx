import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Chip, Skeleton, Typography } from '@mui/material';
import { C, SERIF } from 'features/shop/storeTheme';
import { StoreAccountShell, storePanelSx, storePanelTitleSx } from '../components/StoreAccount';
import { Stack } from '../components/Flex';
import {
  CalendarOutlined,
  CheckCircleFilled,
  EditOutlined,
  KeyOutlined,
  MailOutlined,
  PhoneOutlined,
  UserOutlined
} from '@ant-design/icons';
import { useAuth } from 'features/auth/AuthProvider';
import { useCrumbs } from 'layouts/crumbs';
import { formatMonthYear } from '../format';
import { useProfile } from '../hooks';
import { brand, cardSx, fs } from '../tokens';
import { BrandButton, OutlineButton } from '../components/Brand';
import { RoleChip } from '../components/Chips';
import { PageHeader } from '../components/Blocks';
import UserAvatar from '../components/UserAvatar';

const CRUMBS = ['Hồ sơ'];

// TODO: đưa các màu này vào tokens.js (brand) khi có dịp.
const surface = { base: '#FBFBF8', hover: '#F6F7F0', hoverBorder: '#DCDDD5' };

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

// Một dòng thông tin nhỏ có icon ở thẻ đầu hồ sơ (email, ngày tham gia…)
function MetaItem({ icon, children }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
      <Box component="span" sx={{ display: 'flex', fontSize: 13, color: brand.muted }}>
        {icon}
      </Box>
      <Typography sx={{ color: brand.muted, fontSize: fs.caption, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {children}
      </Typography>
    </Stack>
  );
}

const pillSx = (bg, color) => ({ bgcolor: bg, color, fontWeight: 600, fontSize: 12.5, height: 26, '& .MuiChip-icon': { ml: '6px' } });

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

function CustomerProfile({ data, loading, fullName, passwordEnabled, errorText }) {
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

        {/* Cột phải: thông tin cá nhân */}
        <Box component="section" sx={{ ...storePanelSx, p: { xs: 3, sm: 4 } }}>
          <Box component="h2" sx={{ ...storePanelTitleSx, mb: 1 }}>
            Thông tin cá nhân
          </Box>
          <StoreInfoRow label="Họ và tên">{loading ? <Skeleton width={140} /> : data?.fullName}</StoreInfoRow>
          <StoreInfoRow label="Email">{loading ? <Skeleton width={180} /> : data?.email}</StoreInfoRow>
          <StoreInfoRow label="Số điện thoại">{loading ? <Skeleton width={110} /> : data?.phone}</StoreInfoRow>
        </Box>
      </Box>
    </StoreAccountShell>
  );
}

export default function ProfilePage() {
  useCrumbs(CRUMBS);
  const { account } = useAuth();
  const { data, error: loadError, isLoading } = useProfile();

  // Chỉ hiện skeleton khi đang tải lần đầu; nếu lỗi thì hiện '—' thay vì quay mãi.
  const loading = isLoading && !data;
  const fullName = data?.fullName ?? account.fullName;
  const role = data?.role ?? account.role;
  const passwordEnabled = data?.passwordEnabled ?? account.passwordEnabled;
  const errorText = loadError ? loadError.message || 'Không thể tải hồ sơ. Vui lòng thử lại.' : '';

  if (role === 'CUSTOMER') {
    return <CustomerProfile data={data} loading={loading} fullName={fullName} passwordEnabled={passwordEnabled} errorText={errorText} />;
  }

  return (
    <Box>
      <PageHeader title="Hồ sơ cá nhân" subtitle="Thông tin cá nhân và cài đặt tài khoản của bạn." />
      {errorText && (
        <Alert severity="error" sx={{ mb: 2.5, borderRadius: '10px' }}>
          {errorText}
        </Alert>
      )}

      {/* Thẻ đầu hồ sơ: ảnh, tên, vai trò, email, ngày tham gia; nút Cập nhật hồ sơ / Đổi mật khẩu bên phải */}
      <Box sx={{ ...cardSx, overflow: 'hidden', mb: 2.5 }}>
        <Box sx={{ background: `linear-gradient(135deg, ${brand.cyanSoft} 0%, #D2F4F7 45%, ${brand.yellowSoft} 100%)`, height: 64 }} />
        <Box
          sx={{
            px: { xs: 2.5, sm: 3 },
            pb: 2.5,
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'center', md: 'flex-end' },
            gap: { xs: 1.5, md: 2.5 },
            textAlign: { xs: 'center', md: 'left' }
          }}
        >
          <Box sx={{ mt: '-44px', flexShrink: 0, position: 'relative', zIndex: 2 }}>
            {loading ? (
              <Skeleton variant="circular" width={96} height={96} />
            ) : (
              <UserAvatar
                name={fullName}
                src={data?.avatarUrl}
                size={96}
                sx={{ border: '4px solid #fff', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.1)', bgcolor: brand.cyanSoft }}
              />
            )}
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent={{ xs: 'center', md: 'flex-start' }}
              sx={{ flexWrap: 'wrap', rowGap: 0.75 }}
            >
              <Typography variant="h4" component="h2" sx={{ color: brand.ink, fontSize: 20, fontWeight: 700, letterSpacing: -0.2 }}>
                {fullName}
              </Typography>
              <RoleChip role={role} />
            </Stack>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={{ xs: 0.5, sm: 2 }}
              alignItems="center"
              justifyContent={{ xs: 'center', md: 'flex-start' }}
              sx={{ mt: 0.75, flexWrap: 'wrap' }}
            >
              {data?.email && <MetaItem icon={<MailOutlined />}>{data.email}</MetaItem>}
              {data?.createdAt && <MetaItem icon={<CalendarOutlined />}>Thành viên từ {formatMonthYear(data.createdAt)}</MetaItem>}
            </Stack>
            <Stack direction="row" spacing={1} justifyContent={{ xs: 'center', md: 'flex-start' }} sx={{ mt: 1.25, flexWrap: 'wrap', rowGap: 1 }}>
              <Chip
                size="small"
                icon={<CheckCircleFilled style={{ color: brand.successInk, fontSize: 13 }} />}
                label="Tài khoản đang hoạt động"
                sx={pillSx(brand.successBg, brand.successInk)}
              />
            </Stack>
          </Box>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.25}
            sx={{ flexShrink: 0, width: { xs: '100%', md: 'auto' }, alignSelf: { md: 'center' }, mt: { md: 3 } }}
          >
            <BrandButton component={RouterLink} to="/profile/edit" startIcon={<EditOutlined />} sx={{ fontSize: fs.body, py: 1, px: 2.5 }}>
              Cập nhật hồ sơ
            </BrandButton>
            {passwordEnabled && (
              <OutlineButton component={RouterLink} to="/profile/password" startIcon={<KeyOutlined />} sx={{ fontSize: fs.body, py: 1, px: 2.5 }}>
                Đổi mật khẩu
              </OutlineButton>
            )}
          </Stack>
        </Box>
      </Box>

      {/* Thông tin cá nhân */}
      <Box sx={{ ...cardSx, p: 2.5 }}>
        <SectionHeader icon={<UserOutlined />} title="Thông tin cá nhân" subtitle="Thông tin liên hệ chính thức dùng cho tài khoản của bạn." />

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
    </Box>
  );
}
