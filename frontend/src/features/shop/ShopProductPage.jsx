import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, Chip, Typography } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import { buyNow as goBuyNow, stashBuyNow } from 'features/cart/checkout';
import { useCrumbs } from 'layouts/crumbs';
import { api, post } from 'services/http';
import { Photo, colorHex, isNewProduct, money, priceText } from './ShopCommon';
import PendingCartHandler from './PendingCartHandler';
import SizeAdvisor from 'features/fitting/SizeAdvisor';
import ShopProductDescription from './ShopProductDescription';
import { getImageColors, imagesForColor } from 'features/product/productDescription';
import { savePending } from './pendingCart';
import { C, SERIF } from './storeTheme';
import { ProductCard } from './ShopPage';

const RELATED_COUNT = 4; // số sản phẩm gợi ý ở cuối trang

// Giá sau khuyến mãi của một mức giá: khuyến mãi theo % thì trừ %, theo số tiền thì trừ đúng số tiền đó
function salePriceOf(price, promo) {
  if (!promo) return Number(price);
  const value = Number(promo.discountValue);
  const off = promo.discountType === 'PERCENT' ? Math.round((Number(price) * value) / 100) : value;
  return Math.max(0, Number(price) - off);
}

/** Trang chi tiết sản phẩm công khai: /shop/products/:productId */
export default function ShopProductPage() {
  const { productId } = useParams();
  // ?color=...&size=... (vd. bấm sản phẩm trong giỏ hàng): mở sẵn đúng phân loại
  const [searchParams] = useSearchParams();
  const wantColor = searchParams.get('color') || '';
  const wantSize = searchParams.get('size') || '';
  const navigate = useNavigate();
  const auth = useAuth();
  const account = auth?.account;

  const [data, setData] = useState(null);
  const [promos, setPromos] = useState([]); // các khuyến mãi đang chạy
  const [related, setRelated] = useState([]); // gợi ý: sản phẩm cùng danh mục
  const { categories = [] } = useOutletContext() || {};
  const promoMap = useMemo(() => new Map(promos.map((p) => [String(p.productId), p])), [promos]);
  const promo = promoMap.get(String(productId)) || null; // khuyến mãi đang áp dụng cho sản phẩm này (nếu có)
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [hoverColor, setHoverColor] = useState(''); // màu đang rê chuột (hiện tên cạnh chữ Màu sắc)
  const [qty, setQty] = useState(1);
  const [needLogin, setNeedLogin] = useState(''); // '' | 'cart' | 'buy'
  const [loadError, setLoadError] = useState('');

  // Chọn màu khác thì về ảnh đầu tiên của màu đó
  useEffect(() => setImageIndex(0), [color]);

  // Đường dẫn trên header chung (khi đã đăng nhập)
  useCrumbs(['Trang chủ', data?.product?.productName ?? 'Chi tiết sản phẩm']);

  useEffect(() => {
    setData(null);
    setLoadError('');
    setSize('');
    setColor('');
    setQty(1);
    setImageIndex(0);
    setNeedLogin('');
    setPromos([]);
    setRelated([]);
    api(`/shop/products/${productId}`)
      .then(setData)
      .catch((e) => setLoadError(e.message));
    // API chi tiết chưa trả khuyến mãi nên lấy từ danh sách khuyến mãi đang chạy
    api('/shop/promotions?size=100')
      .then((d) => setPromos(d.items || []))
      .catch(() => setPromos([]));
  }, [productId]);

  // Chọn sẵn màu / size theo đường dẫn khi đã tải xong sản phẩm
  useEffect(() => {
    const list = data?.variants || [];
    if (wantColor && list.some((v) => v.color === wantColor)) setColor(wantColor);
    if (wantSize && list.some((v) => v.size === wantSize && (!wantColor || v.color === wantColor))) setSize(wantSize);
  }, [data, wantColor, wantSize]);

  // "Có thể bạn sẽ thích": ưu tiên sản phẩm cùng danh mục (bỏ sản phẩm đang xem);
  // danh mục chưa đủ RELATED_COUNT sản phẩm thì lấy thêm sản phẩm mới nhất ở danh mục khác cho đủ.
  // API chi tiết có categoryId thì dùng luôn, không thì tìm theo tên danh mục.
  const categoryId =
    data?.product?.categoryId ?? categories.find((c) => c.categoryName === data?.product?.categoryName)?.categoryId ?? null;
  useEffect(() => {
    if (!data) return undefined;
    let alive = true;
    const fetchList = (extra) =>
      api(`/shop/products?${new URLSearchParams({ page: 0, size: RELATED_COUNT * 2, sort: 'newest', ...extra })}`)
        .then((d) => d.items || [])
        .catch(() => []);

    (async () => {
      const picked = [];
      const seen = new Set([String(productId)]);
      const add = (list) => {
        for (const p of list) {
          if (picked.length >= RELATED_COUNT) break;
          const id = String(p.productId);
          if (!seen.has(id)) {
            seen.add(id);
            picked.push(p);
          }
        }
      };
      if (categoryId) add(await fetchList({ categoryId }));
      if (picked.length < RELATED_COUNT) add(await fetchList({}));
      if (alive) setRelated(picked);
    })();

    return () => {
      alive = false;
    };
  }, [data, categoryId, productId]);

  const variants = data?.variants ?? [];
  const minPrice = variants.length ? Math.min(...variants.map((v) => Number(v.price))) : 0;
  const maxPrice = variants.length ? Math.max(...variants.map((v) => Number(v.price))) : 0;
  const sizes = [...new Set(variants.map((v) => v.size))];
  const colors = [...new Set(variants.map((v) => v.color))];
  const find = (s, c) => variants.find((v) => v.size === s && v.color === c);
  const variant = size && color ? find(size, color) : undefined;
  const sizeDisabled = (s) => !variants.some((v) => v.size === s && v.stock > 0 && (!color || v.color === color));
  const colorDisabled = (c) => !variants.some((v) => v.color === c && v.stock > 0 && (!size || v.size === size));
  const isCustomer = account?.role === 'CUSTOMER';

  const pick = (current, setter, value) => {
    setter(current === value ? '' : value);
    setQty(1);
    setError('');
    setNeedLogin('');
  };

  async function submit(buyNow) {
    setError('');
    setNotice('');
    if (!size || !color) {
      setError('Vui lòng chọn size và màu sắc trước.');
      return;
    }
    if (!variant) {
      setError('Phân loại này hiện không có.');
      return;
    }
    const item = {
      productId: Number(data?.product?.productId || productId),
      variantId: variant.detailId,
      productName: data.product.productName,
      imageUrl: shownImages[0] ?? data.images?.[0],
      size: variant.size,
      color: variant.color,
      unitPrice: variant.price,
      salePrice: salePriceOf(variant.price, promo),
      quantity: qty
    };

    if (!account) {
      if (buyNow) {
        // Mua ngay khi chưa đăng nhập: nhớ sản phẩm này, đăng nhập xong sẽ vào thẳng trang đặt hàng
        stashBuyNow(item);
      } else {
        // Thêm vào giỏ khi chưa đăng nhập: đăng nhập xong sẽ tự thêm (PendingCartHandler)
        savePending({
          detailId: variant.detailId,
          quantity: qty,
          buyNow: false,
          label: `${data.product.productName} (${variant.size} · ${variant.color})`
        });
      }
      setNeedLogin(buyNow ? 'buy' : 'cart');
      return;
    }

    if (buyNow) {
      // Mua ngay: sang thẳng trang đặt hàng với đúng sản phẩm này, không thêm vào giỏ hàng
      goBuyNow(navigate, item);
      return;
    }

    setBusy(true);
    try {
      await post('/cart/items', { detailId: variant.detailId, quantity: qty });
      window.dispatchEvent(new Event('thors:cart-changed'));
      setNotice('Đã thêm vào giỏ hàng.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Mua ngay: đăng nhập/đăng ký xong quay về trang đặt hàng; Thêm vào giỏ: về như cũ
  const authPath = (path) => (needLogin === 'buy' ? `${path}?returnTo=${encodeURIComponent('/checkout')}` : path);

  const chipSx = (selected) => ({
    bgcolor: selected ? C.primary : 'transparent',
    color: selected ? '#FFFFFF' : C.ink,
    border: `1px solid ${selected ? C.primary : C.line}`,
    '&:hover': { bgcolor: selected ? C.primaryDark : C.sand }
  });

  // Ảnh theo màu đang chọn (chủ shop gắn màu cho ảnh ở trang Sửa sản phẩm); màu chưa có ảnh riêng thì hiện tất cả
  const shownImages = data ? imagesForColor(data.images || [], getImageColors(data.product?.description), color) : [];

  return (
    // Header + footer do StorefrontLayout lo
    <Box>
      <Box sx={{ maxWidth: 1320, mx: 'auto', boxSizing: 'border-box', px: { xs: '16px', sm: '40px' }, pt: { xs: 2.5, md: 3 }, pb: { xs: 3, md: 5 } }}>
        {/* Khoảng cách trên (tới header) = khoảng cách dưới (tới nội dung) */}
        <Box component="nav" aria-label="Breadcrumb" sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', fontSize: 13, color: C.muted, mb: { xs: 2.5, md: 3 } }}>
          <Box component={RouterLink} to="/" sx={{ color: C.muted, textDecoration: 'none', '&:hover': { color: C.ink } }}>
            Trang chủ
          </Box>
          {data && (
            <>
              <span>/</span>
              {categoryId ? (
                <Box
                  component={RouterLink}
                  to={`/shop/category/${categoryId}`}
                  sx={{ color: C.muted, textDecoration: 'none', '&:hover': { color: C.ink } }}
                >
                  {data.product.categoryName}
                </Box>
              ) : (
                <span>{data.product.categoryName}</span>
              )}
              <span>/</span>
              <Box component="span" sx={{ color: C.ink, fontWeight: 600 }}>
                {data.product.productName}
              </Box>
            </>
          )}
        </Box>

        {!data && !loadError && <Typography sx={{ color: C.muted }}>Đang tải sản phẩm...</Typography>}
        {loadError && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h5" sx={{ mb: 1 }}>
              Không tìm thấy sản phẩm
            </Typography>
            <Typography variant="body2" sx={{ color: C.muted, mb: 2 }}>
              Sản phẩm không tồn tại hoặc hiện không được bán online.
            </Typography>
            <Button variant="contained" component={RouterLink} to="/">
              Về trang chủ
            </Button>
          </Box>
        )}

        {data && (
          <Box
            sx={{
              bgcolor: '#fff',
              border: `1px solid ${C.line}`,
              borderRadius: '14px',
              p: { xs: 2, md: 3 },
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 5fr) minmax(0, 6fr)' },
              gap: { xs: 3, md: 4 }
            }}
          >
            <Box>
              <Box sx={{ position: 'relative' }}>
                {/* Khung cố định 4:5, ảnh hiện trọn (contain) nên ảnh ngang, dọc hay vuông đều không bị cắt */}
                {shownImages[imageIndex] ? (
                  <Box
                    sx={{
                      aspectRatio: '4 / 5',
                      borderRadius: '12px',
                      bgcolor: '#F5F3F0',
                      overflow: 'hidden',
                      position: 'relative'
                    }}
                  >
                    <Box
                      component="img"
                      src={shownImages[imageIndex]}
                      alt={data.product.productName}
                      sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                    />
                  </Box>
                ) : (
                  <Photo name={data.product.productName} sx={{ aspectRatio: '4 / 5', borderRadius: '12px' }} />
                )}
                {isNewProduct(data.product) && (
                  <Box
                    component="span"
                    sx={{ position: 'absolute', top: 16, left: 16, bgcolor: '#FFFFFF', color: C.ink, fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', px: 1.25, py: 0.5, lineHeight: 1.4 }}
                  >
                    MỚI
                  </Box>
                )}
                {promo && (
                  <Box
                    component="span"
                    sx={{ position: 'absolute', top: 16, right: 16, bgcolor: C.accent, color: '#FFFFFF', fontSize: 16, fontWeight: 700, px: 1.25, py: 0.5, lineHeight: 1.4 }}
                  >
                    {promo.discountLabel}
                  </Box>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                {shownImages.map((url, i) => (
                  <Box
                    key={url}
                    component="button"
                    type="button"
                    aria-label={`Xem ảnh ${i + 1}`}
                    aria-pressed={i === imageIndex}
                    onClick={() => setImageIndex(i)}
                    sx={{
                      width: 64,
                      height: 80,
                      p: 0,
                      bgcolor: '#F5F3F0',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      position: 'relative',
                      cursor: 'pointer',
                      border: `2px solid ${i === imageIndex ? C.primary : 'transparent'}`
                    }}
                  >
                    <Box component="img" src={url} alt="" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
                  </Box>
                ))}
              </Box>
            </Box>

            <Box>
              {/* Tên danh mục: bấm để về trang danh mục đó */}
              <Typography
                variant="caption"
                {...(categoryId ? { component: RouterLink, to: `/shop/category/${categoryId}` } : {})}
                sx={{ color: C.muted, textDecoration: 'none', '&:hover': { color: categoryId ? C.ink : C.muted } }}
              >
                {data.product.categoryName}
              </Typography>
              <Typography variant="h3" sx={{ color: C.ink }}>
                {data.product.productName}
              </Typography>

              {/* Có khuyến mãi: giá gốc gạch ngang màu xám, giá sau giảm màu đỏ */}
              <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1.5, mt: 2, mb: 2.5 }}>
                {promo && (
                  <Typography component="span" sx={{ fontSize: 20, color: '#8C857B', textDecoration: 'line-through' }}>
                    {variant ? money(variant.price) : priceText(minPrice, maxPrice)}
                  </Typography>
                )}
                <Typography component="span" sx={{ fontSize: 28, fontWeight: 700, color: promo ? C.accent : C.ink }}>
                  {variant ? money(salePriceOf(variant.price, promo)) : priceText(salePriceOf(minPrice, promo), salePriceOf(maxPrice, promo))}
                </Typography>
              </Box>

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Size
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                {sizes.map((s) => (
                  <Chip key={s} label={s} clickable disabled={sizeDisabled(s)} onClick={() => pick(size, setSize, s)} sx={chipSx(s === size)} />
                ))}
              </Box>

              {/* Gợi ý size theo số đo khách (module fitting); sản phẩm chưa có bảng size thì không hiện */}
              <SizeAdvisor
                productId={productId}
                selectedSize={size}
                isCustomer={isCustomer}
                isLoggedIn={Boolean(account)}
                onChoose={(s) => {
                  setSize(s);
                  if (color && !variants.some((v) => v.size === s && v.color === color && v.stock > 0)) setColor('');
                  setQty(1);
                  setError('');
                }}
              />
              {/* Màu sắc dạng chấm tròn: rê chuột / chọn để xem tên màu, chọn màu thì ảnh đổi sang ảnh của màu đó */}
              <Typography variant="subtitle2" sx={{ mb: 1.25 }}>
                Màu sắc
                {(hoverColor || color) && (
                  <Box component="span" sx={{ fontWeight: 400, color: C.muted }}>
                    : {hoverColor || color}
                  </Box>
                )}
              </Typography>
              <Box role="radiogroup" aria-label="Màu sắc" sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2.5 }}>
                {colors.map((c) => {
                  const selected = c === color;
                  const disabled = colorDisabled(c);
                  const hex = colorHex(c) || '#D6D2CC';
                  const light = ['#FFFFFF', '#F3EAD8', '#E3D3B5', '#F8C8D4', '#C9C9C9'].includes(hex.toUpperCase());
                  return (
                    <Box
                      key={c}
                      component="button"
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={disabled ? `${c} (hết hàng)` : c}
                      title={disabled ? `${c} — hết hàng` : c}
                      disabled={disabled}
                      onClick={() => pick(color, setColor, c)}
                      onMouseEnter={() => setHoverColor(c)}
                      onMouseLeave={() => setHoverColor('')}
                      onFocus={() => setHoverColor(c)}
                      onBlur={() => setHoverColor('')}
                      sx={{
                        position: 'relative',
                        width: 44,
                        height: 44,
                        p: 0,
                        borderRadius: '50%',
                        bgcolor: hex,
                        // Vòng ngoài: màu đang chọn có viền đen dày cách 3px; màu sáng có viền mảnh để thấy được trên nền trắng
                        border: light ? `1px solid ${C.line}` : '1px solid transparent',
                        boxShadow: selected ? `0 0 0 3px #FFFFFF, 0 0 0 5px ${C.ink}` : 'none',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.45 : 1,
                        transition: 'box-shadow .15s',
                        '&:hover:not(:disabled)': { boxShadow: selected ? `0 0 0 3px #FFFFFF, 0 0 0 5px ${C.ink}` : `0 0 0 3px #FFFFFF, 0 0 0 4px ${C.muted}` },
                        '&:focus-visible': { outline: `2px solid ${C.accent}`, outlineOffset: 6 },
                        // Hết hàng: gạch chéo
                        ...(disabled && {
                          '&::after': {
                            content: '""',
                            position: 'absolute',
                            left: '50%',
                            top: 4,
                            bottom: 4,
                            width: 1.5,
                            bgcolor: light ? C.muted : '#FFFFFF',
                            transform: 'translateX(-50%) rotate(45deg)'
                          }
                        })
                      }}
                    />
                  );
                })}
              </Box>

              {variant && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <Typography variant="subtitle2">Số lượng</Typography>
                  <Box sx={{ display: 'inline-flex', border: `1px solid ${C.line}`, overflow: 'hidden' }}>
                    <Button onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1} sx={{ minWidth: 36 }}>
                      −
                    </Button>
                    <Box sx={{ minWidth: 40, display: 'grid', placeItems: 'center', fontWeight: 600 }}>{qty}</Box>
                    <Button onClick={() => setQty(Math.min(variant.stock, qty + 1))} disabled={qty >= variant.stock} sx={{ minWidth: 36 }}>
                      +
                    </Button>
                  </Box>
                  <Typography variant="caption" sx={{ color: C.muted }}>
                    Còn {variant.stock} sản phẩm
                  </Typography>
                </Box>
              )}

              {error && (
                <Typography color="error" variant="body2" sx={{ mb: 1 }}>
                  {error}
                </Typography>
              )}
              {notice && (
                <Typography variant="body2" sx={{ mb: 1, color: '#1a7f4b' }}>
                  {notice}
                </Typography>
              )}

              {isCustomer || !account ? (
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  <Button variant="outlined" size="large" disabled={busy} onClick={() => submit(false)}>
                    Thêm vào giỏ hàng
                  </Button>
                  <Button variant="contained" size="large" disabled={busy} onClick={() => submit(true)}>
                    Mua ngay
                  </Button>
                </Box>
              ) : (
                <Typography variant="body2" sx={{ color: C.muted }}>
                  Chỉ tài khoản khách hàng mới mua được.
                </Typography>
              )}

              {needLogin && (
                <Box sx={{ mt: 2, p: 1.5, bgcolor: '#fff4c4', border: '1px solid #efe3a0', borderRadius: '10px', maxWidth: 520 }}>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {needLogin === 'buy'
                      ? 'Hãy đăng nhập hoặc đăng ký để đặt hàng. Xong bước này, bạn sẽ được chuyển thẳng tới trang đặt hàng với sản phẩm vừa chọn.'
                      : 'Hãy đăng nhập hoặc đăng ký để tiếp tục. Xong bước này, sản phẩm bạn vừa chọn sẽ được thêm vào giỏ hàng.'}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="contained" size="small" onClick={() => navigate(authPath('/register'))}>
                      Đăng ký
                    </Button>
                    <Button variant="outlined" size="small" onClick={() => navigate(authPath('/login'))}>
                      Đăng nhập
                    </Button>
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        )}

        {/* Mô tả sản phẩm: nằm dưới khung thông tin chung (Mô tả, Chất liệu & kiểu dáng, Bảo quản, Đổi trả) */}
        {data?.product.description && <ShopProductDescription description={data.product.description} />}

        {/* Gợi ý sản phẩm cùng danh mục */}
        {related.length > 0 && (
          <Box component="section" sx={{ mt: { xs: 6, md: 9 } }}>
            <Typography component="h2" sx={{ fontFamily: SERIF, fontWeight: 700, fontSize: { xs: 28, md: 36 }, color: C.ink, mb: { xs: 3, md: 4 } }}>
              Có thể bạn sẽ thích
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gap: { xs: '24px 12px', sm: '32px 20px' },
                gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${RELATED_COUNT}, minmax(0, 1fr))` }
              }}
            >
              {related.map((p) => (
                <ProductCard key={p.productId} product={p} promo={promoMap.get(String(p.productId))} />
              ))}
            </Box>
          </Box>
        )}
      </Box>

      {isCustomer && <PendingCartHandler />}
    </Box>
  );
}
