import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { Box } from '@mui/material';
import { keyframes } from '@emotion/react';
import { useAuth } from 'features/auth/AuthProvider';
import { api } from 'services/http';
import { getPromotions } from 'services/promotionService';
import { ColorSwatches, isNewProduct, money, priceText, useProductColors } from './ShopCommon';
import PendingCartHandler from './PendingCartHandler';
import ShopBanner from './ShopBanner';
import { C, RADIUS, SERIF, Icon, btnSx, container, eyebrowSx, focusRing, h2Sx, linkSx, scrollToId, section, iconBtnSx } from './storeTheme';

/**
 * Trang chủ cửa hàng (đường dẫn '/'). Header, footer và thanh thông báo nằm ở layouts/StorefrontLayout.
 *  Gồm: banner, danh mục, Hàng bán chạy, Hàng mới về, ưu đãi, lợi ích.
 *  - Bấm danh mục -> trang riêng /shop/category/:categoryId (ShopCategoryPage).
 *  - Link có #ban-chay / #moi / #uu-dai sẽ tự cuộn tới khối đó.
 * Dữ liệu: /shop/categories (lấy từ layout), /shop/products, /shop/promotions.
 */

const SHELF_SIZE = 8; // số sản phẩm mỗi khối Hàng bán chạy / Hàng mới về
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

export function SectionHead({ title, children }) {
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
  backpack: (
    <>
      <path d="M24 14 V11 C24 8 27 6 32 6 C37 6 40 8 40 11 V14" />
      <path d="M14 26 C14 19 20 14 27 14 H37 C44 14 50 19 50 26 V54 C50 56 48 58 46 58 H18 C16 58 14 56 14 54 Z" />
      <path d="M21 38 H43 V52 C43 53 42 54 41 54 H23 C22 54 21 53 21 52 Z" />
      <path d="M21 44 H43 M32 42 V46" />
      <path d="M14 30 H9 V48 H14 M50 30 H55 V48 H50" />
    </>
  ),
  wallet: (
    <>
      <path d="M10 20 H48 C51 20 54 23 54 26 V50 C54 53 51 56 48 56 H14 C12 56 10 54 10 52 Z" />
      <path d="M10 20 L42 10 C44 9 46 11 46 13 V20" />
      <path d="M40 32 H56 V44 H40 C37 44 35 41 35 38 C35 35 37 32 40 32 Z" />
      <circle cx="41" cy="38" r="1.6" />
    </>
  ),
  sandal: (
    <>
      <path d="M20 6 C14 6 11 11 11 18 C11 25 14 29 14 36 C14 44 12 48 13 53 C14 57 17 58 20 58 C23 58 26 57 26 52 C26 46 25 42 26 36 C27 29 29 25 29 18 C29 11 26 6 20 6 Z" />
      <path d="M13 24 L20 14 L27 24" />
      <path d="M44 6 C38 6 35 11 35 18 C35 25 37 29 38 36 C39 42 38 46 38 52 C38 57 41 58 44 58 C47 58 50 57 51 53 C52 48 50 44 50 36 C50 29 53 25 53 18 C53 11 50 6 44 6 Z" />
      <path d="M37 24 L44 14 L51 24" />
    </>
  ),
  belt: (
    <>
      <path d="M4 26 H60 V38 H4 Z" />
      <path d="M22 22 H38 V42 H22 Z" />
      <path d="M26 26 H34 V38 H26 Z" />
      <path d="M30 32 H40" />
      <path d="M46 32 H47 M52 32 H53" />
    </>
  ),
  glasses: (
    <>
      <path d="M6 30 H58" />
      <path d="M8 30 C8 40 12 44 19 44 C26 44 28 38 28 30" />
      <path d="M36 30 C36 38 38 44 45 44 C52 44 56 40 56 30" />
      <path d="M28 32 C30 30 34 30 36 32" />
    </>
  ),
  watch: (
    <>
      <circle cx="32" cy="32" r="12" />
      <path d="M32 26 V32 L36 35" />
      <path d="M25 22 L27 8 H37 L39 22 M25 42 L27 56 H37 L39 42" />
    </>
  ),
  socks: (
    <>
      <path d="M22 6 H38 V34 L48 42 C52 45 52 51 48 54 C45 57 41 57 38 55 L24 45 C22 44 22 42 22 40 Z" />
      <path d="M22 14 H38" />
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
  [/áo khoác|jacket|blazer|cardigan|hoodie/, 'jacket'],
  [/váy|đầm|dress/, 'dress'],
  [/quần|pants|jean|short/, 'pants'],
  [/thắt lưng|dây lưng|dây nịt|belt/, 'belt'],
  [/áo|shirt|thun|sơ mi|polo/, 'shirt'],
  [/cặp|balo|ba lô|backpack/, 'backpack'],
  [/ví|wallet/, 'wallet'],
  [/túi|bag/, 'bag'],
  [/dép|sandal|guốc/, 'sandal'],
  [/giày|shoe|sneaker|boot/, 'shoe'],
  [/mũ|nón|hat|cap/, 'hat'],
  [/tất|vớ|sock/, 'socks'],
  [/đồng hồ|watch/, 'watch'],
  [/phụ kiện|kính|accessor|trang sức/, 'glasses']
];

function categoryIcon(name) {
  const lower = (name || '').normalize('NFC').toLowerCase();
  const rule = ICON_RULES.find(([re]) => re.test(lower));
  return CATEGORY_ICONS[rule ? rule[1] : 'hanger'];
}

const CAT_COL = { xs: 104, md: 176 }; // bề rộng mỗi ô danh mục

function Categories({ categories, onPick }) {
  if (categories.length === 0) return null;

  return (
    <Box component="section" id="danh-muc" sx={{ ...section, scrollMarginTop: 96 }}>
      <SectionHead title="Danh mục" />

      {/* Nhiều danh mục thì tự xuống dòng; mỗi hàng đều căn giữa */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          rowGap: { xs: 3, md: 4 },
          '& > button': { width: { xs: CAT_COL.xs, md: CAT_COL.md }, flex: '0 0 auto' }
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
              <svg
                aria-hidden="true"
                viewBox="0 0 64 64"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
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

// Dùng lại ở trang chi tiết sản phẩm (mục "Có thể bạn sẽ thích")
export function ProductCard({ product, promo, sx }) {
  const outOfStock = Number(product.totalStock) === 0;
  const isNew = isNewProduct(product);
  const colors = useProductColors(product);
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
        {/* Góc trái: "MỚI" cho sản phẩm mới; góc phải: hết hàng hoặc % giảm giá */}
        {isNew && (
          <Box component="span" sx={badgeSx('#FFFFFF')}>
            MỚI
          </Box>
        )}
        {outOfStock ? (
          <Box component="span" sx={{ ...badgeSx('#6B655D', '#FFFFFF'), left: 'auto', right: 12 }}>
            HẾT HÀNG
          </Box>
        ) : (
          promo && (
            <Box component="span" sx={{ ...badgeSx(C.accent, '#FFFFFF'), left: 'auto', right: 12 }}>
              {promo.discountLabel}
            </Box>
          )
        )}
      </Box>
      {/* Tên -> giá -> các màu có sẵn, xếp dọc */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, fontSize: 15 }}>
        <Box
          component="span"
          className="name"
          sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {product.productName}
        </Box>
        {promo ? (
          <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1 }}>
            <Box component="span" sx={{ color: '#8C857B', textDecoration: 'line-through' }}>
              {money(product.minPrice)}
            </Box>
            <Box component="span" sx={{ fontWeight: 600, color: C.accent }}>
              {Number(product.maxPrice) > Number(product.minPrice) ? 'Từ ' : ''}
              {money(promo.salePrice)}
            </Box>
          </Box>
        ) : (
          <Box component="span" sx={{ fontWeight: 600 }}>
            {priceText(product.minPrice, product.maxPrice)}
          </Box>
        )}
        <Box sx={{ mt: 0.5 }}>
          <ColorSwatches colors={colors} />
        </Box>
      </Box>
    </Box>
  );
}

