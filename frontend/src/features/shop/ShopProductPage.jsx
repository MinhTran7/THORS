import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Chip, Typography } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import { brand } from 'features/account/tokens';
import { buyNow as goBuyNow, stashBuyNow } from 'features/cart/checkout';
import { useCrumbs } from 'layouts/crumbs';
import { api, post } from 'services/http';
import { Photo, ShopHeader, money, priceText } from './ShopCommon';
import PendingCartHandler from './PendingCartHandler';
import { savePending } from './pendingCart';

/** Trang chi tiết sản phẩm công khai: /shop/products/:productId */
export default function ShopProductPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const account = auth?.account;

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [qty, setQty] = useState(1);
  const [needLogin, setNeedLogin] = useState(''); // '' | 'cart' | 'buy'
  const [loadError, setLoadError] = useState('');

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
    api(`/shop/products/${productId}`)
      .then(setData)
      .catch((e) => setLoadError(e.message));
  }, [productId]);

  const variants = data?.variants ?? [];
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
      variantId: variant.detailId,
      productName: data.product.productName,
      imageUrl: data.images?.[0],
      size: variant.size,
      color: variant.color,
      unitPrice: variant.price,
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
    bgcolor: selected ? brand.cyan : 'transparent',
    border: `1px solid ${selected ? brand.cyan : brand.line}`
  });

  return (
    <Box sx={{ minHeight: account ? 'auto' : '100vh', bgcolor: account ? 'transparent' : brand.page }}>
      <ShopHeader account={account} onSearch={(q) => navigate(q ? `/?q=${encodeURIComponent(q)}` : '/')} />

      <Box sx={{ maxWidth: 1240, mx: 'auto', px: account ? 0 : { xs: 2, md: 4 }, py: account ? 0 : 3 }}>
        <Box component="nav" aria-label="Breadcrumb" sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', fontSize: 13, color: brand.muted, mb: 2 }}>
          <Box component={RouterLink} to="/" sx={{ color: brand.muted, textDecoration: 'none', '&:hover': { color: brand.ink } }}>
            Trang chủ
          </Box>
          {data && (
            <>
              <span>/</span>
              <span>{data.product.categoryName}</span>
              <span>/</span>
              <Box component="span" sx={{ color: brand.ink, fontWeight: 600 }}>
                {data.product.productName}
              </Box>
            </>
          )}
        </Box>

        {!data && !loadError && <Typography sx={{ color: brand.muted }}>Đang tải sản phẩm...</Typography>}
        {loadError && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h5" sx={{ mb: 1 }}>
              Không tìm thấy sản phẩm
            </Typography>
            <Typography variant="body2" sx={{ color: brand.muted, mb: 2 }}>
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
              border: `1px solid ${brand.line}`,
              borderRadius: '14px',
              p: { xs: 2, md: 3 },
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 5fr) minmax(0, 6fr)' },
              gap: { xs: 3, md: 4 }
            }}
          >
            <Box>
              <Photo src={data.images[imageIndex]} name={data.product.productName} sx={{ aspectRatio: '1', borderRadius: '12px' }} />
              <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                {data.images.map((url, i) => (
                  <Box
                    key={url}
                    component="img"
                    src={url}
                    alt=""
                    onClick={() => setImageIndex(i)}
                    sx={{
                      width: 64,
                      height: 64,
                      objectFit: 'cover',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      border: `2px solid ${i === imageIndex ? brand.cyan : 'transparent'}`
                    }}
                  />
                ))}
              </Box>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ color: brand.muted }}>
                {data.product.categoryName}
              </Typography>
              <Typography variant="h3" sx={{ color: brand.ink }}>
                {data.product.productName}
              </Typography>

              {data.product.description && (
                <Typography variant="body1" sx={{ color: brand.muted, mt: 1, whiteSpace: 'pre-line' }}>
                  {data.product.description}
                </Typography>
              )}

              <Typography sx={{ fontSize: 28, fontWeight: 700, color: '#27a9bd', mt: 2, mb: 2.5 }}>
                {variant
                  ? money(variant.price)
                  : priceText(Math.min(...variants.map((v) => v.price)), Math.max(...variants.map((v) => v.price)))}
              </Typography>

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Size
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                {sizes.map((s) => (
                  <Chip key={s} label={s} clickable disabled={sizeDisabled(s)} onClick={() => pick(size, setSize, s)} sx={chipSx(s === size)} />
                ))}
              </Box>

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Màu sắc
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                {colors.map((c) => (
                  <Chip key={c} label={c} clickable disabled={colorDisabled(c)} onClick={() => pick(color, setColor, c)} sx={chipSx(c === color)} />
                ))}
              </Box>

              {variant && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <Typography variant="subtitle2">Số lượng</Typography>
                  <Box sx={{ display: 'inline-flex', border: `1px solid ${brand.line}`, borderRadius: '10px', overflow: 'hidden' }}>
                    <Button onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1} sx={{ minWidth: 36 }}>
                      −
                    </Button>
                    <Box sx={{ minWidth: 40, display: 'grid', placeItems: 'center', fontWeight: 600 }}>{qty}</Box>
                    <Button onClick={() => setQty(Math.min(variant.stock, qty + 1))} disabled={qty >= variant.stock} sx={{ minWidth: 36 }}>
                      +
                    </Button>
                  </Box>
                  <Typography variant="caption" sx={{ color: brand.muted }}>
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
                <Typography variant="body2" sx={{ color: brand.muted }}>
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
      </Box>

      {isCustomer && <PendingCartHandler />}
    </Box>
  );
}
