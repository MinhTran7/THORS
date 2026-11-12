import { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, Dialog, IconButton, Typography } from '@mui/material';
import { CloseOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { getProductById } from '../../services/productService';
import { api } from '../../services/http';

const num = (value) => Number(value || 0).toLocaleString('vi-VN');
const money = (value) => (value == null ? '—' : `${num(value)} đ`);
const columns = { xs: '1.5fr 1fr 0.8fr', md: '1.4fr 1.2fr 1fr 0.6fr 0.8fr 1.8fr' };
const label = { fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 };
const desktopOnly = { display: { xs: 'none', md: 'block' } };

function Tag({ children, bg = '#F1F5F9', color = '#475569' }) {
  return (
    <Box component="span" sx={{ px: 1, py: 0.25, borderRadius: 10, bgcolor: bg, color, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {children}
    </Box>
  );
}

function Stat({ title, value }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: '#F8FAFC', border: '1px solid #EEF2F6' }}>
      <Typography sx={label}>{title}</Typography>
      <Typography sx={{ fontSize: 20, fontWeight: 800, mt: 0.25 }}>{value}</Typography>
    </Box>
  );
}

export default function ProductInfoDialog({ line, onClose }) {
  const [data, setData] = useState(null);
  const [stocks, setStocks] = useState({});
  const [imageIndex, setImageIndex] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!line) return undefined;
    let active = true;
    setData(null);
    setStocks({});
    setImageIndex(0);
    setError('');
    getProductById(line.productId)
      .then(async (res) => {
        if (!active) return;
        setData(res);
        const results = await Promise.allSettled(res.variants.map((v) => api(`/warehouse/inventory/${v.detailId}`)));
        if (active) setStocks(Object.fromEntries(res.variants.map((v, i) => [v.detailId, results[i].value])));
      })
      .catch((err) => active && setError(err.message || 'Không thể tải thông tin sản phẩm.'));
    return () => {
      active = false;
    };
  }, [line]);

  const product = data?.product;
  const variants = data?.variants || [];
  const images = data?.images?.length ? data.images.map((i) => i.imageUrl) : [line?.image].filter(Boolean);
  const prices = variants.map((v) => v.price).filter((p) => p != null).map(Number);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const totalStock = product?.totalStock ?? variants.reduce((sum, v) => sum + Number(v.stockQuantity || 0), 0);
  const isActive = product?.status === 'ACTIVE';

  return (
    <Dialog
      open={Boolean(line)}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      slotProps={{ paper: { sx: { borderRadius: 4, m: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' } } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', px: { xs: 2.25, sm: 3 }, py: 1.75, borderBottom: '1px solid #EEF2F6' }}>
        <Typography sx={{ fontSize: 15.5, fontWeight: 800, color: '#0F172A' }}>Thông tin sản phẩm</Typography>
        <IconButton onClick={onClose} size="small" sx={{ ml: 'auto', color: '#64748B' }}>
          <CloseOutlined />
        </IconButton>
      </Box>

      <Box sx={{ p: { xs: 2.25, sm: 3 }, overflowY: 'auto', color: '#0F172A' }}>
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : !product ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <CircularProgress size={28} sx={{ color: '#8EECF5' }} />
          </Box>
        ) : (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '240px 1fr' }, gap: 3 }}>
              <Box>
                <Box
                  sx={{
                    aspectRatio: '1',
                    borderRadius: 3,
                    bgcolor: '#F8FAFC',
                    border: '1px solid #EEF2F6',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {images.length ? (
                    <Box component="img" src={images[imageIndex]} alt={product.productName} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <ShoppingCartOutlined style={{ fontSize: 36, color: '#CBD5E1' }} />
                  )}
                </Box>
                {images.length > 1 && (
                  <Box sx={{ display: 'flex', gap: 1, mt: 1.25, overflowX: 'auto', scrollbarWidth: 'none' }}>
                    {images.map((src, i) => (
                      <Box
                        key={src}
                        component="img"
                        src={src}
                        alt=""
                        onClick={() => setImageIndex(i)}
                        sx={{
                          width: 52,
                          height: 52,
                          flexShrink: 0,
                          borderRadius: 2,
                          objectFit: 'cover',
                          cursor: 'pointer',
                          opacity: i === imageIndex ? 1 : 0.6,
                          outline: i === imageIndex ? '2px solid #8EECF5' : 'none',
                          outlineOffset: 1
                        }}
                      />
                    ))}
                  </Box>
                )}
              </Box>

              <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  <Tag>{product.categoryName || 'Chưa phân loại'}</Tag>
                  <Tag bg={isActive ? '#DCFCE7' : '#FEE2E2'} color={isActive ? '#15803D' : '#B91C1C'}>
                    {isActive ? 'Đang bán' : 'Ngừng bán'}
                  </Tag>
                </Box>
                <Typography sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1.3, mt: 1.25 }}>{product.productName}</Typography>
                {product.sku && <Typography sx={{ fontSize: 12.5, color: '#94A3B8', mt: 0.25 }}>SKU: {product.sku}</Typography>}
                <Typography sx={{ fontSize: 24, fontWeight: 800, color: '#0E7490', mt: 1.5 }}>
                  {!prices.length ? 'Chưa có giá' : minPrice === maxPrice ? money(minPrice) : `${num(minPrice)} – ${money(maxPrice)}`}
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.25, mt: 2 }}>
                  <Stat title="Tổng tồn" value={num(totalStock)} />
                  <Stat title="Biến thể" value={variants.length} />
                </Box>
                <Box sx={{ mt: 2 }}>
                  <Typography sx={label}>Mô tả</Typography>
                  <Typography sx={{ fontSize: 13, color: '#475569', mt: 0.5, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                    {product.description || 'Chưa có mô tả cho sản phẩm này.'}
                  </Typography>
                </Box>
              </Box>
            </Box>

            <Typography sx={{ fontSize: 15, fontWeight: 800, mt: 3.5, mb: 1.25 }}>Biến thể & vị trí lưu kho</Typography>
            <Box sx={{ border: '1px solid #EEF2F6', borderRadius: 3, overflow: 'hidden' }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: columns, gap: 1.5, px: 2, py: 1.25, bgcolor: '#F8FAFC' }}>
                <Typography sx={label}>Biến thể</Typography>
                <Typography sx={{ ...label, ...desktopOnly }}>Mã vạch</Typography>
                <Typography sx={label}>Giá</Typography>
                <Typography sx={{ ...label, ...desktopOnly, textAlign: 'right' }}>Tồn</Typography>
                <Typography sx={{ ...label, textAlign: 'right' }}>Có thể bán</Typography>
                <Typography sx={{ ...label, ...desktopOnly }}>Vị trí</Typography>
              </Box>
              {variants.map((v) => {
                const stock = stocks[v.detailId];
                const available = Number(stock?.available_quantity ?? v.sellableQuantity ?? v.stockQuantity ?? 0);
                const current = v.detailId === line?.variantId;
                const locations = [
                  ...(stock?.location_rows || []).filter((l) => l.quantity > 0),
                  ...(stock?.unassigned_quantity > 0 ? [{ label: 'Chưa xếp', quantity: stock.unassigned_quantity, pending: true }] : [])
                ];
                return (
                  <Box
                    key={v.detailId}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: columns,
                      gap: 1.5,
                      alignItems: 'center',
                      px: 2,
                      py: 1.5,
                      borderTop: '1px solid #EEF2F6',
                      bgcolor: current ? '#F0FDFF' : 'transparent',
                      boxShadow: current ? 'inset 3px 0 0 #8EECF5' : 'none',
                      opacity: v.status === 'ACTIVE' ? 1 : 0.5
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                      <Box
                        sx={{
                          minWidth: 32,
                          height: 28,
                          px: 0.75,
                          borderRadius: 1.5,
                          border: '1px solid #E2E8F0',
                          bgcolor: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 800
                        }}
                      >
                        {v.size || '—'}
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {v.color || '—'}
                        </Typography>
                        {(current || v.status !== 'ACTIVE') && (
                          <Typography sx={{ fontSize: 11, fontWeight: 700, color: current ? '#0891B2' : '#B91C1C' }}>
                            {current ? 'Trong hóa đơn' : 'Ngừng bán'}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                    <Typography sx={{ ...desktopOnly, fontSize: 12.5, color: '#64748B', wordBreak: 'break-all' }}>{stock?.barcode || v.code || '—'}</Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{money(v.price)}</Typography>
                    <Typography sx={{ ...desktopOnly, fontSize: 13, textAlign: 'right' }}>{num(stock?.stock_quantity ?? v.stockQuantity)}</Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 800, textAlign: 'right', color: available > 0 ? '#0F172A' : '#EF4444' }}>
                      {num(available)}
                    </Typography>
                    <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {!stock ? (
                        <Typography sx={{ fontSize: 12.5, color: '#94A3B8' }}>—</Typography>
                      ) : locations.length ? (
                        locations.map((l) => (
                          <Tag key={l.label} bg={l.pending ? '#FEF3C7' : '#E0F7FA'} color={l.pending ? '#B45309' : '#0E7490'}>
                            {l.label} · {num(l.quantity)}
                          </Tag>
                        ))
                      ) : (
                        <Typography sx={{ fontSize: 12.5, color: '#94A3B8' }}>Hết hàng</Typography>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </>
        )}
      </Box>
    </Dialog>
  );
}
