import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box } from '@mui/material';
import { api } from 'services/http';
import heroImage from 'assets/images/auth/boutique-shopping.png';
import { money, priceText } from './ShopCommon';
import { C, SERIF, Icon, btnSx, container, eyebrowSx, focusRing, iconBtnSx } from './storeTheme';

/**
 * Banner lớn đầu trang chủ. Tự chuyển slide mỗi 5 giây, xen kẽ:
 *   hàng mới về -> hàng đang khuyến mãi -> hàng mới về -> ...
 * Dữ liệu: GET /api/shop/products?sort=newest và GET /api/shop/promotions.
 * Nếu chưa có khuyến mãi nào, banner chỉ chạy các slide hàng mới về.
 * Chưa có sản phẩm nào (hoặc đang tải) thì hiện banner giới thiệu cửa hàng.
 * Rê chuột hoặc focus vào banner thì tạm dừng; người dùng bật "giảm chuyển động" thì không tự chạy.
 */

const PER_KIND = 4; // số sản phẩm tối đa mỗi loại
const INTERVAL_MS = 5000;
const HEIGHT = { xs: 660, md: 600 };

// Mỗi loại slide một tông màu
const THEME = {
  new: { bg: C.sand, text: C.ink, sub: '#3F3A34', eyebrow: '#5A544C', tag: 'Hàng mới về', mainBtn: 'dark' },
  promo: { bg: C.accent, text: '#FFFFFF', sub: 'rgba(255,255,255,.85)', eyebrow: 'rgba(255,255,255,.85)', tag: 'Đang khuyến mãi', mainBtn: 'light' }
};

function interleave(a, b) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

function SlideFrame({ kind, active, children, image }) {
  return (
    <Box
      aria-hidden={!active}
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        bgcolor: THEME[kind].bg,
        color: THEME[kind].text,
        opacity: active ? 1 : 0,
        visibility: active ? 'visible' : 'hidden',
        transition: 'opacity .6s ease, visibility .6s',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' }
      }}
    >
      <Box
        sx={{
          flex: { xs: '0 0 auto', md: '1 1 0' },
          minWidth: 0,
          p: { xs: '32px 24px', md: '72px 56px' },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: { xs: 2, md: 3 }
        }}
      >
        {children}
      </Box>
      <Box sx={{ flex: { xs: '1 1 0', md: '1.15 1 0' }, minHeight: 0, position: 'relative', overflow: 'hidden', bgcolor: kind === 'promo' ? '#3A1212' : '#CFC6BA' }}>
        {image}
      </Box>
    </Box>
  );
}

function SlideImage({ src, name, kind }) {
  if (src) {
    return <Box component="img" src={src} alt={name} sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
      <Box component="span" sx={{ fontFamily: SERIF, fontSize: 120, color: kind === 'promo' ? 'rgba(255,255,255,.3)' : 'rgba(17,17,17,.25)' }}>
        {name?.charAt(0)}
      </Box>
    </Box>
  );
}

const titleSx = {
  m: 0,
  fontFamily: SERIF,
  fontWeight: 400,
  fontSize: { xs: 34, sm: 44, md: 'clamp(44px, 5vw, 64px)' },
  lineHeight: 1.08,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden'
};

// Banner giới thiệu khi chưa có sản phẩm để chạy slide
function IntroSlide() {
  return (
    <SlideFrame kind="new" active image={<Box component="img" src={heroImage} alt="" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}>
      <Box component="p" sx={{ ...eyebrowSx, color: THEME.new.eyebrow }}>
        Bộ sưu tập mới
      </Box>
      <Box component="h1" sx={{ ...titleSx, fontSize: 'clamp(44px, 6vw, 72px)', WebkitLineClamp: 'unset' }}>
        Mặc chậm.
        <br />
        <em>Mặc lâu.</em>
      </Box>
      <Box component="p" sx={{ m: 0, fontSize: 17, lineHeight: 1.6, color: THEME.new.sub, maxWidth: 420 }}>
        Những thiết kế tối giản, chất liệu bền đẹp — để tủ đồ của bạn ít hơn nhưng đúng hơn.
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1 }}>
        <Box component={RouterLink} to="/shop/category/all" sx={btnSx('dark')}>
          MUA NGAY
        </Box>
      </Box>
    </SlideFrame>
  );
}

