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
import { crumbsForPath } from './routeCrumbs';
import ThorsMark from './ThorsMark';

const SIDEBAR_WIDTH = 256;
const SIDEBAR_GAP = 12; // khoảng hở quanh sidebar nổi trên nền kem

// Màu theo trang Đăng nhập
const ACCENT = brand.cyan;
const HOVER_BG = 'rgba(168, 241, 248, 0.32)';
// Nền sidebar: trắng phía trên, ngả xanh ngọc rất nhạt phía dưới (giống tông form đăng nhập)
const SIDEBAR_BG = 'linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 40%, #F1FCFD 100%)';

const textProps = { fontSize: 14, fontWeight: 'inherit', noWrap: true };
const iconBoxSx = {
  width: 30,
  height: 30,
  minWidth: 0,
  mr: 1.25,
  borderRadius: '10px',
  display: 'grid',
  placeItems: 'center',
  color: 'inherit',
  fontSize: 16,
  transition: 'background-color .2s'
};
const itemSx = {
  minHeight: 44,
  px: 1,
  mb: 0.5,
  borderRadius: '14px',
  color: brand.muted,
  fontWeight: 600,
  transition: 'background-color .2s, color .2s',
  '&:hover': { bgcolor: HOVER_BG, color: brand.ink },
  '&:hover .nav-icon': { bgcolor: '#FFFFFF' }
};
// Mục đang chọn: viên xanh ngọc nhạt như nút "Đăng nhập", icon nằm trong ô trắng
const selectedSx = {
  '&.Mui-selected, &.Mui-selected:hover': {
    bgcolor: ACCENT,
    color: brand.inkOnCyan,
    fontWeight: 800,
    boxShadow: '0 8px 18px -12px rgba(14, 58, 65, 0.55)'
  },
  '&.Mui-selected .nav-icon': { bgcolor: '#FFFFFF' }
};

const navListSx = {
  position: 'relative', // nằm trên các đốm trang trí
  px: 1.5,
  pt: 0.5,
  flexGrow: 1,
  overflowY: 'auto',
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
  '&::-webkit-scrollbar': { display: 'none' }
};

const childListSx = { ml: 2.5, pl: 1.25, mb: 0.75, borderLeft: `2px dashed ${brand.cardLine}` };

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
          // Mục con đang chọn: nền nhạt hơn mục cha, chấm hồng trên đường kẻ dọc
          '&.Mui-selected, &.Mui-selected:hover': { bgcolor: '#E6F9FB', color: brand.ink, fontWeight: 700, boxShadow: 'none' },
          '&.Mui-selected::before': {
            content: '""',
            position: 'absolute',
            left: -15,
            top: '50%',
            width: 8,
            height: 8,
            mt: '-4px',
            borderRadius: '50%',
            bgcolor: brand.pink,
            boxShadow: '0 0 0 3px #FFFFFF'
          }
        })
      }}
    >
      <ListItemIcon className="nav-icon" sx={{ ...iconBoxSx, ...(nested && { width: 26, height: 26, fontSize: 14, mr: 1 }) }}>
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
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', background: SIDEBAR_BG, position: 'relative', overflow: 'hidden' }}>
      {/* Đốm hồng mờ trang trí, gợi tag hồng ở trang Đăng nhập */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          bottom: 60,
          left: -70,
          width: 170,
          height: 170,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(224, 85, 154, 0.10) 0%, rgba(224, 85, 154, 0) 70%)',
          pointerEvents: 'none'
        }}
      />

      {/* Logo giống trang Đăng nhập và màn khách hàng */}
      <Stack
        component={Link}
        to="/workspace"
        aria-label={`${STORE_NAME} — Dashboard`}
        direction="row"
        alignItems="center"
        spacing={1.25}
        sx={{ position: 'relative', px: 2.75, pt: 3, pb: 2.5, color: brand.ink, textDecoration: 'none' }}
      >
        <ThorsMark height={34} />
        <Box>
          <Typography component="span" sx={{ display: 'block', color: brand.ink, fontSize: 22, fontWeight: 800, letterSpacing: '3px', lineHeight: 1 }}>
            {STORE_NAME}
          </Typography>
          <Typography component="span" sx={{ display: 'block', color: brand.pink, fontSize: 11.5, fontWeight: 700, mt: 0.5 }}>
            Quản lý cửa hàng
          </Typography>
        </Box>
      </Stack>
      <Box aria-hidden sx={{ mx: 2.75, mb: 1.5, borderTop: `2px dashed ${brand.cardLine}` }} />

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
                sx={{
                  ...itemSx,
                  ...(highlight && { color: brand.ink, fontWeight: 700, '& .nav-icon': { bgcolor: '#FFFFFF', boxShadow: `0 0 0 1px ${brand.cardLine}` } })
                }}
              >
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

      {/* Thẻ người dùng: nền kem vàng như ô ghi chú, bấm để mở hồ sơ */}
      <Stack
        component={Link}
        to="/profile"
        onClick={closeMobile}
        direction="row"
        alignItems="center"
        spacing={1.25}
        sx={{
          position: 'relative',
          m: 1.5,
          p: 1.25,
          borderRadius: '18px',
          bgcolor: brand.yellowSoft,
          border: `1px solid ${brand.yellowLine}`,
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
            top: SIDEBAR_GAP,
            height: `calc(100vh - ${SIDEBAR_GAP * 2}px)`,
            ml: `${SIDEBAR_GAP}px`,
            my: `${SIDEBAR_GAP}px`,
            borderRadius: '26px',
            overflow: 'hidden',
            // Khung nổi giống thẻ form Đăng nhập
            boxShadow: `0 24px 50px -30px rgba(31, 41, 55, 0.3), 0 0 0 1px ${brand.cardLine}`
          }}
        >
          {sidebar}
        </Box>
        <Drawer
          variant="temporary"
          open={mobile}
          onClose={() => setMobile(false)}
          sx={{ display: { md: 'none' }, '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, borderRadius: '0 26px 26px 0', border: 0 } }}
        >
          {sidebar}
        </Drawer>
        <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <AppHeader crumbs={crumbs.length > 0 ? crumbs : crumbsForPath(location.pathname)}onOpenMenu={() => setMobile(true)} onSignOut={signOut} />
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
