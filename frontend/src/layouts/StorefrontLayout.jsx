import { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Menu, MenuItem } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { useAuth } from 'features/auth/AuthProvider';
import { STORE_NAME } from 'features/account/constants';
import { api } from 'services/http';
import { C, FONT_URL, SANS, SERIF, Icon, btnSx, container, focusRing, iconBtnSx, linkSx, srOnly } from 'features/shop/storeTheme';

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
    palette: {
      ...outer.palette,
      primary: { ...outer.palette.primary, main: C.ink, light: '#3A3A3A', dark: '#000000', contrastText: '#FFFFFF' }
    },
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

// 3 menu xổ xuống trên header (kiểu Santino). Mỗi menu: link "Tất cả ...", các danh mục, lối tắt bên phải.
const MEGA_MENUS = [
  {
    key: 'products',
    label: 'Sản phẩm',
    allLabel: 'Tất cả sản phẩm',
    allTo: '/shop/category/all',
    categoryTo: (id) => `/shop/category/${id}`
  },
  {
    key: 'new',
    label: 'Hàng mới',
    allLabel: 'Tất cả hàng mới về',
    allTo: '/shop/new-arrivals',
    categoryTo: (id) => `/shop/new-arrivals?category=${id}`
  },
  {
    key: 'sale',
    label: 'Sale',
    accent: true,
    allLabel: 'Tất cả hàng đang giảm giá',
    allTo: '/shop/sale',
    categoryTo: (id) => `/shop/sale?category=${id}`
  }
];

