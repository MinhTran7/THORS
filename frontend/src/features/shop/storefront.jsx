import { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Box, Menu, MenuItem } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import { STORE_NAME } from 'features/account/constants';
import { api } from 'services/http';

/**
 * Phần giao diện cửa hàng dùng chung (tách từ ShopPage): màu, font, kiểu nút, header và footer.
 * Trang chủ shop và các trang của khách nằm trong StorefrontLayout (vd. đơn hàng) cùng dùng file này.
 */

const FONT_URL =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Be+Vietnam+Pro:wght@400;500;600&display=swap';

/* ---------- Màu & style dùng chung ---------- */

export const C = { ink: '#111111', accent: '#8A2B2B', line: '#E6E3DE', sand: '#EFEBE5', muted: '#5C5650', photo: '#EEEAE4' };
export const SANS = "'Be Vietnam Pro', system-ui, sans-serif";
export const SERIF = "'Playfair Display', Georgia, serif";

export const focusRing = { '&:focus-visible': { outline: `2px solid ${C.accent}`, outlineOffset: '2px' } };
export const container = { maxWidth: 1320, mx: 'auto', px: { xs: '16px', sm: '40px' }, boxSizing: 'border-box' };
export const section = { ...container, pt: { xs: '64px', sm: '96px' } };
export const linkSx = { color: C.ink, textDecoration: 'none', cursor: 'pointer', '&:hover': { color: C.accent }, ...focusRing };
export const h2Sx = { m: 0, fontFamily: SERIF, fontWeight: 400, fontSize: { xs: 32, sm: 40 } };
export const eyebrowSx = { m: 0, fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase' };
export const srOnly = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap'
};
export const iconBtnSx = {
  width: 44,
  height: 44,
  p: 0,
  border: 0,
  bgcolor: 'transparent',
  color: C.ink,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textDecoration: 'none',
  fontFamily: 'inherit',
  '&:hover': { color: C.accent },
  ...focusRing
};
export const btnSx = (variant) => ({
  display: 'inline-block',
  boxSizing: 'border-box',
  minHeight: 44,
  px: '32px',
  py: '16px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: '0.06em',
  lineHeight: 1,
  textDecoration: 'none',
  cursor: 'pointer',
  border: `1px solid ${variant === 'light' ? '#FFFFFF' : C.ink}`,
  bgcolor: variant === 'dark' ? C.ink : '#FFFFFF',
  color: variant === 'dark' ? '#FFFFFF' : C.ink,
  transition: 'opacity .2s',
  '&:hover': { opacity: 0.85, color: variant === 'dark' ? '#FFFFFF' : C.ink },
  '&:disabled': { opacity: 0.6, cursor: 'default' },
  ...focusRing
});

export const scrollToId = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
// Link neo trong trang: chặn nhảy mặc định, chạy hành động riêng
export const anchor = (fn) => (e) => {
  e.preventDefault();
  fn();
};

// Nạp font một lần khi mở trang
export function useStoreFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_URL}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_URL;
    document.head.appendChild(link);
  }, []);
}

/* ---------- Icon & ảnh ---------- */

export function Icon({ children, size = 20, strokeWidth = 1.6 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
      {children}
    </svg>
  );
}

/* ---------- Giỏ hàng ---------- */

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

/* ---------- Header ---------- */

// onScrollTo: nhảy tới một khối của trang chủ ('moi', 'uu-dai'). Ở trang khác thì truyền hàm chuyển về trang chủ.
export function StoreHeader({ account, categories, query, onSearch, onPickCategory, onScrollTo = scrollToId }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
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
    onSearch(input.trim());
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
          <Box component="a" href="#moi" onClick={anchor(() => onScrollTo('moi'))} sx={linkSx}>
            Hàng mới
          </Box>
          {categories.slice(0, 4).map((c) => (
            <Box key={c.categoryId} component="a" href="#tat-ca" onClick={anchor(() => onPickCategory(c.categoryId))} sx={linkSx}>
              {c.categoryName}
            </Box>
          ))}
          <Box component="a" href="#uu-dai" onClick={anchor(() => onScrollTo('uu-dai'))} sx={{ ...linkSx, color: C.accent }}>
            Sale
          </Box>
        </Box>

        <Box
          component={RouterLink}
          to="/"
          onClick={() => onSearch('')}
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

export function StoreFooter({ categories, onPickCategory, onScrollTo = scrollToId }) {
  return (
    <Box component="footer" sx={{ bgcolor: C.ink, color: '#D9D6D0' }}>
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
            <Box component="a" href="#moi" onClick={anchor(() => onScrollTo('moi'))} sx={footerLinkSx}>
              Hàng mới
            </Box>
            {categories.slice(0, 4).map((c) => (
              <Box key={c.categoryId} component="a" href="#tat-ca" onClick={anchor(() => onPickCategory(c.categoryId))} sx={footerLinkSx}>
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
