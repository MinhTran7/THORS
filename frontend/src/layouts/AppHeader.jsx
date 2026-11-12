import { Link as RouterLink, useLocation } from 'react-router-dom';
import { IconButton, Typography } from '@mui/material';
import { MenuOutlined, RightOutlined } from '@ant-design/icons';
import { Stack } from 'features/account/components/Flex';
import { brand } from 'features/account/tokens';
import { useAuth } from 'features/auth/AuthProvider';
import NotificationBell from 'features/notification/NotificationBell';
import CartButton from 'components/CartButton';
import UserMenu from './UserMenu';
import PendingCartHandler from 'features/shop/PendingCartHandler';
import { buildCrumbs } from './routeCrumbs';

// Ví dụ: "Chủ Nhật, 1 tháng 11, 2026"
function formatTodayVi() {
  return new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Header cố định ở đầu trang. Chỉ chứa những thứ cần ở mọi trang:
// nút mở menu (mobile), breadcrumb, ngày, thông báo và menu tài khoản.
// Nút riêng của từng trang (Add, Export...) đặt ở PageHeader của trang đó, không đặt ở đây.
export default function AppHeader({ crumbs, onOpenMenu, onSignOut }) {
  const { account } = useAuth();
  const { pathname } = useLocation();
  return (
    <Stack
      component="header"
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{
        height: 56,
        px: { xs: 2, md: 4 },
        borderBottom: `1px solid ${brand.cardLine}`,
        bgcolor: brand.page,
        position: 'sticky',
        top: 0,
        zIndex: (theme) => theme.zIndex.appBar
      }}
    >
      <IconButton aria-label="Mở menu" sx={{ display: { md: 'none' } }} onClick={onOpenMenu}>
        <MenuOutlined />
      </IconButton>

      <Stack direction="row" spacing={0.75} alignItems="center" component="nav" aria-label="Đường dẫn trang" sx={{ flexGrow: 1, minWidth: 0 }}>
        {buildCrumbs(crumbs, pathname, account?.role).map(({ label, to }, index, list) => {
          const last = index === list.length - 1;
          const linked = !last && to && to !== pathname;
          return (
            <Stack key={`${label}-${index}`} direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
              {index > 0 && <RightOutlined style={{ fontSize: 10, color: brand.muted }} />}
              <Typography
                variant="caption"
                noWrap
                {...(linked ? { component: RouterLink, to } : {})}
                aria-current={last ? 'page' : undefined}
                sx={{
                  color: last ? brand.ink : brand.muted,
                  fontWeight: last ? 700 : 400,
                  fontSize: 14,
                  textDecoration: 'none'
                }}
              >
                {label}
              </Typography>
            </Stack>
          );
        })}
      </Stack>

      <Typography variant="caption" sx={{ color: brand.muted, fontSize: 14, display: { xs: 'none', sm: 'block' } }}>
        {formatTodayVi()}
      </Typography>
      {account?.role === 'CUSTOMER' && <CartButton />}
      <PendingCartHandler />
      <NotificationBell />
      <UserMenu onSignOut={onSignOut} />
    </Stack>
  );
}
