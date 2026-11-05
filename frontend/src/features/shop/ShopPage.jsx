import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { Box } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import { api } from 'services/http';
import { money, priceText } from './ShopCommon';
import PendingCartHandler from './PendingCartHandler';
import ShopBanner from './ShopBanner';
import { C, SERIF, Icon, btnSx, container, eyebrowSx, focusRing, h2Sx, linkSx, scrollToId, section, srOnly } from './storeTheme';

/**
 * Trang chủ cửa hàng (đường dẫn '/'). Header, footer và thanh thông báo nằm ở layouts/StorefrontLayout.
 *  - Chưa tìm kiếm: banner (ShopBanner), danh mục, ưu đãi, toàn bộ sản phẩm.
 *  - Đang tìm kiếm (?q=...): chỉ hiện lưới kết quả.
 *  - Lọc danh mục qua ?category=ID; link có #uu-dai / #tat-ca sẽ tự cuộn tới khối đó.
 * Dữ liệu: /shop/categories (lấy từ layout), /shop/products, /shop/promotions.
 */

const SORTS = [
  ['newest', 'Mới nhất'],
  ['price_asc', 'Giá thấp đến cao'],
  ['price_desc', 'Giá cao đến thấp']
];
const PAGE_SIZE = 20;
const NEW_DAYS = 7; // sản phẩm thêm trong vòng 7 ngày được gắn nhãn "MỚI"

// Cần API /shop/products trả về createdAt (thời điểm tạo sản phẩm). Không có thì không gắn nhãn.
function isNewProduct(createdAt) {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created < NEW_DAYS * 24 * 60 * 60 * 1000;
}

/* ---------- Ảnh ---------- */

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

/* ---------- Icon nét mảnh cho danh mục (chọn theo tên danh mục) ---------- */

const CATEGORY_ICONS = {
  jacket: (
    <>
      <path d="M24 9 L13 13 L7 54 H15 L17 30 V56 H47 V30 L49 54 H57 L51 13 L40 9" />
      <path d="M24 9 C26 13 29 15 32 15 C35 15 38 13 40 9" />
      <path d="M32 15 V56" />
      <path d="M22 40 H27 M37 40 H42" />
    </>
  ),
  shirt: (
    <>
      <path d="M23 10 L11 15 L5 28 L13 32 L17 27 V55 H47 V27 L51 32 L59 28 L53 15 L41 10" />
      <path d="M23 10 C25 14 28 16 32 16 C36 16 39 14 41 10" />
      <path d="M20 30 C21 35 21 45 20 50 M44 30 C43 35 43 45 44 50" />
    </>
  ),
  pants: (
    <>
      <path d="M17 8 H47 L50 57 H36 L32 22 L28 57 H14 Z" />
      <path d="M17 14 H47" />
      <path d="M32 14 V22" />
      <path d="M22 14 V17 M42 14 V17" />
    </>
  ),
  dress: (
    <>
      <path d="M25 6 V14 M39 6 V14" />
      <path d="M25 14 H39 L37 26 L50 57 H14 L27 26 Z" />
      <path d="M27 26 H37" />
    </>
  ),
  bag: (
    <>
      <path d="M11 24 H53 L49 57 H15 Z" />
      <path d="M23 24 V18 C23 13 27 9 32 9 C37 9 41 13 41 18 V24" />
      <path d="M23 30 V32 M41 30 V32" />
    </>
  ),
  shoe: (
    <>
      <path d="M7 44 V26 L19 24 C21 30 25 34 31 36 L49 40 C55 41 58 44 58 48 V51 H7 Z" />
      <path d="M7 46 H58" />
      <path d="M24 30 L27 27 M29 33 L32 30" />
    </>
  ),
  hat: (
    <>
      <path d="M18 40 C18 24 46 24 46 40" />
      <path d="M6 42 C6 38 58 38 58 42 C58 47 6 47 6 42 Z" />
      <path d="M19 36 H45" />
    </>
  ),
  hanger: (
    <>
      <path d="M28 16 C28 12 30 10 33 10 C36 10 38 12 38 15 C38 18 35 19 33 21 V26" />
      <path d="M33 26 L7 44 C5 46 6 48 9 48 H55 C58 48 59 46 57 44 Z" />
    </>
  )
};

