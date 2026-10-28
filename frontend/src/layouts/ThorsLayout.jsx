import { useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
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
import {
  UserOutlined,
  TeamOutlined,
  HomeOutlined,
  LogoutOutlined,
  MenuOutlined,
  InboxOutlined,
  ShoppingCartOutlined,
  ImportOutlined,
  RollbackOutlined,
  LayoutOutlined,
  EnvironmentOutlined
} from '@ant-design/icons';
import { warehouseMenu } from 'features/warehouse/model';
import { useAuth } from 'features/auth/AuthProvider';
const labels = { ADMIN: 'Admin', OWNER: 'Chủ cửa hàng', FAMILY_MEMBER: 'Thành viên gia đình', STAFF: 'Nhân viên', CUSTOMER: 'Khách hàng' };
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
              Đăng xuất
            </Button>
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
