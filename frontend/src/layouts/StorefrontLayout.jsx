import { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Menu, MenuItem } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { useAuth } from 'features/auth/AuthProvider';
import { STORE_NAME } from 'features/account/constants';
import { api } from 'services/http';
import StoreNotificationBell from 'features/notification/StoreNotificationBell';
import { ThorsLogo } from 'features/auth/components/ShopAuthArt';
import { C, FONT_URL, RADIUS, SANS, Icon, btnSx, container, focusRing, iconBtnSx, linkSx, srOnly } from 'features/shop/storeTheme';

/**
 * Khung giao diện cửa hàng cho khách: thanh thông báo + header + footer kiểu thời trang tối giản.
 * Dùng cho trang chủ, chi tiết sản phẩm, giỏ hàng, đặt hàng, đặt hàng thành công (xem OptionalLayout).
 * Nội dung trang nằm ở <Outlet />.
 */

// Nạp font một lần
function useStoreFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_URL}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_URL;
    document.head.appendChild(link);
  }, []);
}

// Đổi màu chính (nút, link MUI) sang đen và font sang Be Vietnam Pro cho các trang bên trong
function storeTheme(outer) {
  if (!outer?.palette || !outer?.typography) return outer;
  const typography = Object.fromEntries(
    Object.entries(outer.typography).map(([key, value]) => [
      key,
      value && typeof value === 'object' && 'fontFamily' in value ? { ...value, fontFamily: SANS } : value
    ])
  );
  return {
    ...outer,
    // Màu chính = xanh ngọc như link trên trang đăng nhập (nút đặc được tô xanh nhạt ở StorefrontLayout bên dưới)
    palette: { ...outer.palette, primary: { ...outer.palette.primary, main: C.teal, light: C.cyan, dark: '#158A98', contrastText: '#FFFFFF' } },
    typography: { ...typography, fontFamily: SANS }
  };
}

function useCartCount(enabled) {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const data = await api('/cart');
      setCount((data.items || []).length);
    } catch {
      // Không lấy được giỏ hàng thì giữ nguyên số hiện tại
    }
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    window.addEventListener('thors:cart-changed', refresh);
    return () => window.removeEventListener('thors:cart-changed', refresh);
  }, [enabled, refresh]);
  return enabled ? count : 0;
}

