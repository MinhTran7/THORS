import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Chip, IconButton, Typography } from '@mui/material';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { brand } from 'features/account/tokens';
import { api } from 'services/http';
import { Photo, money, priceText } from './ShopCommon';

/**
 * Banner tràn hai bên đầu trang chủ. Tự chuyển slide mỗi 5 giây, xen kẽ:
 *   hàng mới về -> hàng đang khuyến mãi -> hàng mới về -> ...
 * Dữ liệu: GET /api/shop/products?sort=newest và GET /api/shop/promotions.
 * Nếu chưa có khuyến mãi nào, banner chỉ chạy các slide hàng mới về.
 */

const PER_KIND = 4; // số sản phẩm tối đa mỗi loại
const INTERVAL_MS = 5000;
const MAX_WIDTH = 1480; // khung nội dung bên trong banner (phải bằng với các trang cửa hàng khác)
const HEIGHT = { xs: 270, md: 380 };

const THEME = {
  new: { bg: `linear-gradient(110deg, ${brand.cyanSoft} 0%, #ffffff 100%)`, tag: 'HÀNG MỚI VỀ', tagBg: brand.ink },
  promo: { bg: 'linear-gradient(110deg, #ffe0ec 0%, #fff6fa 100%)', tag: 'KHUYẾN MÃI', tagBg: '#d6453d' }
};

function interleave(a, b) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

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

  const slideSx = (active, kind) => ({
    position: 'absolute',
    inset: 0,
    background: THEME[kind]?.bg ?? THEME.new.bg,
    opacity: active ? 1 : 0,
    pointerEvents: active ? 'auto' : 'none',
    transition: 'opacity .6s ease'
  });

  const innerSx = {
    maxWidth: MAX_WIDTH,
    mx: 'auto',
    boxSizing: 'border-box',
    height: '100%',
    px: { xs: '16px', md: '32px' },
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 3
  };

  const arrowSx = (side) => ({
    position: 'absolute',
    [side]: { xs: 4, md: 16 },
    top: '50%',
    transform: 'translateY(-50%)',
    bgcolor: 'rgba(255,255,255,.8)',
    '&:hover': { bgcolor: '#fff' }
  });

  return (
    <Box
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      sx={{ position: 'relative', width: '100%', height: HEIGHT, overflow: 'hidden', borderBottom: `1px solid ${brand.line}` }}
      aria-roledescription="carousel"
      aria-label="Hàng mới về và khuyến mãi"
    >
      {count === 0 ? (
        <Box sx={slideSx(true, 'new')}>
          <Box sx={innerSx}>
            <Box>
              <Typography sx={{ fontSize: { xs: 24, md: 40 }, fontWeight: 800, color: brand.ink, lineHeight: 1.2 }}>
                Chào mừng đến THORS
              </Typography>
              <Typography sx={{ mt: 1, color: brand.muted }}>Thời trang đẹp, giao tận nhà.</Typography>
            </Box>
          </Box>
        </Box>
      ) : (
        slides.map((p, i) => {
          const active = i === index;
          const theme = THEME[p.kind];
          return (
            <Box key={`${p.kind}-${p.productId}`} sx={slideSx(active, p.kind)} aria-hidden={!active}>
              <Box sx={innerSx}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }}>
                    <Chip label={theme.tag} size="small" sx={{ bgcolor: theme.tagBg, color: '#fff', fontWeight: 700, letterSpacing: 0.5 }} />
                    {p.kind === 'promo' && (
                      <Chip label={`Giảm ${p.discountLabel.replace('-', '')}`} size="small" sx={{ bgcolor: '#fff', color: '#d6453d', fontWeight: 800, border: '1px solid #d6453d' }} />
                    )}
                  </Box>
                  <Typography
                    sx={{
                      fontSize: { xs: 22, md: 38 },
                      fontWeight: 800,
                      lineHeight: 1.2,
                      color: brand.ink,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                  >
                    {p.productName}
                  </Typography>

                  {p.kind === 'promo' ? (
                    <>
                      <Typography sx={{ mt: 0.5, fontSize: 14, color: brand.muted }}>{p.promotionName}</Typography>
                      <Box sx={{ mt: 1, display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: { xs: 20, md: 30 }, fontWeight: 800, color: '#d6453d' }}>
                          {Number(p.maxPrice) > Number(p.minPrice) ? 'Từ ' : ''}
                          {money(p.salePrice)}
                        </Typography>
                        <Typography sx={{ fontSize: { xs: 14, md: 18 }, color: brand.muted, textDecoration: 'line-through' }}>
                          {money(p.minPrice)}
                        </Typography>
                      </Box>
                    </>
                  ) : (
                    <Typography sx={{ mt: 1, fontSize: { xs: 18, md: 26 }, fontWeight: 700, color: '#1b8ea1' }}>
                      {priceText(p.minPrice, p.maxPrice)}
                    </Typography>
                  )}

                  <Button
                    component={RouterLink}
                    to={`/shop/products/${p.productId}`}
                    variant="contained"
                    size="large"
                    tabIndex={active ? 0 : -1}
                    sx={{ mt: 2.5 }}
                  >
                    Xem ngay
                  </Button>
                </Box>
                <Photo
                  src={p.imageUrl}
                  name={p.productName}
                  sx={{ width: { xs: 120, md: 300 }, height: { xs: 120, md: 300 }, borderRadius: '18px', flexShrink: 0 }}
                />
              </Box>
            </Box>
          );
        })
      )}

      {count > 1 && (
        <>
          <IconButton aria-label="Slide trước" onClick={() => go(-1)} sx={arrowSx('left')}>
            <LeftOutlined />
          </IconButton>
          <IconButton aria-label="Slide sau" onClick={() => go(1)} sx={arrowSx('right')}>
            <RightOutlined />
          </IconButton>
          <Box sx={{ position: 'absolute', bottom: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 0.75 }}>
            {slides.map((p, i) => (
              <Box
                key={`${p.kind}-${p.productId}`}
                component="button"
                type="button"
                aria-label={`Slide ${i + 1}`}
                onClick={() => setIndex(i)}
                sx={{
                  width: i === index ? 24 : 8,
                  height: 8,
                  p: 0,
                  border: 0,
                  borderRadius: 4,
                  cursor: 'pointer',
                  bgcolor: i === index ? brand.ink : 'rgba(22,34,46,.25)',
                  transition: 'width .25s'
                }}
              />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
