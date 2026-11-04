import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Menu, MenuItem } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import { STORE_NAME } from 'features/account/constants';
import { api } from 'services/http';
import heroImage from 'assets/images/auth/boutique-shopping.png';
import { money, priceText } from './ShopCommon';
import PendingCartHandler from './PendingCartHandler';

/**
 * Trang chủ cửa hàng (đường dẫn '/') theo giao diện thời trang tối giản.
 * Toàn bộ style viết bằng sx của MUI, không dùng file CSS riêng.
 * Trang tự vẽ header + footer (OptionalLayout không bọc ThorsLayout ở '/').
 *  - Chưa tìm kiếm: Hero, danh mục, hàng mới về, ưu đãi, toàn bộ sản phẩm.
 *  - Đang tìm kiếm: chỉ hiện lưới kết quả.
 * Dữ liệu: /shop/categories, /shop/products, /shop/promotions, /cart (khách đã đăng nhập).
 */

const SORTS = [
  ['newest', 'Mới nhất'],
  ['price_asc', 'Giá thấp đến cao'],
  ['price_desc', 'Giá cao đến thấp']
];
const PAGE_SIZE = 20;
const NEW_COUNT = 8;
const TILE_COLORS = ['#E4DDD3', '#D9D6D0', '#E8E1D6', '#DCD3C8'];
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Be+Vietnam+Pro:wght@400;500;600&display=swap';

/* ---------- Màu & style dùng chung ---------- */

const C = { ink: '#111111', accent: '#8A2B2B', line: '#E6E3DE', sand: '#EFEBE5', muted: '#5C5650', photo: '#EEEAE4' };
const SANS = "'Be Vietnam Pro', system-ui, sans-serif";
const SERIF = "'Playfair Display', Georgia, serif";

const focusRing = { '&:focus-visible': { outline: `2px solid ${C.accent}`, outlineOffset: '2px' } };
const container = { maxWidth: 1320, mx: 'auto', px: { xs: '16px', sm: '40px' }, boxSizing: 'border-box' };
const section = { ...container, pt: { xs: '64px', sm: '96px' } };
const linkSx = { color: C.ink, textDecoration: 'none', cursor: 'pointer', '&:hover': { color: C.accent }, ...focusRing };
const h2Sx = { m: 0, fontFamily: SERIF, fontWeight: 400, fontSize: { xs: 32, sm: 40 } };
const eyebrowSx = { m: 0, fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase' };
const srOnly = { position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };
const iconBtnSx = {
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
const btnSx = (variant) => ({
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

const scrollToId = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
// Link neo trong trang: chặn nhảy mặc định, chạy hành động riêng
const anchor = (fn) => (e) => {
  e.preventDefault();
  fn();
};

// Nạp font một lần khi mở trang
function useStoreFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_URL}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_URL;
    document.head.appendChild(link);
  }, []);
}

/* ---------- Icon & ảnh ---------- */

function Icon({ children, size = 20, strokeWidth = 1.6 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
      {children}
    </svg>
  );
}