/* ---------- Banner sales ---------- */

const rise = keyframes`from { transform: translateY(105%); } to { transform: none; }`;
const fadeUp = keyframes`from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; }`;
const drift = keyframes`50% { transform: translate(-1.5%, 1%) rotate(-1deg); }`;

const fade = (delay) => ({ opacity: 0, animation: `${fadeUp} .6s ${delay}s forwards` });

const LETTERS = [
  ['S', -30, 400, -12],
  ['A', 300, 520, 8],
  ['L', 640, 600, -16],
  ['E', 900, 450, 14]
];

const discountText = (p) => {
  const v = Number(p.discountValue) || 0;
  if (p.discountType === 'PERCENT') return `${v}%`;
  return v >= 1000 ? `${Math.round(v / 1000)}K` : money(v);
};

const latestVoucher = (promos, vouchers) => {
  const now = new Date();
  const active = vouchers.filter((v) => (!v.status || v.status === 'ACTIVE') && new Date(v.startDate) <= now && now <= new Date(v.endDate));
  if (active.length > 0) {
    const v = active.reduce((a, b) => (b.promotionId > a.promotionId ? b : a));
    const note = [
      Number(v.minOrderValue) > 0 && `Đơn từ ${money(v.minOrderValue)}`,
      v.applyScope === 'ALL' ? 'Toàn shop' : 'Một số sản phẩm',
      `Đến ${new Date(v.endDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`
    ];
    return { ...v, note: note.filter(Boolean).join(' · ') };
  }
  const p = promos[0];
  if (!p) return null;
  const count = promos.filter((x) => x.promotionName === p.promotionName).length;
  return { ...p, name: p.promotionName, note: count > 1 ? `Áp dụng cho ${count} sản phẩm` : p.productName };
};

