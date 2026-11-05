import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Collapse,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography
} from '@mui/material';
import { Stack } from 'features/account/components/Flex';
import { DownOutlined } from '@ant-design/icons';
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

const ACCENT = '#8EECF5';
const ACCENT_SOFT = '#D9F8FB';
const HOVER_BG = '#F2FCFD';

const textProps = { fontSize: 14, fontWeight: 'inherit', noWrap: true };
const itemSx = {
  minHeight: 42,
  px: 1.5,
  mb: 0.5,
  borderRadius: '12px',
  color: brand.muted,
  fontWeight: 500,
  '&:hover': { bgcolor: HOVER_BG, color: brand.ink }
};
const selectedSx = {
  '&.Mui-selected, &.Mui-selected:hover': { bgcolor: ACCENT_SOFT, color: brand.ink, fontWeight: 600 }
};

const navListSx = {
  px: 1.5,
  flexGrow: 1,
  overflowY: 'auto',
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
  '&::-webkit-scrollbar': { display: 'none' }
};

const childListSx = { ml: 2.75, pl: 1.25, mb: 0.5, borderLeft: `1.5px solid ${brand.line}` };

function NavLink({ item, selected, nested = false, onClick }) {
  return (
    <ListItemButton
      component={Link}
      to={item.to}
      selected={selected}
      onClick={onClick}
      sx={{
        ...itemSx,
        ...selectedSx,
        ...(nested && {
          minHeight: 38,
          position: 'relative',
          // Vạch nhấn đè lên đường kẻ dọc ở mục con đang chọn
          '&.Mui-selected::before': {
            content: '""',
            position: 'absolute',
            left: -12,
            top: 9,
            bottom: 9,
            width: 3,
            borderRadius: 3,
            bgcolor: ACCENT
          }
        })
      }}
    >
      <ListItemIcon sx={{ color: 'inherit', minWidth: nested ? 30 : 34, fontSize: nested ? 15 : 17 }}>{item.icon}</ListItemIcon>
      <ListItemText primary={item.label} primaryTypographyProps={textProps} />
    </ListItemButton>
  );
}

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

  const activeChildTo = (children) =>
    children.reduce((best, c) => (isSelected(c.to) && c.to.length > (best?.length ?? 0) ? c.to : best), null);
  const closeMobile = () => setMobile(false);

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

      <List component="nav" aria-label="Menu chính" sx={navListSx}>
        {items.map((item) => {
          if (!item.children) {
            return <NavLink key={item.to} item={item} selected={isSelected(item.to)} onClick={closeMobile} />;
          }

          const activeTo = activeChildTo(item.children);
          const isOpen = openSubmenus[item.label] ?? Boolean(activeTo);
          const highlight = isOpen || Boolean(activeTo);
          return (
            <Box key={item.label}>
              <ListItemButton
                onClick={() => setOpenSubmenus((prev) => ({ ...prev, [item.label]: !isOpen }))}
                sx={{ ...itemSx, ...(highlight && { color: brand.ink, fontWeight: 600 }) }}
              >
                <ListItemIcon sx={{ color: 'inherit', minWidth: 34, fontSize: 17 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} primaryTypographyProps={textProps} />
                <DownOutlined
                  style={{ fontSize: 10, color: brand.muted, transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}
                />
              </ListItemButton>

              <Collapse in={isOpen} timeout="auto" unmountOnExit>
                <List component="div" disablePadding sx={childListSx}>
                  {item.children.map((child) => (
                    <NavLink key={child.to} item={child} nested selected={child.to === activeTo} onClick={closeMobile} />
                  ))}
                </List>
              </Collapse>
            </Box>
          );
        })}
      </List>

      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ p: 2, borderTop: `1px solid ${brand.line}` }}>
        <UserAvatar name={account.fullName} src={account.avatarUrl} size={36} />
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="subtitle2" noWrap sx={{ color: brand.ink }}>
            {account.fullName}
          </Typography>

          {account.role !== 'CUSTOMER' && (
            <Typography variant="caption" noWrap sx={{ color: brand.muted, display: 'block' }}>
              {ROLE_LABEL[account.role] ?? account.role}
            </Typography>
          )}
        </Box>
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