// Thứ tự quan trọng: "áo khoác" phải xét trước "áo"
const ICON_RULES = [
  [/áo khoác|jacket|blazer|cardigan/, 'jacket'],
  [/váy|đầm|dress/, 'dress'],
  [/quần|pants|jean|short/, 'pants'],
  [/áo|shirt|thun|sơ mi/, 'shirt'],
  [/túi|ví|balo|bag/, 'bag'],
  [/giày|dép|shoe|sneaker/, 'shoe'],
  [/mũ|nón|hat|cap/, 'hat']
];

function categoryIcon(name) {
  const lower = (name || '').toLowerCase();
  const rule = ICON_RULES.find(([re]) => re.test(lower));
  return CATEGORY_ICONS[rule ? rule[1] : 'hanger'];
}

const CAT_ROWS_AT = 10; // nhiều hơn 10 danh mục thì xếp 2 hàng
const CAT_COL = { xs: 104, md: 176 }; // bề rộng mỗi ô danh mục

const catArrowSx = (side) => ({
  position: 'absolute',
  top: '50%',
  [side]: -8,
  transform: 'translateY(-50%)',
  zIndex: 2,
  width: 40,
  height: 40,
  p: 0,
  borderRadius: '50%',
  border: `1px solid ${C.line}`,
  bgcolor: '#FFFFFF',
  color: C.ink,
  boxShadow: '0 1px 12px rgba(0,0,0,.12)',
  cursor: 'pointer',
  display: { xs: 'none', md: 'flex' },
  alignItems: 'center',
  justifyContent: 'center',
  '&:hover': { color: C.accent },
  ...focusRing
});

