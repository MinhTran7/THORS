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

const SIDEBAR_WIDTH = 256;

// Màu theo trang Đăng nhập
const ACCENT = brand.cyan;
const HOVER_BG = 'rgba(168, 241, 248, 0.32)';

const textProps = { fontSize: 14, fontWeight: 'inherit', noWrap: true };
const iconBoxSx = {
  width: 24,
  minWidth: 0,
  mr: 1.25,
  display: 'grid',
  placeItems: 'center',
  color: 'inherit',
  fontSize: 16
};
const itemSx = {
  minHeight: 42,
  px: 1.25,
  mb: 0.25,
  borderRadius: '10px',
  color: brand.ink,
  fontWeight: 500,
  transition: 'background-color .2s, color .2s',
  '&:hover': { bgcolor: HOVER_BG, color: brand.ink }
};
// Mục đang chọn: nền xanh ngọc nhạt
const SELECT_MAIN = '#48EFFE';
const SELECT_BG = 'rgba(72, 239, 254, 0.2)';
const selectedSx = {
  '&.Mui-selected, &.Mui-selected:hover': { bgcolor: SELECT_BG, color: brand.ink, fontWeight: 600 },
  '&.Mui-selected .nav-icon': { color: '#2BDDF0' }
};

const navListSx = {
  px: 1.5,
  pt: 0.5,
  flexGrow: 1,
  overflowY: 'auto',
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
  '&::-webkit-scrollbar': { display: 'none' }
};

// Menu sổ xuống: đường dọc xám thẳng hàng với icon mục cha
const childListSx = { ml: '22px', pl: 1, mb: 0.5, borderLeft: `2px solid ${brand.line}` };

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
        // Mục con: chữ xám, đậm lên khi được chọn
        ...(nested && {
          minHeight: 40,
          position: 'relative',
          color: brand.muted,
          // Vạch xanh bo tròn cạnh mục đang chọn
          '&.Mui-selected::before': {
            content: '""',
            position: 'absolute',
            left: -11,
            top: 8,
            bottom: 8,
            width: 4,
            borderRadius: 2,
            bgcolor: SELECT_MAIN
          }
        })
      }}
    >
      <ListItemIcon className="nav-icon" sx={iconBoxSx}>
        {item.icon}
      </ListItemIcon>
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
      // Đăng xuất xong về trang chủ cửa hàng (giao diện khách chưa đăng nhập)
      navigate('/', { replace: true });
    } catch (e) {
      setError(e.message);
    }
  }

  const isSelected = (to) => location.pathname === to || location.pathname.startsWith(`${to}/`);

  const activeChildTo = (children) =>
    children.reduce((best, c) => (isSelected(c.to) && c.to.length > (best?.length ?? 0) ? c.to : best), null);
  const closeMobile = () => setMobile(false);

  const sidebar = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#FFFFFF', overflow: 'hidden' }}>

      {/* Logo giống trang Đăng nhập và màn khách hàng */}
      <Stack
        component={Link}
        to="/workspace"
        aria-label={`${STORE_NAME} — Dashboard`}
        direction="row"
        alignItems="center"
        spacing={1.25}
        sx={{ px: 2.75, pt: 3, pb: 2.5, mb: 1.5, borderBottom: `1px solid ${brand.yellowLine}`, color: brand.ink, textDecoration: 'none' }}
      >
        <ThorsMark height={34} />
        <Box>
          <Typography component="span" sx={{ display: 'block', color: brand.ink, fontSize: 22, fontWeight: 800, letterSpacing: '3px', lineHeight: 1 }}>
            {STORE_NAME}
          </Typography>
          <Typography component="span" sx={{ display: 'block', color: brand.pink, fontSize: 10, fontWeight: 700, mt: 0.5 }}>
            TH Omnichannel Retail System
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
          return (
            <Box key={item.label}>
              <ListItemButton onClick={() => setOpenSubmenus((prev) => ({ ...prev, [item.label]: !isOpen }))} sx={itemSx}>
                <ListItemIcon className="nav-icon" sx={iconBoxSx}>
                  {item.icon}
                </ListItemIcon>
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

      {/* Thẻ người dùng: nền trong suốt theo nền sidebar, bấm để mở hồ sơ */}
      <Stack
        component={Link}
        to="/profile"
        onClick={closeMobile}
        direction="row"
        alignItems="center"
        spacing={1.25}
        sx={{
          // Thẻ người dùng: hình chữ nhật khớp đáy sidebar
          px: 2,
          py: 1.5,
          bgcolor: 'transparent',
          borderTop: `1px solid ${brand.yellowLine}`,
          textDecoration: 'none',
          transition: 'box-shadow .2s',
          '&:hover': { boxShadow: '0 10px 22px -16px rgba(31, 41, 55, 0.5)' },
          '&:focus-visible': { outline: `2px solid ${brand.teal}`, outlineOffset: 2 }
        }}
      >
        <Box sx={{ borderRadius: '50%', p: '2px', bgcolor: '#FFFFFF', boxShadow: `0 0 0 2px ${ACCENT}`, display: 'flex' }}>
          <UserAvatar name={account.fullName} src={account.avatarUrl} size={34} />
        </Box>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="subtitle2" noWrap sx={{ color: brand.ink, fontWeight: 700 }}>
            {account.fullName}
          </Typography>

          {account.role !== 'CUSTOMER' && (
            <Typography variant="caption" noWrap sx={{ color: brand.pink, fontWeight: 700, display: 'block' }}>
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
            alignSelf: 'flex-start',
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflow: 'hidden',
            // Sidebar chiếm hết chiều dọc, không bo góc
            borderRight: `1px solid ${brand.cardLine}`
          }}
        >
          {sidebar}
        </Box>
        <Drawer
          variant="temporary"
          open={mobile}
          onClose={() => setMobile(false)}
          sx={{ display: { md: 'none' }, '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, borderRadius: 0, border: 0 } }}
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
