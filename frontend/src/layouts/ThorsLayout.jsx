
import { useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useNavigate
} from 'react-router-dom';

import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Breadcrumbs,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Tooltip,
  Typography
} from '@mui/material';

import {
  AppstoreOutlined,
  BellOutlined,
  HomeOutlined,
  LogoutOutlined,
  MenuOutlined,
  ShopOutlined,
  TeamOutlined,
  UserOutlined
} from '@ant-design/icons';

import { useAuth } from 'features/auth/AuthProvider';

const DRAWER_WIDTH = 240;
const HEADER_HEIGHT = 64;

const COLORS = {
  sidebar: '#FFFFFF',
  background: '#FAFBFC',
  border: '#E9EEF3',
  text: '#202D42',
  muted: '#75869F',
  cyan: '#8DE9F2',
  cyanLight: '#EAFBFD'
};

const roleLabels = {
  ADMIN: 'Admin',
  OWNER: 'Shop Owner',
  FAMILY_MEMBER: 'Family Member',
  STAFF: 'Staff',
  CUSTOMER: 'Customer'
};

const getInitials = (name) => {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return 'U';

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
};

export default function ThorsLayout() {
  const { account, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [error, setError] = useState('');

  const role = account?.role;
  const fullName = account?.fullName || 'User';
  const roleName = roleLabels[role] || role || 'User';

  const isOwner = role === 'OWNER';
  const canManageAccounts = ['ADMIN', 'OWNER'].includes(role);

  // ==========================================
  // SIDEBAR NAVIGATION
  // ==========================================

  const links = [
    {
      path: '/workspace',
      label: 'Dashboard',
      icon: <HomeOutlined />
    },

    ...(isOwner
      ? [
          {
            path: '/products',
            label: 'Products',
            icon: <ShopOutlined />
          },
          {
            path: '/categories',
            label: 'Categories',
            icon: <AppstoreOutlined />
          }
        ]
      : []),

    ...(canManageAccounts
      ? [
          {
            path: '/accounts',
            label: isOwner ? 'Staff' : 'Accounts',
            icon: <TeamOutlined />
          }
        ]
      : []),

    {
      path: '/profile',
      label: 'Profile',
      icon: <UserOutlined />
    }
  ];

  // ==========================================
  // ACTIVE NAVIGATION
  // ==========================================

  const isActive = (path) => {
    return (
      location.pathname === path ||
      location.pathname.startsWith(`${path}/`)
    );
  };

  const activeLink = links.find((item) =>
    isActive(item.path)
  );

  const currentPage = activeLink?.label || 'Workspace';

  // ==========================================
  // CURRENT DATE
  // ==========================================

  const currentDate = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // ==========================================
  // LOGOUT
  // ==========================================

  const handleLogout = async () => {
    try {
      setError('');
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(
        err?.message || 'Unable to log out. Please try again.'
      );
    }
  };

  // ==========================================
  // SIDEBAR CONTENT
  // ==========================================

  const sidebarContent = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: COLORS.sidebar
      }}
    >
      {/* LOGO */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{
          height: HEADER_HEIGHT,
          px: 2.5,
          borderBottom: `1px solid ${COLORS.border}`
        }}
      >
        <Box
          sx={{
            width: 22,
            height: 22,
            position: 'relative',
            flexShrink: 0
          }}
        >
          <Box
            sx={{
              width: 20,
              height: 13,
              borderRadius: '4px',
              bgcolor: '#E991BC',
              border: '1.5px solid #29384C'
            }}
          />

          <Box
            sx={{
              position: 'absolute',
              width: 3,
              height: 9,
              left: 9,
              top: 13,
              bgcolor: '#29384C',
              borderRadius: 1
            }}
          />
        </Box>

        <Typography
          fontSize={20}
          fontWeight={800}
          letterSpacing={1}
          sx={{ color: COLORS.text }}
        >
          THORS
        </Typography>
      </Stack>

      {/* WORKSPACE CARD */}
      <Box
        sx={{
          mx: 2,
          mt: 2.5,
          mb: 2.5,
          px: 1.5,
          py: 1.5,
          borderRadius: 2,
          bgcolor: '#F7F9FB'
        }}
      >
        <Typography
          fontSize={12}
          fontWeight={700}
          color={COLORS.text}
        >
          THORS Studio
        </Typography>

        <Typography
          fontSize={11}
          color={COLORS.muted}
          sx={{ mt: 0.5 }}
        >
          {roleName} workspace
        </Typography>
      </Box>

      {/* WORKSPACE LABEL */}
      <Typography
        sx={{
          px: 2.5,
          mb: 1,
          fontSize: 10,
          fontWeight: 700,
          color: COLORS.muted,
          letterSpacing: 0.8
        }}
      >
        WORKSPACE
      </Typography>

      {/* NAVIGATION */}
      <List
        disablePadding
        sx={{
          px: 1.5,
          flexGrow: 1
        }}
      >
        {links.map((item) => {
          const selected = isActive(item.path);

          return (
            <ListItemButton
              key={item.path}
              component={Link}
              to={item.path}
              selected={selected}
              onClick={() => setMobileOpen(false)}
              sx={{
                minHeight: 43,
                mb: 0.5,
                px: 1.5,
                borderRadius: 1.5,
                color: COLORS.text,
                position: 'relative',

                '&:hover': {
                  bgcolor: '#F3F8FA'
                },

                '&.Mui-selected': {
                  bgcolor: COLORS.cyanLight,
                  color: COLORS.text
                },

                '&.Mui-selected:hover': {
                  bgcolor: COLORS.cyanLight
                },

                '&.Mui-selected::after': {
                  content: '""',
                  position: 'absolute',
                  right: 9,
                  top: '25%',
                  height: '50%',
                  width: 3,
                  borderRadius: 2,
                  bgcolor: COLORS.cyan
                }
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 34,
                  color: selected
                    ? COLORS.text
                    : COLORS.muted,
                  fontSize: 17
                }}
              >
                {item.icon}
              </ListItemIcon>

              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  fontSize: 13,
                  fontWeight: selected ? 700 : 500
                }}
              />
            </ListItemButton>
          );
        })}
      </List>

      {/* USER PROFILE FOOTER */}
      <Divider sx={{ borderColor: COLORS.border }} />

      <Stack
        direction="row"
        alignItems="center"
        spacing={1.2}
        sx={{
          px: 2,
          py: 2
        }}
      >
        <Avatar
          sx={{
            width: 34,
            height: 34,
            bgcolor: COLORS.cyanLight,
            color: COLORS.text,
            fontSize: 11,
            fontWeight: 700
          }}
        >
          {getInitials(fullName)}
        </Avatar>

        <Box
          sx={{
            minWidth: 0,
            flexGrow: 1
          }}
        >
          <Typography
            fontSize={12}
            fontWeight={700}
            color={COLORS.text}
            noWrap
          >
            {fullName}
          </Typography>

          <Typography
            fontSize={10}
            color={COLORS.muted}
            noWrap
          >
            {roleName}
          </Typography>
        </Box>

        <Tooltip title="Log out">
          <IconButton
            size="small"
            onClick={handleLogout}
            aria-label="Log out"
            sx={{
              color: COLORS.text
            }}
          >
            <LogoutOutlined />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );

  // ==========================================
  // MAIN LAYOUT
  // ==========================================

  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100vh',
        bgcolor: COLORS.background
      }}
    >
      {/* DESKTOP SIDEBAR */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: DRAWER_WIDTH,
          flexShrink: 0,

          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: `1px solid ${COLORS.border}`,
            bgcolor: COLORS.sidebar
          }
        }}
      >
        {sidebarContent}
      </Drawer>

      {/* MOBILE SIDEBAR */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{
          keepMounted: true
        }}
        sx={{
          display: { xs: 'block', md: 'none' },

          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            bgcolor: COLORS.sidebar
          }
        }}
      >
        {sidebarContent}
      </Drawer>

      {/* RIGHT CONTENT AREA */}
      <Box
        sx={{
          flexGrow: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* TOP HEADER */}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            height: HEADER_HEIGHT,
            bgcolor: '#FFFFFF',
            color: COLORS.text,
            borderBottom: `1px solid ${COLORS.border}`,
            zIndex: 1100
          }}
        >
          <Toolbar
            sx={{
              minHeight: `${HEADER_HEIGHT}px !important`,
              px: { xs: 2, md: 3 }
            }}
          >
            {/* MOBILE MENU */}
            <IconButton
              onClick={() => setMobileOpen(true)}
              sx={{
                display: { xs: 'inline-flex', md: 'none' },
                mr: 1,
                color: COLORS.text
              }}
              aria-label="Open navigation"
            >
              <MenuOutlined />
            </IconButton>

            {/* BREADCRUMB */}
            <Breadcrumbs
              separator="/"
              sx={{
                flexGrow: 1,
                '& .MuiBreadcrumbs-separator': {
                  mx: 1,
                  color: COLORS.muted
                }
              }}
            >
              <Typography
                fontSize={12}
                color={COLORS.muted}
              >
                {roleName}
              </Typography>

              <Typography
                fontSize={12}
                fontWeight={600}
                color={COLORS.text}
              >
                {currentPage}
              </Typography>
            </Breadcrumbs>

            {/* HEADER ACTIONS */}
            <Stack
              direction="row"
              alignItems="center"
              spacing={1.5}
            >
              <Typography
                sx={{
                  display: { xs: 'none', sm: 'block' },
                  fontSize: 11,
                  color: COLORS.muted
                }}
              >
                {currentDate}
              </Typography>

              {/* NOTIFICATION ICON - UI ONLY */}
              <Tooltip title="Notifications">
                <Box
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    color: COLORS.text
                  }}
                >
                  <BellOutlined style={{ fontSize: 17 }} />
                </Box>
              </Tooltip>

              {/* USER AVATAR */}
              <Tooltip title={`${fullName} - ${roleName}`}>
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: COLORS.cyanLight,
                    color: COLORS.text,
                    fontSize: 11,
                    fontWeight: 700
                  }}
                >
                  {getInitials(fullName)}
                </Avatar>
              </Tooltip>
            </Stack>
          </Toolbar>
        </AppBar>

        {/* MAIN CONTENT */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            width: '100%',
            minWidth: 0,
            px: { xs: 2, md: 3.5 },
            py: { xs: 3, md: 3.5 },
            bgcolor: COLORS.background
          }}
        >
          {error && (
            <Alert
              severity="error"
              onClose={() => setError('')}
              sx={{ mb: 2 }}
            >
              {error}
            </Alert>
          )}

          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
