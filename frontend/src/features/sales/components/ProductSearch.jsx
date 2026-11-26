import { useMemo, useState } from 'react';
import { Box, CircularProgress, ClickAwayListener, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import { ScanOutlined, SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { C } from '../theme';
import { getProductStock, priceRangeText } from '../utils';

// Ô tìm sản phẩm (tên, mã) kèm danh sách gợi ý; gõ/quét mã vạch TH… rồi Enter để thêm thẳng vào hóa đơn
export default function ProductSearch({ products, priceRanges, loading, onPick, onScan, onOpenCamera }) {
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const visibleProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return products.filter((p) =>
      [p.productName, p.sku].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword)
      )
    );
  }, [products, search]);

  return (
    <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
      <ClickAwayListener onClickAway={() => setSearchOpen(false)}>
        <Box sx={{ position: 'relative', flex: 1 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Tìm theo tên sản phẩm hoặc mã sản phẩm"
            value={search}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => {
              setSearch(e.target.value);
              setSearchOpen(true);
            }}
            onKeyDown={async (e) => {
              // Máy quét gõ mã vào ô này rồi Enter (hoặc người gõ mã vạch TH… rồi Enter) → thêm vào hóa đơn.
              const code = search.trim();
              if (e.key !== 'Enter' || !/^TH\d{6,}(-\d+)?$/i.test(code)) return;
              e.preventDefault();
              const result = await onScan(code);
              if (result.ok) {
                setSearch('');
                setSearchOpen(false);
              }
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined style={{ color: C.subtle, fontSize: 16 }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label="Quét mã bằng camera"
                      title="Có máy quét: cứ bóp cò là thêm vào hóa đơn. Không có máy quét: bấm để quét bằng camera."
                      onClick={onOpenCamera}
                    >
                      <ScanOutlined style={{ color: C.muted, fontSize: 18 }} />
                    </IconButton>
                  </InputAdornment>
                )
              }
            }}
            sx={{
              bgcolor: C.surface,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2.5,
                height: 42,
                '& fieldset, &:hover fieldset': { borderColor: C.border },
                '&.Mui-focused fieldset': { borderColor: C.cyan }
              }
            }}
          />

          {searchOpen && (
            <Box
              sx={{
                position: 'absolute',
                top: 48,
                left: 0,
                right: 0,
                zIndex: 20,
                bgcolor: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 2.5,
                boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
                maxHeight: 380,
                overflowY: 'auto',
                py: 0.5
              }}
            >
              {loading ? (
                <Box sx={{ py: 3, textAlign: 'center' }}>
                  <CircularProgress size={24} sx={{ color: C.cyan }} />
                </Box>
              ) : !visibleProducts.length ? (
                <Typography sx={{ py: 3, textAlign: 'center', color: C.muted, fontSize: 13 }}>Không tìm thấy sản phẩm phù hợp.</Typography>
              ) : (
                visibleProducts.map((product) => {
                  const id = product.productId;
                  const stock = getProductStock(product);
                  const isOut = stock <= 0;
                  const range = priceRanges[id];
                  const priceText = range ? priceRangeText(range.min, range.max) : priceRangeText(product.minPrice, product.maxPrice);
                  const onSale = range && (range.saleMin < range.min || range.saleMax < range.max);
                  const image = product.primaryImageUrl;

                  return (
                    <Box
                      key={id}
                      onClick={() => {
                        setSearchOpen(false);
                        onPick(product);
                      }}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                        px: 1.5,
                        py: 1,
                        cursor: 'pointer',
                        opacity: isOut ? 0.55 : 1
                      }}
                    >
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: 1.5,
                          bgcolor: C.bg,
                          border: `1px solid ${C.border}`,
                          flexShrink: 0,
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {image ? (
                          <Box
                            component="img"
                            src={image}
                            alt={product.productName}
                            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <ShoppingCartOutlined style={{ fontSize: 16, color: C.faint }} />
                        )}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          sx={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: C.text,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {product.productName}
                        </Typography>
                        <Typography sx={{ fontSize: 11.5, color: C.subtle }}>{product.sku || '—'}</Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 0.75 }}>
                          {onSale && (
                            <Typography sx={{ fontSize: 11.5, color: C.subtle, textDecoration: 'line-through' }}>{priceText}</Typography>
                          )}
                          <Typography sx={{ fontSize: 13, fontWeight: 800, color: C.text }}>
                            {onSale ? priceRangeText(range.saleMin, range.saleMax) : priceText}
                          </Typography>
                        </Box>
                        <Typography sx={{ fontSize: 11.5, color: isOut ? C.error : C.muted }}>
                          {isOut ? 'Hết hàng' : `Tồn: ${stock}`}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })
              )}
            </Box>
          )}
        </Box>
      </ClickAwayListener>
    </Box>
  );
}
