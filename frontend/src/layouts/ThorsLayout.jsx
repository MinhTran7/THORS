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
  const location = useLocation();
  const canWarehouse = ['OWNER', 'FAMILY_MEMBER'].includes(account.role);
  const warehouseIcons = [
    <InboxOutlined />,
    <ShoppingCartOutlined />,
    <ImportOutlined />,
    <RollbackOutlined />,
    <LayoutOutlined />,
    <TeamOutlined />,
    <EnvironmentOutlined />
  ];
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
          <ListItemButton key={to} selected={location.pathname === to} component={Link} to={to} onClick={() => setMobile(false)}>
            <ListItemIcon>{icon}</ListItemIcon>
            <ListItemText primary={label} />
          </ListItemButton>
        ))}
      </List>
      {canWarehouse && (
        <>
          <Divider />
          <Typography variant="caption" color="text.secondary" sx={{ px: 3, pt: 2.5, pb: 1, display: 'block' }}>
            QUẢN LÝ KHO
          </Typography>
          <List>
            {warehouseMenu.map(([key, label], index) => (
              <ListItemButton
                key={key}
                selected={location.pathname === `/warehouse/${key}`}
                component={Link}
                to={`/warehouse/${key}`}
                onClick={() => setMobile(false)}
                sx={{
                  '&.Mui-selected': {
                    bgcolor: 'primary.lighter',
                    color: 'primary.main',
                    borderRight: '3px solid',
                    borderColor: 'primary.main'
                  }
                }}
              >
                <ListItemIcon sx={{ color: 'inherit' }}>{warehouseIcons[index]}</ListItemIcon>
                <ListItemText primary={label} />
              </ListItemButton>
            ))}
          </List>
        </>
      )}
    </>
  );
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
