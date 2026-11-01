import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Box, Button, Chip, MenuItem, Select, Typography } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import { brand } from 'features/account/tokens';
import { api } from 'services/http';
import { Photo, ShopHeader, priceText } from './ShopCommon';
import PendingCartHandler from './PendingCartHandler';

/**
 * Trang chủ cửa hàng công khai (kiểu Shopee): lưới sản phẩm, tìm kiếm, lọc danh mục, sắp xếp.
 * Bấm vào sản phẩm mở trang chi tiết riêng: /shop/products/:productId
 */

const SORTS = [
  ['newest', 'Mới nhất'],
  ['price_asc', 'Giá thấp đến cao'],
  ['price_desc', 'Giá cao đến thấp']
];
const PAGE_SIZE = 20;

export default function ShopPage() {
  const auth = useAuth();
  const account = auth?.account;
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(0);
  const [sort, setSort] = useState('newest');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/shop/categories')
      .then((d) => setCategories(d.items))
      .catch(() => setCategories([]));
  }, []);

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

  const chip = (selected) => ({ bgcolor: selected ? brand.cyan : '#fff', border: `1px solid ${brand.line}` });

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: brand.page }}>
      <ShopHeader account={account} initialQuery={query} onSearch={setQuery} />

      <Box sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2, md: 4 }, py: 3 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
          <Chip label="Tất cả" clickable onClick={() => setCategoryId(0)} sx={chip(categoryId === 0)} />
          {categories.map((c) => (
            <Chip key={c.categoryId} label={c.categoryName} clickable onClick={() => setCategoryId(c.categoryId)} sx={chip(categoryId === c.categoryId)} />
          ))}
          <Box sx={{ ml: 'auto' }}>
            <Select size="small" value={sort} onChange={(e) => setSort(e.target.value)} sx={{ bgcolor: '#fff', fontSize: 14 }} aria-label="Sắp xếp">
              {SORTS.map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </Box>
        </Box>

        {query && (
          <Typography variant="body2" sx={{ color: brand.muted, mb: 2 }}>
            {total} kết quả cho “{query}”{' '}
            <Button size="small" onClick={() => setQuery('')}>
              Xóa tìm kiếm
            </Button>
          </Typography>
        )}

        {error && (
          <Typography color="error" sx={{ mb: 2 }}>
            {error}
          </Typography>
        )}

        {!loading && !error && items.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8, color: brand.muted }}>
            <Typography variant="h5" sx={{ color: brand.ink, mb: 0.5 }}>
              Không tìm thấy sản phẩm
            </Typography>
            <Typography variant="body2">Thử từ khóa khác hoặc chọn danh mục khác.</Typography>
          </Box>
        )}

        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)', lg: 'repeat(5, 1fr)' } }}>
          {items.map((p) => (
            <Box
              key={p.productId}
              component={RouterLink}
              to={`/shop/products/${p.productId}`}
              sx={{
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
                bgcolor: '#fff',
                border: `1px solid ${brand.line}`,
                borderRadius: '12px',
                overflow: 'hidden',
                transition: 'box-shadow .15s, transform .15s',
                '&:hover': { boxShadow: '0 6px 18px rgba(22,34,46,.10)', transform: 'translateY(-2px)' },
                '&:focus-visible': { outline: `2px solid ${brand.cyan}` }
              }}
            >
              <Box sx={{ position: 'relative' }}>
                <Photo src={p.imageUrl} name={p.productName} sx={{ aspectRatio: '1' }} />
                {Number(p.totalStock) === 0 && (
                  <Chip label="Hết hàng" size="small" sx={{ position: 'absolute', top: 8, left: 8, bgcolor: '#fdecea', color: '#d6453d' }} />
                )}
              </Box>
              <Box sx={{ p: 1.5 }}>
                <Typography
                  sx={{ fontSize: 14, color: brand.ink, lineHeight: 1.35, minHeight: 38, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {p.productName}
                </Typography>
                <Typography sx={{ mt: 0.75, fontWeight: 700, color: '#27a9bd', fontSize: 15 }}>{priceText(p.minPrice, p.maxPrice)}</Typography>
              </Box>
            </Box>
          ))}
        </Box>

        {items.length < total && (
          <Box sx={{ textAlign: 'center', mt: 3 }}>
            <Button variant="outlined" disabled={loading} onClick={() => load(page + 1, false)}>
              {loading ? 'Đang tải...' : 'Xem thêm'}
            </Button>
          </Box>
        )}
        {loading && items.length === 0 && <Typography sx={{ color: brand.muted }}>Đang tải sản phẩm...</Typography>}
      </Box>

      {account?.role === 'CUSTOMER' && <PendingCartHandler />}
    </Box>
  );
}