function MegaMenu({ menu, categories, open, onClose, onEnter, onLeave }) {
  if (!open || !menu) return null;
  const linkCol = { ...linkSx, fontSize: 16, fontWeight: 600, py: 0.75, display: 'block' };
  const badge = (bg) => ({
    display: 'inline-block',
    px: 2,
    py: 1,
    bgcolor: bg,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 700,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    '&:hover': { opacity: 0.85, color: '#FFFFFF' },
    ...focusRing
  });
  return (
    <Box
      id={`mega-${menu.key}`}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onEnter()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onLeave()}
      onClick={(e) => {
        if (e.target.closest('a')) onClose();
      }}
      sx={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        bgcolor: '#FFFFFF',
        borderTop: `1px solid ${C.line}`,
        boxShadow: '0 12px 24px rgba(0,0,0,.08)',
        zIndex: 30
      }}
    >
      <Box sx={{ ...container, py: { xs: 3, md: 5 }, display: 'flex', flexWrap: 'wrap', gap: { xs: 3, md: 6 } }}>
        <Box sx={{ flex: '1 1 480px', minWidth: 0 }}>
          <Box
            component={RouterLink}
            to={menu.allTo}
            sx={{ ...linkSx, display: 'inline-block', fontSize: 17, fontWeight: 600, color: C.muted, mb: 2 }}
          >
            {menu.allLabel}
          </Box>
          {/* Danh mục chia thành cột, mỗi cột tối đa 5 mục */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'none' },
              gridTemplateRows: { md: 'repeat(5, auto)' },
              gridAutoFlow: { xs: 'row', md: 'column' },
              gridAutoColumns: { md: '200px' },
              columnGap: 4
            }}
          >
            {categories.map((c) => (
              <Box key={c.categoryId} component={RouterLink} to={menu.categoryTo(c.categoryId)} sx={linkCol}>
                {c.categoryName}
              </Box>
            ))}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1.5 }}>
          <Box component={RouterLink} to="/shop/best-sellers" sx={badge(C.accent)}>
            Bán chạy
          </Box>
          <Box component={RouterLink} to="/shop/new-arrivals" sx={badge(C.ink)}>
            Hàng mới về
          </Box>
          <Box component={RouterLink} to="/shop/sale" sx={badge('#C62828')}>
            Sale off
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function StoreHeader({ categories }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const { account, logout } = useAuth();
  const query = pathname === '/shop/category/all' ? params.get('q') || '' : '';
  const isCustomer = account?.role === 'CUSTOMER';
  const cartCount = useCartCount(isCustomer);
  const [searchOpen, setSearchOpen] = useState(Boolean(query));
  const [input, setInput] = useState(query);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const searchRef = useRef(null);

  // Menu xổ xuống (Sản phẩm / Hàng mới / Sale): mở khi rê chuột hoặc bấm, đóng khi rời chuột, nhấn Esc hoặc chuyển trang
  const [openKey, setOpenKey] = useState(null);
  const closeTimer = useRef(null);
  const openMega = (key) => {
    clearTimeout(closeTimer.current);
    setOpenKey(key);
  };
  const leaveMega = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenKey(null), 150);
  };
  useEffect(() => setOpenKey(null), [pathname]);
  useEffect(() => {
    if (!openKey) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpenKey(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openKey]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => setInput(query), [query]);
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const submit = (e) => {
    e.preventDefault();
    const text = input.trim();
    navigate(text ? `/shop/category/all?q=${encodeURIComponent(text)}` : '/shop/category/all');
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
    <Box component="header" sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: '#FFFFFF', borderBottom: `1px solid ${C.line}` }}>
      <Box
        sx={{ ...container, py: '18px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
      >
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
          {MEGA_MENUS.map((m) => {
            const isOpen = openKey === m.key;
            const color = isOpen || m.accent ? C.accent : C.ink;
            return (
              <Box
                key={m.key}
                component="button"
                type="button"
                aria-expanded={isOpen}
                aria-controls={`mega-${m.key}`}
                onClick={() => setOpenKey((k) => (k === m.key ? null : m.key))}
                onPointerEnter={(e) => e.pointerType === 'mouse' && openMega(m.key)}
                onPointerLeave={(e) => e.pointerType === 'mouse' && leaveMega()}
                sx={{
                  ...linkSx,
                  p: 0,
                  border: 0,
                  bgcolor: 'transparent',
                  font: 'inherit',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  color,
                  textDecoration: isOpen ? 'underline' : 'none',
                  textUnderlineOffset: '6px'
                }}
              >
                {m.label}
                <Box component="span" sx={{ display: 'flex', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                  <Icon size={14}>
                    <path d="M6 9l6 6 6-6" />
                  </Icon>
                </Box>
              </Box>
            );
          })}
        </Box>

        <Box
          component={RouterLink}
          to="/"
          sx={{ ...linkSx, fontFamily: SERIF, fontSize: { xs: 22, sm: 30 }, letterSpacing: '0.12em', flex: '0 0 auto' }}
        >
          {STORE_NAME.toUpperCase()}
        </Box>

        <Box
          sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', alignItems: 'center', flex: { xs: '0 0 auto', md: '1 1 200px' } }}
        >
          <Box
            component="button"
            type="button"
            aria-label="Tìm kiếm"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
            sx={iconBtnSx}
          >
            <Icon>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </Icon>
          </Box>

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
            <Box
              component={RouterLink}
              to="/login"
              sx={{ ...linkSx, display: 'flex', alignItems: 'center', height: 44, px: 1, fontSize: 14, fontWeight: 500 }}
            >
              Đăng nhập
            </Box>
          )}

          {(isCustomer || !account) && (
            <Box
              component={RouterLink}
              to={isCustomer ? '/cart' : '/login'}
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

      <MegaMenu
        menu={MEGA_MENUS.find((m) => m.key === openKey)}
        categories={categories}
        open={Boolean(openKey)}
        onClose={() => setOpenKey(null)}
        onEnter={() => openMega(openKey)}
        onLeave={leaveMega}
      />

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
              sx={{ flex: 1, minWidth: 0, height: 48, border: `1px solid ${C.ink}`, px: 2, font: 'inherit', fontSize: 15, ...focusRing }}
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
            <Box sx={{ fontFamily: SERIF, fontSize: 26, letterSpacing: '0.12em', color: '#FFFFFF' }}>{STORE_NAME.toUpperCase()}</Box>
            <Box component="p" sx={{ m: 0, fontSize: 14, lineHeight: 1.7, maxWidth: 320 }}>
              Thời trang tối giản, chất liệu bền đẹp — giao tận nhà.
            </Box>
          </Box>
          <Box component="nav" aria-label="Mua sắm" sx={footerColSx}>
            <Box sx={footerTitleSx}>Mua sắm</Box>
            <Box component={RouterLink} to="/shop/new-arrivals" sx={footerLinkSx}>
              Hàng mới
            </Box>
            {categories.slice(0, 4).map((c) => (
              <Box key={c.categoryId} component={RouterLink} to={`/shop/category/${c.categoryId}`} sx={footerLinkSx}>
                {c.categoryName}
              </Box>
            ))}
          </Box>
          <Box component="nav" aria-label="Tài khoản" sx={footerColSx}>
            <Box sx={footerTitleSx}>Tài khoản</Box>
            {[
              ['/orders', 'Tra cứu đơn hàng'],
              ['/cart', 'Giỏ hàng'],
              ['/addresses', 'Địa chỉ giao hàng'],
              ['/profile', 'Thông tin cá nhân']
            ].map(([to, label]) => (
              <Box key={to} component={RouterLink} to={to} sx={footerLinkSx}>
                {label}
              </Box>
            ))}
          </Box>
        </Box>
        <Box
          sx={{
            borderTop: '1px solid #3A3A3A',
            pt: 3,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: 1.5,
            fontSize: 13,
            color: '#B5B1AA'
          }}
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
        bgcolor: '#FFFFFF',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        '& .MuiButton-root': { borderRadius: 0, boxShadow: 'none' }
      }}
    >
      <Box sx={{ bgcolor: C.ink, color: '#FFFFFF', fontSize: 13, letterSpacing: '0.04em', textAlign: 'center', py: '11px', px: 2 }}>
        Giao hàng toàn quốc — Thanh toán khi nhận hàng hoặc chuyển khoản
      </Box>
      <StoreHeader categories={categories} />

      <Box component="main" sx={{ flex: 1, bgcolor: fullBleed ? '#FFFFFF' : '#F7F5F2' }}>
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
