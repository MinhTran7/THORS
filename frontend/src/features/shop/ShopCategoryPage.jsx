import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { Box } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import { api } from 'services/http';
import PendingCartHandler from './PendingCartHandler';
import { ProductCard, SectionHead } from './ShopPage';
import { C, SERIF, btnSx, container, focusRing, linkSx, srOnly } from './storeTheme';

/**
 * Trang danh sách sản phẩm của cửa hàng:
 *   /shop/category/:categoryId     -> sản phẩm của một danh mục
 *   /shop/category/all             -> tất cả sản phẩm
 *   /shop/category/all?q=...       -> kết quả tìm kiếm
 *   ?sort=newest | best_selling | price_asc | price_desc
 * Bộ sưu tập (prop collection), mở từ link "Xem tất cả" trên trang chủ:
 *   /shop/best-sellers   -> Hàng bán chạy (luôn xếp theo bán chạy)
 *   /shop/new-arrivals   -> Hàng mới về (luôn xếp mới nhất)
 *   lọc thêm theo danh mục bằng ?category=ID
 * Header + footer do StorefrontLayout lo.
 */

const COLLECTIONS = {
  best_selling: { title: 'Hàng bán chạy', path: '/shop/best-sellers', empty: 'Chưa có sản phẩm bán chạy.' },
  newest: { title: 'Hàng mới về', path: '/shop/new-arrivals', empty: 'Chưa có sản phẩm mới.' }
};

const SORTS = [
  ['newest', 'Mới nhất'],
  ['best_selling', 'Bán chạy'],
  ['price_asc', 'Giá thấp đến cao'],
  ['price_desc', 'Giá cao đến thấp']
];
const PAGE_SIZE = 20;

const chipSx = (selected) => ({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 36,
  px: 2,
  border: `1px solid ${selected ? C.ink : '#CFCAC2'}`,
  bgcolor: selected ? C.ink : '#FFFFFF',
  color: selected ? '#FFFFFF' : C.ink,
  fontSize: 14,
  textDecoration: 'none',
  '&:hover': { borderColor: C.ink, color: selected ? '#FFFFFF' : C.ink },
  ...focusRing
});

export default function ShopCategoryPage({ collection }) {
  const { categoryId: rawId } = useParams();
  const auth = useAuth();
  const account = auth?.account;
  const { categories = [] } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();

  const coll = COLLECTIONS[collection] || null;
  // Bộ sưu tập: danh mục lấy từ ?category=, thứ tự cố định; trang danh mục: lấy từ đường dẫn
  const categoryId = coll ? Number(params.get('category')) || 0 : rawId === 'all' ? 0 : Number(rawId) || 0;
  const query = coll ? '' : params.get('q') || '';
  const sort = coll ? collection : SORTS.some(([v]) => v === params.get('sort')) ? params.get('sort') : 'newest';
  const category = categories.find((c) => c.categoryId === categoryId);

  const [promos, setPromos] = useState([]);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/shop/promotions?size=100')
      .then((d) => setPromos(d.items || []))
      .catch(() => setPromos([]));
  }, []);
  const promoMap = useMemo(() => new Map(promos.map((p) => [p.productId, p])), [promos]);

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

  const setSort = (value) => {
    const next = new URLSearchParams(params);
    if (value === 'newest') next.delete('sort');
    else next.set('sort', value);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const title = coll
    ? coll.title + (categoryId && category ? ` · ${category.categoryName}` : '')
    : query
      ? `Kết quả cho “${query}”`
      : categoryId
        ? category?.categoryName || 'Danh mục'
        : 'Tất cả sản phẩm';
  const sortSuffix = sort === 'newest' ? '' : `?sort=${sort}`;
  // Link của từng nút danh mục: trong bộ sưu tập thì lọc tại chỗ, ở trang danh mục thì sang danh mục đó
  const chipTo = (id) => (coll ? (id ? `${coll.path}?category=${id}` : coll.path) : `/shop/category/${id || 'all'}${sortSuffix}`);

  return (
    <Box sx={{ ...container, py: { xs: 3, md: 5 } }}>
      <Box
        component="nav"
        aria-label="Breadcrumb"
        sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', fontSize: 13, color: C.muted, mb: { xs: 3, md: 4 } }}
      >
        <Box component={RouterLink} to="/" sx={{ ...linkSx, color: C.muted }}>
          Trang chủ
        </Box>
        <span>/</span>
        <Box component="span" sx={{ color: C.ink, fontWeight: 600 }}>
          {coll ? coll.title : query ? 'Tìm kiếm' : categoryId ? category?.categoryName || 'Danh mục' : 'Tất cả sản phẩm'}
        </Box>
      </Box>

      <SectionHead title={title}>
        {!coll && (
          <Box component="label" sx={{ position: 'relative' }}>
            <Box component="span" sx={srOnly}>
              Sắp xếp
            </Box>
            <Box
              component="select"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              sx={{
                height: 44,
                pl: '14px',
                pr: 4,
                border: `1px solid ${C.ink}`,
                bgcolor: '#FFFFFF',
                font: 'inherit',
                fontSize: 14,
                color: C.ink,
                cursor: 'pointer',
                ...focusRing
              }}
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

      {/* Chuyển nhanh sang danh mục khác (giữ nguyên cách sắp xếp) */}
      {!query && categories.length > 0 && (
        <Box component="nav" aria-label="Danh mục" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: -1.5, mb: 4 }}>
          <Box component={RouterLink} to={chipTo(0)} aria-current={categoryId === 0 ? 'page' : undefined} sx={chipSx(categoryId === 0)}>
            Tất cả
          </Box>
          {categories.map((c) => (
            <Box
              key={c.categoryId}
              component={RouterLink}
              to={chipTo(c.categoryId)}
              aria-current={categoryId === c.categoryId ? 'page' : undefined}
              sx={chipSx(categoryId === c.categoryId)}
            >
              {c.categoryName}
            </Box>
          ))}
        </Box>
      )}

      {query && (
        <Box sx={{ mt: -2, mb: 4, fontSize: 14, color: C.muted }}>
          {total} sản phẩm ·{' '}
          <Box component={RouterLink} to="/shop/category/all" sx={{ ...linkSx, textDecoration: 'underline' }}>
            Xóa tìm kiếm
          </Box>
        </Box>
      )}

      {error && (
        <Box component="p" sx={{ color: C.accent }}>
          {error}
        </Box>
      )}

      {!loading && !error && items.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: C.muted }}>
          <Box sx={{ fontFamily: SERIF, fontSize: 24, color: C.ink, mb: 1 }}>Chưa có sản phẩm</Box>
          <Box sx={{ mb: 3 }}>{coll ? coll.empty : query ? 'Thử từ khóa khác.' : 'Danh mục này hiện chưa có sản phẩm nào.'}</Box>
          <Box component={RouterLink} to="/shop/category/all" sx={btnSx('outline')}>
            XEM TẤT CẢ SẢN PHẨM
          </Box>
        </Box>
      )}

      <Box
        sx={{
          display: 'grid',
          gap: { xs: '24px 12px', sm: '32px 20px' },
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }
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

      {account?.role === 'CUSTOMER' && <PendingCartHandler />}
    </Box>
  );
}
