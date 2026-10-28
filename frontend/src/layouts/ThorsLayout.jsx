import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Box, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Tooltip, Typography } from '@mui/material';
import { Stack } from 'features/account/components/Flex';
import { LogoutOutlined } from '@ant-design/icons';
import { useAuth } from 'features/auth/AuthProvider';
import { ROLE_LABEL, ROLE_TITLE, STORE_NAME } from 'features/account/constants';
import { brand } from 'features/account/tokens';
import UserAvatar from 'features/account/components/UserAvatar';
import AppFooter from './AppFooter';
import AppHeader from './AppHeader';
import { CrumbsContext } from './crumbs';
import { navFor } from './navigation';
import ThorsMark from './ThorsMark';

const SIDEBAR_WIDTH = 248;

export default function ThorsLayout() {
  const { account, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mobile, setMobile] = useState(false);
  const [error, setError] = useState('');
  const [crumbs, setCrumbs] = useState([]);
  const crumbContext = useMemo(() => ({ setCrumbs }), []);
  const links = navFor(account.role);
  const isAdmin = account.role === 'ADMIN';

  async function signOut() {
    try {
      await logout();
      navigate('/login');
    } catch (e) {
      setError(e.message);
    }
  }

  const sidebar = (
    <Stack sx={{ height: '100%', bgcolor: brand.surface, p: 2 }}>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ px: 1, py: 1.5 }}>
        <ThorsMark />
        <Typography sx={{ fontSize: 22, fontWeight: 700, letterSpacing: 1.5, color: brand.ink }}>THORS</Typography>
      </Stack>
      <Box sx={{ bgcolor: '#F5F6F1', borderRadius: '12px', p: 1.75, mt: 1, mb: 2.5 }}>
        <Typography variant="subtitle2" sx={{ color: brand.ink, fontWeight: 700 }}>
          {isAdmin ? 'System workspace' : STORE_NAME}
        </Typography>
        <Typography variant="caption" sx={{ color: brand.muted }}>
          {isAdmin ? ROLE_TITLE.ADMIN : `${ROLE_LABEL[account.role]} workspace`}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: 10.5, letterSpacing: 1, color: brand.muted, px: 1.5, mb: 0.75 }}>WORKSPACE</Typography>
      <List disablePadding component="nav" aria-label="Main navigation">
        {links.map(({ to, label, icon }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`);
          return (
            <ListItemButton
              key={to}
              component={Link}
              to={to}
              onClick={() => setMobile(false)}
              aria-current={active ? 'page' : undefined}
              sx={{
                borderRadius: '10px',
                mb: 0.5,
                position: 'relative',
                bgcolor: active ? brand.cyanSoft : 'transparent',
                '&:hover': { bgcolor: active ? brand.cyanSoft : '#F6F6F1' },
                '&::after': active
                  ? { content: '""', position: 'absolute', right: 6, top: 10, bottom: 10, width: 3, borderRadius: 2, bgcolor: brand.cyan }
                  : {}
              }}
            >
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
        <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <AppHeader crumbs={headerCrumbs} onOpenMenu={() => setMobile(true)} onSignOut={signOut} />
          <Box component="main" sx={{ px: { xs: 2, md: 4 }, py: { xs: 3, md: 4 }, maxWidth: 1240, width: '100%', flexGrow: 1 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Outlet />
          </Box>
          <AppFooter />
        </Box>
      </Box>
    </CrumbsContext.Provider>
  );
}