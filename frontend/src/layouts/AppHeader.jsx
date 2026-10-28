import { IconButton, Typography } from '@mui/material';
import { MenuOutlined } from '@ant-design/icons';
import { Stack } from 'features/account/components/Flex';
import { formatToday } from 'features/account/format';
import { brand } from 'features/account/tokens';
import NotificationBell from 'features/notification/NotificationBell';
import UserMenu from './UserMenu';

// Header cố định ở đầu trang. Chỉ chứa những thứ cần ở mọi trang:
// nút mở menu (mobile), breadcrumb, ngày, thông báo và menu tài khoản.
// Nút riêng của từng trang (Add, Export...) đặt ở PageHeader của trang đó, không đặt ở đây.
export default function AppHeader({ crumbs, onOpenMenu, onSignOut }) {
  return (
    <Stack
      component="header"
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{
        height: 56,
        px: { xs: 2, md: 4 },
        borderBottom: `1px solid ${brand.line}`,
        bgcolor: brand.surface,
        position: 'sticky',
        top: 0,
        zIndex: (theme) => theme.zIndex.appBar
      }}
    >
      <IconButton aria-label="Mở menu" sx={{ display: { md: 'none' } }} onClick={onOpenMenu}>
        <MenuOutlined />
      </IconButton>

      <Stack direction="row" spacing={0.75} alignItems="center" component="nav" aria-label="Đường dẫn trang" sx={{ flexGrow: 1, minWidth: 0 }}>
        {crumbs.map((label, index) => (
          <Stack key={`${label}-${index}`} direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
            {index > 0 && (
              <Typography variant="caption" sx={{ color: brand.muted }}>
                /
              </Typography>
            )}
            <Typography
              variant="caption"
              noWrap
              aria-current={index === crumbs.length - 1 ? 'page' : undefined}
              sx={{
                color: index === crumbs.length - 1 ? brand.ink : brand.muted,
                fontWeight: index === crumbs.length - 1 ? 600 : 400,
                fontSize: 13
              }}
            >
              {label}
            </Typography>
          </Stack>
        ))}
      </Stack>

      <Typography variant="caption" sx={{ color: brand.muted, display: { xs: 'none', sm: 'block' } }}>
        {formatToday()}
      </Typography>
      <NotificationBell />
      <UserMenu onSignOut={onSignOut} />
    </Stack>
  );
}