function Categories({ categories, onPick }) {
  const trackRef = useRef(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const rows = categories.length > CAT_ROWS_AT ? 2 : 1;

  // Kiểm tra còn cuộn được sang trái/phải không để hiện mũi tên
  const updateEdge = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    updateEdge();
    window.addEventListener('resize', updateEdge);
    return () => window.removeEventListener('resize', updateEdge);
  }, [updateEdge, categories.length]);

  const scroll = (dir) => trackRef.current?.scrollBy({ left: dir * trackRef.current.clientWidth, behavior: 'smooth' });

  if (categories.length === 0) return null;

  return (
    <Box component="section" id="danh-muc" sx={{ ...section, scrollMarginTop: 96 }}>
      <SectionHead title="Danh mục" />

      <Box sx={{ position: 'relative' }}>
        {edge.left && (
          <Box component="button" type="button" aria-label="Danh mục trước" onClick={() => scroll(-1)} sx={catArrowSx('left')}>
            <Icon size={16}>
              <path d="M15 5l-7 7 7 7" />
            </Icon>
          </Box>
        )}

        {/* Khung cuộn ngang; lưới bên trong rộng vừa nội dung và căn giữa khi ít danh mục */}
        <Box ref={trackRef} onScroll={updateEdge} sx={{ overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
          <Box
            sx={{
              display: 'grid',
              width: 'max-content',
              mx: 'auto',
              gridTemplateRows: `repeat(${rows}, auto)`,
              gridAutoFlow: 'column',
              gridAutoColumns: { xs: `${CAT_COL.xs}px`, md: `${CAT_COL.md}px` },
              rowGap: { xs: 2, md: 3 }
            }}
          >
            {categories.map((c) => (
              <Box
                key={c.categoryId}
                component="button"
                type="button"
                onClick={() => onPick(c.categoryId)}
                sx={{
                  px: 1,
                  py: 1,
                  border: 0,
                  bgcolor: 'transparent',
                  font: 'inherit',
                  color: C.ink,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: { xs: 1.25, md: 2 },
                  '&:hover .circle': { bgcolor: C.ink, color: '#FFFFFF' },
                  '&:hover .name': { color: C.accent },
                  ...focusRing
                }}
              >
                <Box
                  className="circle"
                  sx={{
                    width: { xs: 80, md: 128 },
                    height: { xs: 80, md: 128 },
                    flexShrink: 0,
                    borderRadius: '50%',
                    bgcolor: C.sand,
                    color: C.ink,
                    display: 'grid',
                    placeItems: 'center',
                    transition: 'background-color .2s, color .2s',
                    '& svg': { width: { xs: 46, md: 72 }, height: { xs: 46, md: 72 } }
                  }}
                >
                  <svg aria-hidden="true" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    {categoryIcon(c.categoryName)}
                  </svg>
                </Box>
                <Box
                  component="span"
                  className="name"
                  sx={{
                    fontSize: { xs: 15, md: 18 },
                    fontWeight: 500,
                    lineHeight: 1.35,
                    textAlign: 'center',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'break-word'
                  }}
                >
                  {c.categoryName}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>

        {edge.right && (
          <Box component="button" type="button" aria-label="Danh mục tiếp theo" onClick={() => scroll(1)} sx={catArrowSx('right')}>
            <Icon size={16}>
              <path d="M9 5l7 7-7 7" />
            </Icon>
          </Box>
        )}
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

function ProductCard({ product, promo, sx }) {
  const outOfStock = Number(product.totalStock) === 0;
  const isNew = isNewProduct(product.createdAt);
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

function PromoBanner({ promos }) {
  if (promos.length === 0) return null;
  const top = promos[0];
  const best = promos.reduce((acc, p) => Math.max(acc, parseInt(String(p.discountLabel).replace(/\D/g, ''), 10) || 0), 0);
  return (
    <Box component="section" id="uu-dai" sx={{ ...section, scrollMarginTop: 96 }}>
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
  const auth = useAuth();
  const account = auth?.account;
  const navigate = useNavigate();
  const location = useLocation();
  const { categories = [] } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const categoryId = Number(params.get('category')) || 0;

  const [promos, setPromos] = useState([]);

  const [sort, setSort] = useState('newest');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dữ liệu cho các khối trang chủ (tải một lần)
  useEffect(() => {
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

  // Link dạng /#moi, /?category=2#tat-ca (từ header/footer): cuộn tới khối tương ứng khi khối đã hiện
  const hash = location.hash.slice(1);
  useEffect(() => {
    if (!hash) return undefined;
    const timer = setTimeout(() => scrollToId(hash), 50);
    return () => clearTimeout(timer);
  }, [hash, location.key, promos.length, items.length]);

  // Chọn danh mục: lọc lưới và cuộn tới lưới
  const pickCategory = (id) => navigate(id ? `/?category=${id}#tat-ca` : '/#tat-ca');
  // Chip lọc ngay trên lưới: chỉ đổi bộ lọc, không cuộn
  const setCategoryFilter = (id) => setParams(id ? { category: String(id) } : {}, { replace: true, preventScrollReset: true });

  const gridTitle = query
    ? `Kết quả cho “${query}”`
    : categoryId
      ? categories.find((c) => c.categoryId === categoryId)?.categoryName || 'Sản phẩm'
      : 'Tất cả sản phẩm';

  return (
    <>
      {!query && (
        <>
          <ShopBanner />
          <Categories categories={categories} onPick={pickCategory} />
          <PromoBanner promos={promos} />
        </>
      )}

      <Box component="section" id="tat-ca" sx={{ ...section, scrollMarginTop: 96 }}>
        <SectionHead title={gridTitle}>
          {query ? (
            <Box
              component="button"
              type="button"
              onClick={() => navigate('/')}
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
            <Box component="button" type="button" aria-pressed={categoryId === 0} onClick={() => setCategoryFilter(0)} sx={chipSx(categoryId === 0)}>
              Tất cả
            </Box>
            {categories.map((c) => (
              <Box
                key={c.categoryId}
                component="button"
                type="button"
                aria-pressed={categoryId === c.categoryId}
                onClick={() => setCategoryFilter(c.categoryId)}
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

      {account?.role === 'CUSTOMER' && <PendingCartHandler />}
    </>
  );
}