function StoreHeader({ categories }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const { account, logout } = useAuth();
  const query = pathname === '/' ? params.get('q') || '' : '';
  const isCustomer = account?.role === 'CUSTOMER';
  const cartCount = useCartCount(isCustomer);
  const [searchOpen, setSearchOpen] = useState(Boolean(query));
  const [input, setInput] = useState(query);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => setInput(query), [query]);
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const submit = (e) => {
    e.preventDefault();
    const text = input.trim();
    navigate(text ? `/?q=${encodeURIComponent(text)}` : '/');
  };

  const go = (to) => {
    setMenuAnchor(null);
    navigate(to);
  };

  const signOut = async () => {
    setMenuAnchor(null);
    try {
      await logout();
    } finally {
      navigate('/', { replace: true });
    }
  };

  const menuItems = isCustomer
    ? [
        ['/profile', 'Tài khoản của tôi'],
        ['/orders', 'Đơn hàng'],
        ['/addresses', 'Địa chỉ giao hàng'],
        ['/notifications', 'Thông báo']
      ]
    : [
        ['/workspace', 'Trang quản lý'],
        ['/profile', 'Tài khoản']
      ];

  return (
    <Box component="header" sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: C.cream, borderBottom: '1px solid #F2EBD3' }}>
      <Box sx={{ ...container, py: '18px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box
          component="nav"
          aria-label="Danh mục chính"
          sx={{
            display: 'flex',
            gap: { xs: 2, sm: '28px' },
            fontSize: 14,
            fontWeight: 500,
            flex: { xs: '1 1 100%', md: '1 1 360px' },
            order: { xs: 3, md: 0 },
            flexWrap: { xs: 'nowrap', md: 'wrap' },
            overflowX: { xs: 'auto', md: 'visible' },
            whiteSpace: 'nowrap'
          }}
        >
          <Box component={RouterLink} to="/#tat-ca" sx={linkSx}>
            Hàng mới
          </Box>
          {categories.slice(0, 4).map((c) => (
            <Box key={c.categoryId} component={RouterLink} to={`/?category=${c.categoryId}#tat-ca`} sx={linkSx}>
              {c.categoryName}
            </Box>
          ))}
          <Box component={RouterLink} to="/#uu-dai" sx={{ ...linkSx, color: C.accent, fontWeight: 700 }}>
            Sale
          </Box>
        </Box>

        {/* Logo giống trang đăng nhập */}
        <Box
          component={RouterLink}
          to="/"
          aria-label={`${STORE_NAME} — Trang chủ`}
          sx={{ ...linkSx, display: 'inline-flex', alignItems: 'center', gap: 1.25, fontSize: { xs: 20, sm: 24 }, fontWeight: 700, letterSpacing: '3px', flex: '0 0 auto', '&:hover': { color: C.ink } }}
        >
          <ThorsLogo size={34} />
          <span>{STORE_NAME.toUpperCase()}</span>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', alignItems: 'center', flex: { xs: '0 0 auto', md: '1 1 200px' } }}>
          <Box component="button" type="button" aria-label="Tìm kiếm" aria-expanded={searchOpen} onClick={() => setSearchOpen((v) => !v)} sx={iconBtnSx}>
            <Icon>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </Icon>
          </Box>

          {isCustomer && <StoreNotificationBell />}

          {account ? (
            <>
              <Box
                component="button"
                type="button"
                aria-label="Tài khoản"
                aria-haspopup="menu"
                aria-expanded={Boolean(menuAnchor)}
                onClick={(e) => setMenuAnchor(e.currentTarget)}
                sx={iconBtnSx}
              >
                <Icon>
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
                </Icon>
              </Box>
              <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
                {menuItems.map(([to, label]) => (
                  <MenuItem key={to} onClick={() => go(to)}>
                    {label}
                  </MenuItem>
                ))}
                <MenuItem onClick={signOut}>Đăng xuất</MenuItem>
              </Menu>
            </>
          ) : (
            <Box component={RouterLink} to="/login" sx={{ ...linkSx, display: 'flex', alignItems: 'center', height: 44, px: 1, fontSize: 14, fontWeight: 500 }}>
              Đăng nhập
            </Box>
          )}

          {(isCustomer || !account) && (
            <Box
              component={RouterLink}
              // Chưa đăng nhập: đăng nhập xong vào thẳng giỏ hàng
              to={isCustomer ? '/cart' : `/login?returnTo=${encodeURIComponent('/cart')}`}
              aria-label={isCustomer ? `Giỏ hàng, ${cartCount} sản phẩm` : 'Đăng nhập để xem giỏ hàng'}
              sx={{ ...iconBtnSx, width: 'auto', gap: '6px', fontSize: 14 }}
            >
              <Icon>
                <path d="M5 8h14l-1 12H6L5 8z" />
                <path d="M9 8V6a3 3 0 0 1 6 0v2" />
              </Icon>
              ({cartCount})
            </Box>
          )}
        </Box>
      </Box>

      {searchOpen && (
        <Box sx={{ borderTop: `1px solid ${C.line}`, py: '14px' }}>
          <Box component="form" role="search" onSubmit={submit} sx={{ ...container, display: 'flex', position: 'relative' }}>
            <Box component="label" htmlFor="shop-search" sx={srOnly}>
              Tìm sản phẩm
            </Box>
            <Box
              component="input"
              id="shop-search"
              ref={searchRef}
              type="search"
              placeholder="Tìm sản phẩm..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              sx={{
                flex: 1,
                minWidth: 0,
                height: 48,
                border: `1.5px solid ${C.line}`,
                borderRadius: RADIUS.box,
                bgcolor: '#FAFDFD',
                px: 2,
                mr: 1,
                font: 'inherit',
                fontSize: 15,
                outline: 0,
                '&:focus': { borderColor: C.cyan }
              }}
            />
            <Box component="button" type="submit" sx={{ ...btnSx('dark'), py: 0, height: 48, px: '28px' }}>
              TÌM
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

const footerLinkSx = { color: '#D9D6D0', textDecoration: 'none', '&:hover': { color: '#FFFFFF' }, ...focusRing };
const footerColSx = { flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: 1.25, fontSize: 14 };
const footerTitleSx = { color: '#FFFFFF', fontWeight: 600, mb: 0.5 };

function StoreFooter({ categories }) {
  return (
    <Box component="footer" sx={{ bgcolor: C.ink, color: '#D9D6D0', mt: 'auto' }}>
      <Box sx={{ ...container, pt: 9, pb: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          <Box sx={{ flex: '2 1 280px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Box sx={{ fontSize: 24, fontWeight: 700, letterSpacing: '3px', color: '#FFFFFF' }}>{STORE_NAME.toUpperCase()}</Box>
            <Box component="p" sx={{ m: 0, fontSize: 14, lineHeight: 1.7, maxWidth: 320 }}>
              Thời trang tối giản, chất liệu bền đẹp — giao tận nhà.
            </Box>
          </Box>
          <Box component="nav" aria-label="Mua sắm" sx={footerColSx}>
            <Box sx={footerTitleSx}>Mua sắm</Box>
            <Box component={RouterLink} to="/#tat-ca" sx={footerLinkSx}>
              Hàng mới
            </Box>
            {categories.slice(0, 4).map((c) => (
              <Box key={c.categoryId} component={RouterLink} to={`/?category=${c.categoryId}#tat-ca`} sx={footerLinkSx}>
                {c.categoryName}
              </Box>
            ))}
          </Box>
        </Box>
        <Box
          sx={{ borderTop: '1px solid #3A3A3A', pt: 3, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 1.5, fontSize: 13, color: '#B5B1AA' }}
        >
          <span>
            © {new Date().getFullYear()} {STORE_NAME}. Bảo lưu mọi quyền.
          </span>
          <span>Điều khoản · Chính sách bảo mật</span>
        </Box>
      </Box>
    </Box>
  );
}

export default function StorefrontLayout() {
  useStoreFonts();
  const { pathname } = useLocation();
  const [categories, setCategories] = useState([]);
  // Trang chủ và chi tiết sản phẩm tự canh lề; các trang khác (giỏ hàng, đặt hàng...) được bọc khung có lề
  const fullBleed = pathname === '/' || pathname.startsWith('/shop/');

  useEffect(() => {
    api('/shop/categories')
      .then((d) => setCategories(d.items || []))
      .catch(() => setCategories([]));
  }, []);

  // Sang trang khác thì cuộn lên đầu (link có #... do trang chủ tự cuộn)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <Box
      sx={{
        fontFamily: SANS,
        color: C.ink,
        bgcolor: C.cream,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        // Nút MUI bên trong giống nút trên trang đăng nhập: bo 14px, nút chính xanh ngọc nhạt, nút phụ viền nhạt
        '& .MuiButton-root': { borderRadius: RADIUS.box, boxShadow: 'none', textTransform: 'none', fontWeight: 700 },
        '& .MuiButton-root:hover': { boxShadow: 'none' },
        '& .MuiButton-contained': { bgcolor: C.cyan, color: C.cyanInk, fontWeight: 800, '&:hover': { bgcolor: '#8FE6EF' } },
        '& .MuiButton-contained.Mui-disabled': { bgcolor: '#E5E7EB', color: '#9CA3AF' },
        '& .MuiButton-outlined': { borderWidth: '1.5px', borderColor: C.line, color: '#374151', '&:hover': { borderWidth: '1.5px', borderColor: C.cyan, bgcolor: '#FAFDFD' } },
        '& .MuiButton-text': { color: C.teal },
        '& .MuiOutlinedInput-root': { borderRadius: RADIUS.box },
        // Tiêu đề đậm như "Đăng nhập"
        '& main h1, & main h2': { fontWeight: '800 !important', letterSpacing: '-0.5px' }
      }}
    >
      <Box sx={{ bgcolor: C.ink, color: '#FFFFFF', fontSize: 13, letterSpacing: '0.04em', textAlign: 'center', py: '11px', px: 2 }}>
        Giao hàng toàn quốc — Thanh toán khi nhận hàng hoặc chuyển khoản
      </Box>
      <StoreHeader categories={categories} />

      <Box component="main" sx={{ flex: 1, bgcolor: C.cream }}>
        <ThemeProvider theme={storeTheme}>
          {fullBleed ? (
            <Outlet context={{ categories }} />
          ) : (
            <Box sx={{ ...container, py: { xs: 3, md: 5 } }}>
              <Outlet context={{ categories }} />
            </Box>
          )}
        </ThemeProvider>
      </Box>

      <StoreFooter categories={categories} />
    </Box>
  );
}
