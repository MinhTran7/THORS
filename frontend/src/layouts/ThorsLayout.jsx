import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
  IconButton
} from '@mui/material';
import { UserOutlined, TeamOutlined, HomeOutlined, LogoutOutlined, MenuOutlined } from '@ant-design/icons';
import { useAuth } from 'features/auth/AuthProvider';
<<<<<<< Updated upstream
const labels = { ADMIN: 'Admin', OWNER: 'Chủ cửa hàng', FAMILY_MEMBER: 'Thành viên gia đình', STAFF: 'Nhân viên', CUSTOMER: 'Khách hàng' };
=======
import { ROLE_LABEL, ROLE_TITLE, STORE_NAME } from 'features/account/constants';
import { formatToday } from 'features/account/format';
import { brand } from 'features/account/tokens';
import UserAvatar from 'features/account/components/UserAvatar';
import { CrumbsContext } from './crumbs';
import { navFor } from './navigation';
import ThorsMark from './ThorsMark';
import CartButton from 'components/CartButton';

const SIDEBAR_WIDTH = 248;

>>>>>>> Stashed changes
export default function ThorsLayout() {
  const { account, logout } = useAuth();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState(false);
  const [error, setError] = useState('');
  const links = [
    ['/workspace', 'Trang chính', <HomeOutlined />],
    ['/profile', 'Hồ sơ của tôi', <UserOutlined />],
    ...(['ADMIN', 'OWNER'].includes(account.role) ? [['/accounts', 'Quản lý tài khoản', <TeamOutlined />]] : [])
  ];
  const drawer = (
    <>
      <Stack spacing={1} sx={{ p: 3 }}>
        <Typography variant="h3" color="primary">
          THORS
        </Typography>
        <Typography variant="caption" color="text.secondary">
          TH Omnichannel Retail System
        </Typography>
      </Stack>
      <Divider />
      <List>
        {links.map(([to, label, icon]) => (
          <ListItemButton key={to} component={Link} to={to} onClick={() => setMobile(false)}>
            <ListItemIcon>{icon}</ListItemIcon>
            <ListItemText primary={label} />
          </ListItemButton>
        ))}
      </List>
    </>
  );
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="fixed" elevation={0} color="inherit" sx={{ zIndex: 1201, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar>
          <IconButton aria-label="Mở menu" sx={{ display: { md: 'none' }, mr: 1 }} onClick={() => setMobile(!mobile)}>
            <MenuOutlined />
          </IconButton>
          <Typography variant="h5" sx={{ flexGrow: 1 }}>
            THORS
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Avatar sx={{ width: 32, height: 32 }}>{account.fullName.slice(0, 1)}</Avatar>
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Typography variant="subtitle2">{account.fullName}</Typography>
              <Typography variant="caption" color="text.secondary">
                {labels[account.role]}
              </Typography>
            </Box>
            <Button
              startIcon={<LogoutOutlined aria-hidden="true" />}
              onClick={async () => {
                try {
                  await logout();
                  navigate('/login');
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
<<<<<<< Updated upstream
              Đăng xuất
            </Button>
=======
              <ListItemIcon sx={{ minWidth: 34, color: brand.ink }}>{icon}</ListItemIcon>
              <ListItemText
                primary={label}
                slotProps={{ primary: { sx: { fontSize: 14, fontWeight: active ? 600 : 500, color: brand.ink } } }}
              />
            </ListItemButton>
          );
        })}
      </List>
      <Box sx={{ flexGrow: 1 }} />
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ px: 1, py: 1.5, borderTop: `1px solid ${brand.line}` }}>
        <UserAvatar name={account.fullName} src={account.avatarUrl} size={32} />
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="subtitle2" noWrap sx={{ color: brand.ink }}>
            {account.fullName}
          </Typography>
          <Typography variant="caption" noWrap sx={{ color: brand.muted, display: 'block' }}>
            {ROLE_TITLE[account.role]}
          </Typography>
        </Box>
        <Tooltip title="Sign out">
          <IconButton size="small" aria-label="Sign out" onClick={signOut}>
            <LogoutOutlined />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );

  const headerCrumbs = [ROLE_LABEL[account.role], ...crumbs];

  return (
    <CrumbsContext.Provider value={crumbContext}>
      <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: brand.page }}>
        <Box
          component="aside"
          sx={{
            display: { xs: 'none', md: 'block' },
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            borderRight: `1px solid ${brand.line}`,
            position: 'sticky',
            top: 0,
            height: '100vh'
          }}
        >
          {sidebar}
        </Box>
        <Drawer
          variant="temporary"
          open={mobile}
          onClose={() => setMobile(false)}
          sx={{ display: { md: 'none' }, '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH } }}
        >
          {sidebar}
        </Drawer>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Stack
            component="header"
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{ height: 56, px: { xs: 2, md: 4 }, borderBottom: `1px solid ${brand.line}`, bgcolor: brand.surface }}
          >
            <IconButton aria-label="Open menu" sx={{ display: { md: 'none' } }} onClick={() => setMobile(true)}>
              <MenuOutlined />
            </IconButton>
            <Stack
              direction="row"
              spacing={0.75}
              alignItems="center"
              component="nav"
              aria-label="Breadcrumb"
              sx={{ flexGrow: 1, minWidth: 0 }}
            >
              {headerCrumbs.map((label, index) => (
                <Stack key={`${label}-${index}`} direction="row" spacing={0.75} alignItems="center">
                  {index > 0 && (
                    <Typography variant="caption" sx={{ color: brand.muted }}>
                      /
                    </Typography>
                  )}
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      color: index === headerCrumbs.length - 1 ? brand.ink : brand.muted,
                      fontWeight: index === headerCrumbs.length - 1 ? 600 : 400,
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
            {account.role === 'CUSTOMER' && <CartButton />}
            <Tooltip title="No new notifications">
              <IconButton aria-label="Notifications" size="small">
                <BellOutlined />
              </IconButton>
            </Tooltip>
            <Link to="/profile" aria-label="Your profile">
              <UserAvatar name={account.fullName} src={account.avatarUrl} size={30} />
            </Link>
>>>>>>> Stashed changes
          </Stack>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{ display: { xs: 'none', md: 'block' }, width: 260, flexShrink: 0, '& .MuiDrawer-paper': { width: 260, pt: '60px' } }}
      >
        {drawer}
      </Drawer>
      <Drawer variant="temporary" open={mobile} onClose={() => setMobile(false)} sx={{ '& .MuiDrawer-paper': { width: 260, pt: '60px' } }}>
        {drawer}
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 4 }, pt: { xs: 10, md: 12 }, minWidth: 0 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Outlet />
      </Box>
    </Box>
  );
}