function ProductSlide({ p, active }) {
  const theme = THEME[p.kind];
  const tab = active ? 0 : -1;
  return (
    <SlideFrame kind={p.kind} active={active} image={<SlideImage src={p.imageUrl} name={p.productName} kind={p.kind} />}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Box component="p" sx={{ ...eyebrowSx, color: theme.eyebrow }}>
          {theme.tag}
        </Box>
        {p.kind === 'promo' && (
          <Box component="span" sx={{ bgcolor: '#FFFFFF', color: C.accent, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', px: 1, py: '4px' }}>
            {p.discountLabel}
          </Box>
        )}
      </Box>

      <Box component="h2" sx={titleSx}>
        {p.productName}
      </Box>

      {p.kind === 'promo' ? (
        <>
          {p.promotionName && (
            <Box component="p" sx={{ m: 0, fontSize: 16, color: theme.sub }}>
              {p.promotionName}
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
            <Box component="span" sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 600 }}>
              {Number(p.maxPrice) > Number(p.minPrice) ? 'Từ ' : ''}
              {money(p.salePrice)}
            </Box>
            <Box component="span" sx={{ fontSize: { xs: 16, md: 18 }, color: theme.sub, textDecoration: 'line-through' }}>
              {money(p.minPrice)}
            </Box>
          </Box>
        </>
      ) : (
        <Box component="span" sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 600 }}>
          {priceText(p.minPrice, p.maxPrice)}
        </Box>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1 }}>
        {/* Mua ngay: mở trang sản phẩm để khách chọn size, màu rồi đặt hàng */}
        <Box component={RouterLink} to={`/shop/products/${p.productId}`} tabIndex={tab} sx={btnSx(theme.mainBtn)}>
          MUA NGAY
        </Box>
      </Box>
    </SlideFrame>
  );
}

const arrowSx = (dark) => ({
  ...iconBtnSx,
  border: `1px solid ${C.ink}`,
  bgcolor: dark ? C.ink : '#FFFFFF',
  color: dark ? '#FFFFFF' : C.ink,
  '&:hover': { opacity: 0.85 }
});

export default function ShopBanner() {
  const [slides, setSlides] = useState([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api(`/shop/products?page=0&size=${PER_KIND}&sort=newest`).then((d) => d.items || []).catch(() => []),
      api(`/shop/promotions?size=${PER_KIND}`).then((d) => d.items || []).catch(() => [])
    ]).then(([news, promos]) => {
      if (!alive) return;
      const promoIds = new Set(promos.map((p) => p.productId));
      const newSlides = news.filter((p) => !promoIds.has(p.productId)).map((p) => ({ ...p, kind: 'new' }));
      const promoSlides = promos.map((p) => ({ ...p, kind: 'promo' }));
      setSlides(interleave(newSlides, promoSlides));
      setIndex(0);
    });
    return () => {
      alive = false;
    };
  }, []);

  const count = slides.length;

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (count < 2 || paused || reduce) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [count, paused, index]); // phụ thuộc index: bấm mũi tên/chấm thì đếm lại 5 giây

  const go = (delta) => setIndex((i) => (i + delta + count) % count);

  return (
    <Box
      component="section"
      aria-roledescription="carousel"
      aria-label="Hàng mới về và khuyến mãi"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
      }}
      sx={{ ...container, pt: 4 }}
    >
      <Box sx={{ position: 'relative', height: HEIGHT, overflow: 'hidden' }}>
        {count === 0 ? <IntroSlide /> : slides.map((p, i) => <ProductSlide key={`${p.kind}-${p.productId}`} p={p} active={i === index} />)}
      </Box>

      {count > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {slides.map((p, i) => (
              <Box
                key={`${p.kind}-${p.productId}`}
                component="button"
                type="button"
                aria-label={`Slide ${i + 1}: ${p.productName}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                sx={{
                  width: 32,
                  height: 24,
                  p: 0,
                  border: 0,
                  bgcolor: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  ...focusRing,
                  '&::before': {
                    content: '""',
                    display: 'block',
                    width: '100%',
                    height: 2,
                    bgcolor: i === index ? C.ink : '#CFCAC2',
                    transition: 'background-color .25s'
                  }
                }}
              />
            ))}
            <Box component="span" sx={{ ml: 1, fontSize: 13, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
              {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Box component="button" type="button" aria-label="Slide trước" onClick={() => go(-1)} sx={arrowSx(false)}>
              <Icon size={18}>
                <path d="M15 5l-7 7 7 7" />
              </Icon>
            </Box>
            <Box component="button" type="button" aria-label="Slide sau" onClick={() => go(1)} sx={arrowSx(true)}>
              <Icon size={18}>
                <path d="M9 5l7 7-7 7" />
              </Icon>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