// Có ảnh thì hiện ảnh, không thì hiện chữ cái đầu
function ProductPhoto({ src, name, dark = false, zoomOnHover = false }) {
  return (
    <Box sx={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', bgcolor: dark ? '#3A1212' : C.photo }}>
      {src ? (
        <Box
          component="img"
          src={src}
          alt={name}
          loading="lazy"
          className={zoomOnHover ? 'zoom' : undefined}
          sx={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .4s ease' }}
        />
      ) : (
        <Box component="span" sx={{ fontFamily: SERIF, fontSize: 48, color: dark ? 'rgba(255,255,255,.35)' : 'rgba(17,17,17,.3)' }}>
          {name?.charAt(0)}
        </Box>
      )}
    </Box>
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

function StoreHeader({ account, categories, query, onSearch, onPickCategory }) {
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
          <Box component="a" href="#moi" onClick={anchor(() => scrollToId('moi'))} sx={linkSx}>
            Hàng mới
          </Box>
          {categories.slice(0, 4).map((c) => (
            <Box key={c.categoryId} component="a" href="#tat-ca" onClick={anchor(() => onPickCategory(c.categoryId))} sx={linkSx}>
              {c.categoryName}
            </Box>
          ))}
          <Box component="a" href="#uu-dai" onClick={anchor(() => scrollToId('uu-dai'))} sx={{ ...linkSx, color: C.accent }}>
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

        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', alignItems: 'center', flex: { xs: '0 0 auto', md: '1 1 200px' } }}>
          <Box component="button" type="button" aria-label="Tìm kiếm" aria-expanded={searchOpen} onClick={() => setSearchOpen((v) => !v)} sx={iconBtnSx}>
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
            <Box component={RouterLink} to="/login" sx={{ ...linkSx, display: 'flex', alignItems: 'center', height: 44, px: 1, fontSize: 14, fontWeight: 500 }}>
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

/* ---------- Các khối nội dung ---------- */

function SectionHead({ title, children }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 2, mb: 4 }}>
      <Box component="h2" sx={h2Sx}>
        {title}
      </Box>
      {children}
    </Box>
  );
}

function Hero() {
  return (
    <Box component="section" sx={{ ...container, pt: 4 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', bgcolor: C.sand, minHeight: { xs: 0, sm: 640 } }}>
        <Box
          sx={{
            flex: '1 1 420px',
            p: { xs: '40px 24px', sm: '72px 56px' },
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 3
          }}
        >
          <Box component="p" sx={{ ...eyebrowSx, color: '#5A544C' }}>
            Bộ sưu tập mới
          </Box>
          <Box component="h1" sx={{ m: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(44px, 6vw, 72px)', lineHeight: 1.05 }}>
            Mặc chậm.
            <br />
            <em>Mặc lâu.</em>
          </Box>
          <Box component="p" sx={{ m: 0, fontSize: 17, lineHeight: 1.6, color: '#3F3A34', maxWidth: 420 }}>
            Những thiết kế tối giản, chất liệu bền đẹp — để tủ đồ của bạn ít hơn nhưng đúng hơn.
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1 }}>
            <Box component="a" href="#moi" onClick={anchor(() => scrollToId('moi'))} sx={btnSx('dark')}>
              MUA NGAY
            </Box>
            <Box component="a" href="#tat-ca" onClick={anchor(() => scrollToId('tat-ca'))} sx={btnSx('outline')}>
              XEM TẤT CẢ
            </Box>
          </Box>
        </Box>
        <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 520px' }, minHeight: { xs: 360, sm: 520 }, bgcolor: '#CFC6BA', position: 'relative', overflow: 'hidden' }}>
          <Box component="img" src={heroImage} alt="" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        </Box>
      </Box>
    </Box>
  );
}

function Categories({ categories, onPick }) {
  if (categories.length === 0) return null;
  return (
    <Box component="section" id="danh-muc" sx={section}>
      <SectionHead title="Mua theo danh mục">
        <Box component="a" href="#tat-ca" onClick={anchor(() => onPick(0))} sx={{ ...linkSx, fontSize: 14, textDecoration: 'underline' }}>
          Xem tất cả
        </Box>
      </SectionHead>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1.5, sm: 2.5 } }}>
        {categories.slice(0, 4).map((c, i) => (
          <Box
            key={c.categoryId}
            component="button"
            type="button"
            onClick={() => onPick(c.categoryId)}
            sx={{
              flex: { xs: '1 1 calc(50% - 6px)', sm: '1 1 260px' },
              border: 0,
              p: 0,
              bgcolor: 'transparent',
              font: 'inherit',
              color: C.ink,
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              '&:hover .tile': { filter: 'brightness(.95)' },
              '&:hover .name': { color: C.accent },
              ...focusRing
            }}
          >
            <Box
              className="tile"
              sx={{ width: '100%', aspectRatio: '3 / 4', bgcolor: TILE_COLORS[i % TILE_COLORS.length], display: 'flex', alignItems: 'flex-end', p: 2.5, boxSizing: 'border-box', transition: 'filter .2s' }}
            >
              <Box component="span" sx={{ fontFamily: SERIF, fontSize: 64, lineHeight: 1, color: 'rgba(17,17,17,.35)' }}>
                {c.categoryName.charAt(0)}
              </Box>
            </Box>
            <Box component="span" className="name" sx={{ fontSize: 16, fontWeight: 500 }}>
              {c.categoryName}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

const badgeSx = (bg, color = C.ink) => ({
  position: 'absolute',
  top: 12,
  left: 12,
  bgcolor: bg,
  color,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  px: 1,
  py: '5px'
});

function ProductCard({ product, promo, isNew, sx }) {
  const outOfStock = Number(product.totalStock) === 0;
  return (
    <Box
      component={RouterLink}
      to={`/shop/products/${product.productId}`}
      sx={{
        color: C.ink,
        textDecoration: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        '&:hover .zoom': { transform: 'scale(1.03)' },
        '&:hover .name': { color: C.accent },
        ...focusRing,
        ...sx
      }}
    >
      <Box sx={{ position: 'relative', aspectRatio: '4 / 5', overflow: 'hidden' }}>
        <ProductPhoto src={product.imageUrl} name={product.productName} zoomOnHover />
        {outOfStock ? (
          <Box component="span" sx={badgeSx('#6B655D', '#FFFFFF')}>
            HẾT HÀNG
          </Box>
        ) : promo ? (
          <Box component="span" sx={badgeSx(C.accent, '#FFFFFF')}>
            {promo.discountLabel}
          </Box>
        ) : (
          isNew && (
            <Box component="span" sx={badgeSx('#FFFFFF')}>
              MỚI
            </Box>
          )
        )}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', gap: { xs: 0.5, sm: 1.5 }, fontSize: 15 }}>
        <Box
          component="span"
          className="name"
          sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {product.productName}
        </Box>
        {promo ? (
          <Box component="span" sx={{ display: 'flex', gap: 1, whiteSpace: 'nowrap' }}>
            <Box component="span" sx={{ fontWeight: 600, color: C.accent }}>
              {Number(product.maxPrice) > Number(product.minPrice) ? 'Từ ' : ''}
              {money(promo.salePrice)}
            </Box>
            <Box component="span" sx={{ color: '#6B655D', textDecoration: 'line-through' }}>
              {money(product.minPrice)}
            </Box>
          </Box>
        ) : (
          <Box component="span" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
            {priceText(product.minPrice, product.maxPrice)}
          </Box>
        )}
      </Box>
    </Box>
  );
}

const arrowSx = (dark) => ({
  ...iconBtnSx,
  border: `1px solid ${C.ink}`,
  bgcolor: dark ? C.ink : '#FFFFFF',
  color: dark ? '#FFFFFF' : C.ink,
  '&:hover': { opacity: 0.85 }
});

function NewArrivals({ items, promoMap }) {
  const trackRef = useRef(null);
  if (items.length === 0) return null;

  const scroll = (dir) => {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <Box component="section" id="moi" sx={section}>
      <SectionHead title="Hàng mới về">
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Box component="button" type="button" aria-label="Sản phẩm trước" onClick={() => scroll(-1)} sx={arrowSx(false)}>
            <Icon size={18}>
              <path d="M15 5l-7 7 7 7" />
            </Icon>
          </Box>
          <Box component="button" type="button" aria-label="Sản phẩm tiếp theo" onClick={() => scroll(1)} sx={arrowSx(true)}>
            <Icon size={18}>
              <path d="M9 5l7 7-7 7" />
            </Icon>
          </Box>
        </Box>
      </SectionHead>
      <Box
        ref={trackRef}
        sx={{ display: 'flex', gap: 2.5, overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
      >
        {items.map((p) => (
          <ProductCard
            key={p.productId}
            product={p}
            promo={promoMap.get(p.productId)}
            isNew
            sx={{ flex: '0 0 calc((100% - 60px) / 4)', minWidth: { xs: '72%', sm: 260 }, scrollSnapAlign: 'start' }}
          />
        ))}
      </Box>
    </Box>
  );
}

function PromoBanner({ promos }) {
  if (promos.length === 0) return null;
  const top = promos[0];
  const best = promos.reduce((acc, p) => Math.max(acc, parseInt(String(p.discountLabel).replace(/\D/g, ''), 10) || 0), 0);
  return (
    <Box component="section" id="uu-dai" sx={section}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', bgcolor: C.accent, color: '#FFFFFF' }}>
        <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 480px' }, minHeight: { xs: 360, sm: 420 }, display: 'flex' }}>
          <ProductPhoto src={top.imageUrl} name={top.productName} dark />
        </Box>
        <Box sx={{ flex: '1 1 420px', p: { xs: '40px 24px', sm: '64px 56px' }, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2.5 }}>
          <Box component="p" sx={eyebrowSx}>
            Ưu đãi có hạn
          </Box>
          <Box component="h2" sx={{ m: 0, fontFamily: SERIF, fontWeight: 400, fontSize: { xs: 38, sm: 52 }, lineHeight: 1.1 }}>
            {best > 0 ? `Giảm đến ${best}%` : top.promotionName}
          </Box>
          <Box component="p" sx={{ m: 0, fontSize: 16, lineHeight: 1.6, maxWidth: 400 }}>
            {top.promotionName} — áp dụng cho {promos.length} sản phẩm đang khuyến mãi.
          </Box>
          <Box>
            <Box component={RouterLink} to={`/shop/products/${top.productId}`} sx={btnSx('light')}>
              MUA ƯU ĐÃI
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

const BENEFITS = [
  {
    title: 'Giao hàng tận nơi',
    desc: 'Giao toàn quốc, theo dõi đơn dễ dàng',
    icon: (
      <>
        <path d="M3 7h11v9H3z" />
        <path d="M14 10h4l3 3v3h-7" />
        <circle cx="7" cy="17.5" r="1.5" />
        <circle cx="17" cy="17.5" r="1.5" />
      </>
    )
  },
  {
    title: 'Đổi trả dễ dàng',
    desc: 'Gửi yêu cầu đổi trả ngay trong đơn hàng',
    icon: (
      <>
        <path d="M4 12a8 8 0 1 0 2.3-5.7" />
        <path d="M4 4v4h4" />
      </>
    )
  },
  {
    title: 'Thanh toán linh hoạt',
    desc: 'COD hoặc chuyển khoản VietQR',
    icon: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="1" />
        <path d="M3 10h18" />
      </>
    )
  },
  { title: 'Tư vấn size miễn phí', desc: 'Nhắn cho cửa hàng bất cứ lúc nào', icon: <path d="M4 5h16v11H8l-4 4z" /> }
];

function Benefits() {
  return (
    <Box component="section" sx={{ ...container, py: 9 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, py: 5 }}>
        {BENEFITS.map((b) => (
          <Box key={b.title} sx={{ flex: '1 1 240px', display: 'flex', gap: '14px', alignItems: 'flex-start', '& svg': { flex: '0 0 auto' } }}>
            <Icon size={28} strokeWidth={1.4}>
              {b.icon}
            </Icon>
            <Box>
              <Box sx={{ fontSize: 15, fontWeight: 600 }}>{b.title}</Box>
              <Box sx={{ fontSize: 14, color: C.muted, mt: 0.5 }}>{b.desc}</Box>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

const footerLinkSx = { color: '#D9D6D0', textDecoration: 'none', '&:hover': { color: '#FFFFFF' }, ...focusRing };
const footerColSx = { flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: 1.25, fontSize: 14 };
const footerTitleSx = { color: '#FFFFFF', fontWeight: 600, mb: 0.5 };

function StoreFooter({ categories, onPickCategory }) {
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
            <Box component="a" href="#moi" onClick={anchor(() => scrollToId('moi'))} sx={footerLinkSx}>
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

/* ---------- Trang ---------- */

const chipSx = (selected) => ({
  minHeight: 36,
  px: 2,
  border: `1px solid ${selected ? C.ink : '#CFCAC2'}`,
  bgcolor: selected ? C.ink : '#FFFFFF',
  color: selected ? '#FFFFFF' : C.ink,
  font: 'inherit',
  fontSize: 14,
  cursor: 'pointer',
  '&:hover': { borderColor: C.ink },
  ...focusRing
});

export default function ShopPage() {
  useStoreFonts();
  const auth = useAuth();
  const account = auth?.account;
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';

  const [categories, setCategories] = useState([]);
  const [newest, setNewest] = useState([]);
  const [promos, setPromos] = useState([]);

  const [categoryId, setCategoryId] = useState(0);
  const [sort, setSort] = useState('newest');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dữ liệu cho các khối trang chủ (tải một lần)
  useEffect(() => {
    api('/shop/categories')
      .then((d) => setCategories(d.items || []))
      .catch(() => setCategories([]));
    api(`/shop/products?page=0&size=${NEW_COUNT}&sort=newest`)
      .then((d) => setNewest(d.items || []))
      .catch(() => setNewest([]));
    api('/shop/promotions?size=20')
      .then((d) => setPromos(d.items || []))
      .catch(() => setPromos([]));
  }, []);

  const promoMap = useMemo(() => new Map(promos.map((p) => [p.productId, p])), [promos]);

  // Lưới toàn bộ sản phẩm (tìm kiếm, lọc danh mục, sắp xếp, xem thêm)
  const load = useCallback(
    async (pageNo, replace) => {
      setLoading(true);
      setError('');
      try {
        const q = new URLSearchParams({ page: pageNo, size: PAGE_SIZE, sort });
        if (query) q.set('q', query);
        if (categoryId) q.set('categoryId', categoryId);
        const data = await api(`/shop/products?${q}`);
        setItems((prev) => (replace ? data.items : [...prev, ...data.items]));
        setTotal(data.total);
        setPage(pageNo);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [query, categoryId, sort]
  );

  useEffect(() => {
    load(0, true);
  }, [load]);

  const onSearch = (text) => {
    setParams(text ? { q: text } : {});
    if (text) setCategoryId(0);
  };

  const pickCategory = (id) => {
    setCategoryId(id);
    setTimeout(() => scrollToId('tat-ca'), 0);
  };

  const gridTitle = query
    ? `Kết quả cho “${query}”`
    : categoryId
      ? categories.find((c) => c.categoryId === categoryId)?.categoryName || 'Sản phẩm'
      : 'Tất cả sản phẩm';

  return (
    <Box sx={{ fontFamily: SANS, color: C.ink, bgcolor: '#FFFFFF', minHeight: '100vh', '& *, & *::before, & *::after': { boxSizing: 'border-box' } }}>
      <Box sx={{ bgcolor: C.ink, color: '#FFFFFF', fontSize: 13, letterSpacing: '0.04em', textAlign: 'center', py: '11px', px: 2 }}>
        Giao hàng toàn quốc — Thanh toán khi nhận hàng hoặc chuyển khoản
      </Box>
      <StoreHeader account={account} categories={categories} query={query} onSearch={onSearch} onPickCategory={pickCategory} />

      <Box component="main">
        {!query && (
          <>
            <Hero />
            <Categories categories={categories} onPick={pickCategory} />
            <NewArrivals items={newest} promoMap={promoMap} />
            <PromoBanner promos={promos} />
          </>
        )}

        <Box component="section" id="tat-ca" sx={section}>
          <SectionHead title={gridTitle}>
            {query ? (
              <Box
                component="button"
                type="button"
                onClick={() => onSearch('')}
                sx={{ ...linkSx, border: 0, p: 0, bgcolor: 'transparent', font: 'inherit', fontSize: 14, textDecoration: 'underline' }}
              >
                Xóa tìm kiếm ({total} kết quả)
              </Box>
            ) : (
              <Box component="label" sx={{ position: 'relative' }}>
                <Box component="span" sx={srOnly}>
                  Sắp xếp
                </Box>
                <Box
                  component="select"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  sx={{ height: 44, pl: '14px', pr: 4, border: `1px solid ${C.ink}`, bgcolor: '#FFFFFF', font: 'inherit', fontSize: 14, color: C.ink, cursor: 'pointer', ...focusRing }}
                >
                  {SORTS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Box>
              </Box>
            )}
          </SectionHead>

          {!query && categories.length > 0 && (
            <Box role="group" aria-label="Lọc theo danh mục" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: -1.5, mb: 4 }}>
              <Box component="button" type="button" aria-pressed={categoryId === 0} onClick={() => setCategoryId(0)} sx={chipSx(categoryId === 0)}>
                Tất cả
              </Box>
              {categories.map((c) => (
                <Box
                  key={c.categoryId}
                  component="button"
                  type="button"
                  aria-pressed={categoryId === c.categoryId}
                  onClick={() => setCategoryId(c.categoryId)}
                  sx={chipSx(categoryId === c.categoryId)}
                >
                  {c.categoryName}
                </Box>
              ))}
            </Box>
          )}

          {error && (
            <Box component="p" sx={{ color: C.accent }}>
              {error}
            </Box>
          )}

          {!loading && !error && items.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 6, color: C.muted }}>
              <Box sx={{ fontFamily: SERIF, fontSize: 24, color: C.ink, mb: 1 }}>Không tìm thấy sản phẩm</Box>
              <Box>Thử từ khóa khác hoặc chọn danh mục khác.</Box>
            </Box>
          )}

          <Box
            sx={{
              display: 'grid',
              gap: { xs: '24px 12px', sm: '32px 20px' },
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(auto-fill, minmax(240px, 1fr))' }
            }}
          >
            {items.map((p) => (
              <ProductCard key={p.productId} product={p} promo={promoMap.get(p.productId)} />
            ))}
          </Box>

          {loading && items.length === 0 && (
            <Box component="p" sx={{ color: C.muted }}>
              Đang tải sản phẩm...
            </Box>
          )}

          {items.length < total && (
            <Box sx={{ textAlign: 'center', mt: 6 }}>
              <Box component="button" type="button" disabled={loading} onClick={() => load(page + 1, false)} sx={btnSx('outline')}>
                {loading ? 'ĐANG TẢI...' : 'XEM THÊM'}
              </Box>
            </Box>
          )}
        </Box>

        <Benefits />
      </Box>

      <StoreFooter categories={categories} onPickCategory={pickCategory} />

      {account?.role === 'CUSTOMER' && <PendingCartHandler />}
    </Box>
  );
}
