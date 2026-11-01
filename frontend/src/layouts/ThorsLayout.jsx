import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Collapse,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography
} from '@mui/material';
import { Stack } from 'features/account/components/Flex';
import { LogoutOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { useAuth } from 'features/auth/AuthProvider';
import { ROLE_LABEL, STORE_NAME } from 'features/account/constants';
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
  const [mobile, setMobile] = useState(false);
  const [error, setError] = useState('');
  const [crumbs, setCrumbs] = useState([]);
  const [openSubmenus, setOpenSubmenus] = useState({});
  // setCrumbs là hàm ổn định của useState nên context chỉ tạo một lần.
  const crumbContext = useMemo(() => ({ setCrumbs }), []);
  const items = navFor(account.role);

  async function signOut() {
    setError('');
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (e) {
      setError(e.message);
    }
  }

  const isSelected = (to) => location.pathname === to || location.pathname.startsWith(`${to}/`);

  const sidebar = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: brand.surface }}>
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ px: 3, py: 2.5 }}>
        <ThorsMark />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" sx={{ color: brand.ink, lineHeight: 1.2 }}>
            THORS
          </Typography>
          <Typography variant="caption" noWrap sx={{ color: brand.muted, display: 'block' }}>
            {STORE_NAME}
          </Typography>
        </Box>
      </Stack>

      <List component="nav" aria-label="Menu chính" sx={{ px: 1.5, flexGrow: 1, overflowY: 'auto' }}>
        {items.map((item) => {
          if (item.children) {
            const isChildActive = item.children.some(
              (c) => location.pathname === c.to || location.pathname.startsWith(`${c.to}/`)
            );
            const isOpen = openSubmenus[item.label] ?? isChildActive;

            return (
              <Box key={item.label}>
                <ListItemButton
                  onClick={() => setOpenSubmenus((prev) => ({ ...prev, [item.label]: !isOpen }))}
                  sx={{
                    borderRadius: '10px',
                    mb: 0.5,
                    color: isChildActive ? brand.ink : brand.muted,
                    bgcolor: 'transparent',
                    fontWeight: isChildActive ? 600 : 400,
                    '&:hover': { bgcolor: '#F6F8FA' }
                  }}
                >
                  <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 14, fontWeight: 'inherit' }} />
                  {isOpen ? (
                    <UpOutlined style={{ fontSize: 10, color: brand.muted }} />
                  ) : (
                    <DownOutlined style={{ fontSize: 10, color: brand.muted }} />
                  )}
                </ListItemButton>

                <Collapse in={isOpen} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding sx={{ pl: 1.5, mb: 0.5 }}>
                    {item.children.map((child) => {
                      const selected = child.to === '/in-store-sales'
                        ? location.pathname === '/in-store-sales'
                        : (location.pathname === child.to || location.pathname.startsWith(`${child.to}/`));
                      return (
                        <ListItemButton
                          key={child.to}
                          component={Link}
                          to={child.to}
                          selected={selected}
                          onClick={() => setMobile(false)}
                          sx={{
                            borderRadius: '10px',
                            mb: 0.5,
                            pl: 2,
                            color: brand.muted,
                            '&.Mui-selected, &.Mui-selected:hover': {
                              bgcolor: '#E8F8FA',
                              color: brand.ink,
                              fontWeight: 600,
                              '& .MuiListItemIcon-root': {
                                color: '#1677FF'
                              }
                            }
                          }}
                        >
                          {child.icon && (
                            <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>
                              {child.icon}
                            </ListItemIcon>
                          )}
                          <ListItemText primary={child.label} primaryTypographyProps={{ fontSize: 14, fontWeight: 'inherit' }} />
                        </ListItemButton>
                      );
                    })}
                  </List>
                </Collapse>
              </Box>
            );
          }

          const { to, label, icon } = item;
          return (
            <ListItemButton
              key={to}
              component={Link}
              to={to}
              selected={isSelected(to)}
              onClick={() => setMobile(false)}
              sx={{
                borderRadius: '10px',
                mb: 0.5,
                color: brand.muted,
                '&.Mui-selected, &.Mui-selected:hover': { bgcolor: '#E8F8FA', color: brand.ink, fontWeight: 600 }
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>{icon}</ListItemIcon>
              <ListItemText primary={label} primaryTypographyProps={{ fontSize: 14, fontWeight: 'inherit' }} />
            </ListItemButton>
          );
        })}
      </List>

      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ p: 2, borderTop: `1px solid ${brand.line}` }}>
        <UserAvatar name={account.fullName} src={account.avatarUrl} size={36} />
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="subtitle2" noWrap sx={{ color: brand.ink }}>
            {account.fullName}
          </Typography>
          {/* Khách hàng chỉ có một vai trò nên không cần hiện nhãn; các vai trò khác thì có phân biệt. */}
          {account.role !== 'CUSTOMER' && (
            <Typography variant="caption" noWrap sx={{ color: brand.muted, display: 'block' }}>
              {ROLE_LABEL[account.role] ?? account.role}
            </Typography>
          )}
        </Box>
        <Tooltip title="Đăng xuất">
          <IconButton aria-label="Đăng xuất" onClick={signOut}>
            <LogoutOutlined />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
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
          <AppHeader crumbs={crumbs} onOpenMenu={() => setMobile(true)} onSignOut={signOut} />
          <Box component="main" sx={{ px: { xs: 2, md: 4 }, py: 3, maxWidth: 1920, mx: 'auto', width: '100%', flexGrow: 1 }}>
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