function RiseLine({ children, size, spacing, delay }) {
  return (
    <Box
      component="span"
      sx={{ display: 'block', overflow: 'hidden', pt: '.16em', fontSize: size, letterSpacing: `${spacing} !important` }}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-block',
          transform: 'translateY(105%)',
          animation: `${rise} .8s cubic-bezier(.2,.8,.2,1) ${delay}s forwards`
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

function PromoBanner({ promos, vouchers }) {
  const voucher = useMemo(() => latestVoucher(promos, vouchers), [promos, vouchers]);
  if (!voucher) return null;

  return (
    <Box component="section" id="uu-dai" sx={{ ...section, scrollMarginTop: 96 }}>
      <Box
        sx={{
          position: 'relative',
          height: { xs: 480, md: 560 },
          borderRadius: RADIUS.card,
          overflow: 'hidden',
          bgcolor: '#E98AAB',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          px: 3
        }}
      >
        <Box
          component="svg"
          viewBox="0 0 1200 560"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', animation: `${drift} 14s ease-in-out infinite` }}
        >
          {LETTERS.map(([ch, x, y, deg]) => (
            <text
              key={ch}
              x={x}
              y={y}
              transform={`rotate(${deg} ${x} ${y})`}
              fontSize="460"
              fontWeight="800"
              fill="none"
              stroke="#C9475F"
              strokeWidth="3"
            >
              {ch}
            </text>
          ))}
        </Box>
        <Box sx={{ position: 'relative' }}>
          <Box component="p" sx={{ ...eyebrowSx, fontSize: { xs: 18, md: 24 }, fontWeight: 800, letterSpacing: '.12em', ...fade(0.2) }}>
            {voucher.name}
          </Box>
          <Box sx={{ width: 32, height: 3, bgcolor: '#FFFFFF', mx: 'auto', my: 2.5, ...fade(0.3) }} />
          <Box component="h2" sx={{ m: 0, fontWeight: '800 !important', lineHeight: 0.86 }}>
            <RiseLine size={{ xs: 22, md: 30 }} spacing=".08em" delay={0.4}>
              GIẢM ĐẾN
            </RiseLine>
            <RiseLine size={{ xs: 110, md: 180 }} spacing="-3px" delay={0.5}>
              {discountText(voucher)}
            </RiseLine>
          </Box>
          <Box sx={{ mt: 2.25, fontSize: 14, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', ...fade(0.8) }}>
            {voucher.note}
          </Box>
          <Box sx={{ mt: 3.5, ...fade(1) }}>
            <Box
              component={RouterLink}
              to="/promotions"
              sx={{ ...btnSx('light'), color: C.ink, '&:hover': { bgcolor: '#FFF3B0', borderColor: '#FFF3B0', color: C.ink } }}
            >
              KHÁM PHÁ KHO VOUCHER
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
          <Box
            key={b.title}
            sx={{ flex: '1 1 240px', display: 'flex', gap: '14px', alignItems: 'flex-start', '& svg': { flex: '0 0 auto' } }}
          >
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

// Một hàng sản phẩm trên trang chủ (Hàng bán chạy / Hàng mới về) kèm link "Xem tất cả"
const shelfArrowSx = (dark) => ({
  ...iconBtnSx,
  border: `1px solid ${C.ink}`,
  bgcolor: dark ? C.ink : '#FFFFFF',
  color: dark ? '#FFFFFF' : C.ink,
  '&:hover': { opacity: 0.85, color: dark ? '#FFFFFF' : C.ink },
  '&:disabled': { opacity: 0.3, cursor: 'default' }
});

// Một hàng sản phẩm trên trang chủ (Hàng bán chạy / Hàng mới về): 1 dòng, cuộn ngang bằng 2 nút mũi tên
function ProductShelf({ id, title, items, promoMap, moreTo }) {
  const trackRef = useRef(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  // Còn cuộn được sang trái / phải không (để làm mờ nút mũi tên tương ứng)
  const updateEdge = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    updateEdge();
    window.addEventListener('resize', updateEdge);
    return () => window.removeEventListener('resize', updateEdge);
  }, [updateEdge, items.length]);

  const scroll = (dir) => trackRef.current?.scrollBy({ left: dir * trackRef.current.clientWidth, behavior: 'smooth' });

  if (items.length === 0) return null;
  return (
    <Box component="section" id={id} sx={{ ...section, scrollMarginTop: 96 }}>
      <SectionHead title={title}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {moreTo && (
            <Box component={RouterLink} to={moreTo} sx={{ ...linkSx, fontSize: 14, textDecoration: 'underline' }}>
              Xem tất cả
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Box
              component="button"
              type="button"
              aria-label={`${title}: trước`}
              disabled={!edge.left}
              onClick={() => scroll(-1)}
              sx={shelfArrowSx(false)}
            >
              <Icon size={18}>
                <path d="M15 5l-7 7 7 7" />
              </Icon>
            </Box>
            <Box
              component="button"
              type="button"
              aria-label={`${title}: tiếp theo`}
              disabled={!edge.right}
              onClick={() => scroll(1)}
              sx={shelfArrowSx(true)}
            >
              <Icon size={18}>
                <path d="M9 5l7 7-7 7" />
              </Icon>
            </Box>
          </Box>
        </Box>
      </SectionHead>
      <Box
        ref={trackRef}
        onScroll={updateEdge}
        sx={{
          display: 'flex',
          gap: { xs: '12px', sm: '20px' },
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' }
        }}
      >
        {items.map((p) => (
          <ProductCard
            key={p.productId}
            product={p}
            promo={promoMap.get(p.productId)}
            // Điện thoại 2 thẻ, tablet 3 thẻ, máy tính 4 thẻ trên một dòng
            sx={{
              flex: {
                xs: '0 0 calc((100% - 12px) / 2)',
                sm: '0 0 calc((100% - 40px) / 3)',
                md: '0 0 calc((100% - 60px) / 4)'
              },
              minWidth: 0,
              scrollSnapAlign: 'start'
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

export default function ShopPage() {
  const auth = useAuth();
  const account = auth?.account;
  const navigate = useNavigate();
  const location = useLocation();
  const { categories = [] } = useOutletContext() || {};
  const [params] = useSearchParams();

  const [promos, setPromos] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [bestSellers, setBestSellers] = useState([]);
  const [newest, setNewest] = useState([]);

  // Link cũ dạng /?q=... hoặc /?category=... -> chuyển sang trang danh sách sản phẩm
  const legacyQuery = params.get('q');
  const legacyCategory = params.get('category');
  useEffect(() => {
    if (legacyQuery) navigate(`/shop/category/all?q=${encodeURIComponent(legacyQuery)}`, { replace: true });
    else if (legacyCategory) navigate(`/shop/category/${legacyCategory}`, { replace: true });
  }, [legacyQuery, legacyCategory, navigate]);

  useEffect(() => {
    api('/shop/promotions?size=20')
      .then((d) => setPromos(d.items || []))
      .catch(() => setPromos([]));
    api(`/shop/products?page=0&size=${SHELF_SIZE}&sort=newest`)
      .then((d) => setNewest(d.items || []))
      .catch(() => setNewest([]));
    // Cần backend hỗ trợ sort=best_selling (xếp theo số lượng đã bán). Lỗi thì ẩn khối này.
    api(`/shop/products?page=0&size=${SHELF_SIZE}&sort=best_selling`)
      .then((d) => setBestSellers(d.items || []))
      .catch(() => setBestSellers([]));
  }, []);

  useEffect(() => {
    if (!account) return;
    getPromotions()
      .then((d) => setVouchers(Array.isArray(d) ? d : d?.data || []))
      .catch(() => setVouchers([]));
  }, [account]);

  const promoMap = useMemo(() => new Map(promos.map((p) => [p.productId, p])), [promos]);

  // Link dạng /#moi, /#ban-chay, /#uu-dai (từ header/footer): cuộn tới khối tương ứng khi khối đã hiện
  const hash = location.hash.slice(1);
  useEffect(() => {
    if (!hash) return undefined;
    const timer = setTimeout(() => scrollToId(hash), 50);
    return () => clearTimeout(timer);
  }, [hash, location.key, promos.length, newest.length, bestSellers.length]);

  // Bấm danh mục: mở trang riêng của danh mục đó
  const pickCategory = (id) => navigate(`/shop/category/${id}`);

  return (
    <>
      <ShopBanner />
      <Categories categories={categories} onPick={pickCategory} />
      <ProductShelf id="ban-chay" title="Hàng bán chạy" items={bestSellers} promoMap={promoMap} moreTo="/shop/best-sellers" />
      <ProductShelf id="moi" title="Hàng mới về" items={newest} promoMap={promoMap} moreTo="/shop/new-arrivals" />
      <PromoBanner promos={promos} vouchers={vouchers} />
      <Benefits />

      {account?.role === 'CUSTOMER' && <PendingCartHandler />}
    </>
  );
}
