import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { Box } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import { api } from 'services/http';
import PendingCartHandler from './PendingCartHandler';
import { colorHex, fetchProductVariants } from './ShopCommon';
import { ProductCard } from './ShopPage';
import { C, SERIF, Icon, btnSx, container, focusRing, h2Sx, linkSx, srOnly } from './storeTheme';

/**
 * Trang danh sách sản phẩm có thanh lọc bên trái (giống Coolmate). Dùng cho:
 *   /shop/best-sellers         -> Hàng bán chạy (prop collection="best_selling", danh mục qua ?category=)
 *   /shop/new-arrivals         -> Hàng mới về (prop collection="newest", danh mục qua ?category=)
 *   /shop/sale                 -> Sale: sản phẩm đang khuyến mãi (prop collection="sale")
 *   /shop/category/:categoryId -> một danh mục ('all' = tất cả sản phẩm), có ô sắp xếp ?sort=
 *   /shop/category/all?q=...   -> kết quả tìm kiếm
 * Bộ lọc lưu trên đường dẫn để chia sẻ được: ?size=M,L&color=Đen,Trắng&price=200-500
 *  - Danh mục: lọc ở backend (categoryId).
 *  - Kích thước, màu sắc, giá: lọc ngay trên trình duyệt vì API danh sách chưa hỗ trợ.
 *    Vì vậy trang tải sẵn tối đa FETCH_SIZE sản phẩm rồi lọc, hiện dần từng STEP sản phẩm.
 */

const COLLECTIONS = {
  best_selling: { title: 'Hàng bán chạy', path: '/shop/best-sellers', empty: 'Chưa có sản phẩm bán chạy.' },
  newest: { title: 'Hàng mới về', path: '/shop/new-arrivals', empty: 'Chưa có sản phẩm mới.' },
  // Sale: sản phẩm đang có khuyến mãi (lấy danh sách khuyến mãi để lọc), xếp mới nhất
  sale: { title: 'Sale', path: '/shop/sale', empty: 'Hiện chưa có sản phẩm nào đang giảm giá.', apiSort: 'newest', onlyPromo: true }
};

const PRICE_RANGES = [
  { key: 'lt200', label: 'Dưới 200.000 ₫', min: 0, max: 200000 },
  { key: '200-500', label: '200.000 ₫ – 500.000 ₫', min: 200000, max: 500000 },
  { key: '500-1000', label: '500.000 ₫ – 1.000.000 ₫', min: 500000, max: 1000000 },
  { key: 'gt1000', label: 'Trên 1.000.000 ₫', min: 1000000, max: Infinity }
];

const SORTS = [
  ['newest', 'Mới nhất'],
  ['best_selling', 'Bán chạy'],
  ['price_asc', 'Giá thấp đến cao'],
  ['price_desc', 'Giá cao đến thấp']
];

const FETCH_SIZE = 100;
const STEP = 20;
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', 'FREESIZE', 'FREE SIZE'];

const splitParam = (v) => (v ? v.split(',').filter(Boolean) : []);

function sortSizes(list) {
  return [...list].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(String(a).toUpperCase());
    const ib = SIZE_ORDER.indexOf(String(b).toUpperCase());
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b), 'vi');
  });
}

/* ---------- Khối có thể thu gọn trong thanh lọc ---------- */

function FilterSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box sx={{ borderBottom: `1px solid ${C.line}`, py: 2 }}>
      <Box
        component="button"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        sx={{
          width: '100%',
          p: 0,
          border: 0,
          bgcolor: 'transparent',
          font: 'inherit',
          fontSize: 15,
          fontWeight: 600,
          color: C.ink,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          ...focusRing
        }}
      >
        {title}
        <Box component="span" sx={{ display: 'flex', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
          <Icon size={16}>
            <path d="M6 9l6 6 6-6" />
          </Icon>
        </Box>
      </Box>
      {open && <Box sx={{ pt: 2 }}>{children}</Box>}
    </Box>
  );
}

// Một lựa chọn dạng radio / checkbox có nhãn
function Option({ type = 'radio', name, checked, onChange, children }) {
  return (
    <Box
      component="label"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 0.75,
        fontSize: 15,
        color: C.ink,
        cursor: 'pointer',
        '&:hover': { color: C.accent }
      }}
    >
      <Box
        component="input"
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        sx={{ width: 18, height: 18, m: 0, accentColor: C.ink, cursor: 'pointer', flexShrink: 0 }}
      />
      {children}
    </Box>
  );
}

const activeChipSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 1,
  minHeight: 36,
  px: 1.5,
  border: `1px solid ${C.line}`,
  bgcolor: '#FFFFFF',
  font: 'inherit',
  fontSize: 14,
  color: C.ink,
  cursor: 'pointer',
  '&:hover': { borderColor: C.ink },
  ...focusRing
};

export default function ShopCollectionPage({ collection }) {
  // coll: đang ở trang bộ sưu tập; null: đang ở trang danh mục / tìm kiếm
  const coll = COLLECTIONS[collection] || null;
  const { categoryId: rawId } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const account = auth?.account;
  const { categories = [] } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();

  const categoryId = coll ? Number(params.get('category')) || 0 : rawId === 'all' ? 0 : Number(rawId) || 0;
  const query = coll ? '' : params.get('q') || '';
  const sort = coll ? coll.apiSort || collection : SORTS.some(([v]) => v === params.get('sort')) ? params.get('sort') : 'newest';
  const sizes = useMemo(() => splitParam(params.get('size')), [params]);
  const colors = useMemo(() => splitParam(params.get('color')), [params]);
  const priceKey = PRICE_RANGES.some((r) => r.key === params.get('price')) ? params.get('price') : '';
  const priceRange = PRICE_RANGES.find((r) => r.key === priceKey) || null;
  const category = categories.find((c) => c.categoryId === categoryId);

  const [showFilters, setShowFilters] = useState(true);
  const [promos, setPromos] = useState([]);
  const [items, setItems] = useState([]);
  const [variantMap, setVariantMap] = useState({}); // productId -> variants
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(STEP);

  // Màn hình nhỏ: mặc định ẩn thanh lọc
  useEffect(() => {
    if (window.matchMedia?.('(max-width: 899px)').matches) setShowFilters(false);
  }, []);

  const [promosLoaded, setPromosLoaded] = useState(false);
  const busy = loading || (coll?.onlyPromo && !promosLoaded);
  useEffect(() => {
    api('/shop/promotions?size=100')
      .then((d) => setPromos(d.items || []))
      .catch(() => setPromos([]))
      .finally(() => setPromosLoaded(true));
  }, []);
  const promoMap = useMemo(() => new Map(promos.map((p) => [p.productId, p])), [promos]);

  // Tải sản phẩm của bộ sưu tập (theo danh mục nếu có chọn), rồi lấy size/màu của từng sản phẩm
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const q = new URLSearchParams({ page: 0, size: FETCH_SIZE, sort });
    if (categoryId) q.set('categoryId', categoryId);
    if (query) q.set('q', query);
    api(`/shop/products?${q}`)
      .then(async (data) => {
        if (!alive) return;
        const list = data.items || [];
        setItems(list);
        setLoading(false);
        const pairs = await Promise.all(list.map((p) => fetchProductVariants(p.productId).then((v) => [p.productId, v])));
        if (alive) setVariantMap(Object.fromEntries(pairs));
      })
      .catch((e) => {
        if (!alive) return;
        setItems([]);
        setError(e.message);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [sort, categoryId, query]);

  // Các lựa chọn size / màu lấy từ chính sản phẩm đang có
  const { sizeOptions, colorOptions } = useMemo(() => {
    const s = new Set();
    const c = new Set();
    Object.values(variantMap).forEach((variants) =>
      variants.forEach((v) => {
        if (v.size) s.add(v.size);
        if (v.color) c.add(v.color);
      })
    );
    return { sizeOptions: sortSizes(s), colorOptions: [...c].sort((a, b) => a.localeCompare(b, 'vi')) };
  }, [variantMap]);

  const variantsLoaded = items.every((p) => variantMap[p.productId]);

  const filtered = useMemo(() => {
    const sizeSet = new Set(sizes);
    const colorSet = new Set(colors);
    return items.filter((p) => {
      // Trang Sale: chỉ giữ sản phẩm đang có khuyến mãi
      if (coll?.onlyPromo && !promoMap.has(p.productId)) return false;
      if (sizeSet.size || colorSet.size) {
        const variants = variantMap[p.productId];
        if (!variants) return false;
        const ok = variants.some((v) => (!sizeSet.size || sizeSet.has(v.size)) && (!colorSet.size || colorSet.has(v.color)));
        if (!ok) return false;
      }
      if (priceRange) {
        const promo = promoMap.get(p.productId);
        const low = promo ? Number(promo.salePrice) : Number(p.minPrice);
        const high = promo ? Math.max(low, Number(p.maxPrice) - (Number(p.minPrice) - Number(promo.salePrice))) : Number(p.maxPrice);
        // Có ít nhất một mức giá của sản phẩm nằm trong khoảng đã chọn
        if (high < priceRange.min || low >= priceRange.max) return false;
      }
      return true;
    });
  }, [items, variantMap, sizes, colors, priceRange, promoMap, coll]);

  useEffect(() => setVisible(STEP), [categoryId, query, sort, priceKey, sizes, colors]);

  // Ghi bộ lọc lên đường dẫn
  const update = (key, value) => {
    const next = new URLSearchParams(params);
    if (value && (!Array.isArray(value) || value.length)) next.set(key, Array.isArray(value) ? value.join(',') : String(value));
    else next.delete(key);
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const toggleIn = (key, list, value) => update(key, list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  // Chọn danh mục: ở bộ sưu tập thì lọc tại chỗ (?category=), ở trang danh mục thì sang trang danh mục đó
  const pickCategory = (id) => {
    if (coll) return update('category', id);
    const next = new URLSearchParams(params);
    next.delete('q');
    const qs = next.toString();
    navigate(`/shop/category/${id || 'all'}${qs ? `?${qs}` : ''}`, { preventScrollReset: true });
  };
  const clearAll = () => {
    if (coll) return setParams({}, { replace: true, preventScrollReset: true });
    const keep = new URLSearchParams();
    if (query) keep.set('q', query);
    if (sort !== 'newest') keep.set('sort', sort);
    const qs = keep.toString();
    navigate(`/shop/category/all${qs ? `?${qs}` : ''}`, { replace: true, preventScrollReset: true });
  };
  const setSort = (value) => update('sort', value === 'newest' ? '' : value);

  const title = coll
    ? coll.title + (category ? ` · ${category.categoryName}` : '')
    : query
      ? `Kết quả cho “${query}”`
      : categoryId
        ? category?.categoryName || 'Danh mục'
        : 'Tất cả sản phẩm';
  const crumb = coll ? coll.title : query ? 'Tìm kiếm' : categoryId ? category?.categoryName || 'Danh mục' : 'Tất cả sản phẩm';
  const emptyText = coll ? coll.empty : query ? 'Không tìm thấy sản phẩm phù hợp với từ khóa.' : 'Danh mục này hiện chưa có sản phẩm nào.';

  const active = [
    ...(query ? [{ label: `“${query}”`, clear: () => navigate(`/shop/category/${categoryId || 'all'}`) }] : []),
    ...(category ? [{ label: category.categoryName, clear: () => pickCategory(0) }] : []),
    ...sizes.map((s) => ({ label: `Size ${s}`, clear: () => toggleIn('size', sizes, s) })),
    ...colors.map((c) => ({ label: c, clear: () => toggleIn('color', colors, c) })),
    ...(priceRange ? [{ label: priceRange.label, clear: () => update('price', '') }] : [])
  ];

  const sidebar = (
    <Box component="aside" aria-label="Bộ lọc">
      <FilterSection title="Danh mục" defaultOpen>
        <Option name="category" checked={categoryId === 0} onChange={() => pickCategory(0)}>
          Tất cả
        </Option>
        {categories.map((c) => (
          <Option key={c.categoryId} name="category" checked={categoryId === c.categoryId} onChange={() => pickCategory(c.categoryId)}>
            {c.categoryName}
          </Option>
        ))}
      </FilterSection>

      <FilterSection title="Kích thước" defaultOpen={sizes.length > 0}>
        {sizeOptions.length === 0 ? (
          <Box sx={{ fontSize: 14, color: C.muted }}>{variantsLoaded ? 'Chưa có dữ liệu kích thước.' : 'Đang tải...'}</Box>
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {sizeOptions.map((s) => {
              const on = sizes.includes(s);
              return (
                <Box
                  key={s}
                  component="button"
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleIn('size', sizes, s)}
                  sx={{
                    minWidth: 48,
                    height: 40,
                    px: 1.5,
                    border: `1px solid ${on ? C.ink : '#CFCAC2'}`,
                    bgcolor: on ? C.ink : '#FFFFFF',
                    color: on ? '#FFFFFF' : C.ink,
                    font: 'inherit',
                    fontSize: 14,
                    cursor: 'pointer',
                    '&:hover': { borderColor: C.ink },
                    ...focusRing
                  }}
                >
                  {s}
                </Box>
              );
            })}
          </Box>
        )}
      </FilterSection>

      <FilterSection title="Màu sắc" defaultOpen={colors.length > 0}>
        {colorOptions.length === 0 ? (
          <Box sx={{ fontSize: 14, color: C.muted }}>{variantsLoaded ? 'Chưa có dữ liệu màu sắc.' : 'Đang tải...'}</Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
            {colorOptions.map((c) => {
              const on = colors.includes(c);
              const hex = colorHex(c);
              return (
                <Box
                  key={c}
                  component="button"
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleIn('color', colors, c)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 0.5,
                    border: 0,
                    bgcolor: 'transparent',
                    font: 'inherit',
                    fontSize: 14,
                    color: C.ink,
                    textAlign: 'left',
                    cursor: 'pointer',
                    '&:hover': { color: C.accent },
                    ...focusRing
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      flexShrink: 0,
                      bgcolor: hex || '#E6E3DE',
                      border: '1px solid #8C857B',
                      boxShadow: on ? `0 0 0 2px #FFFFFF, 0 0 0 4px ${C.ink}` : 'none'
                    }}
                  />
                  <Box component="span" sx={{ fontWeight: on ? 600 : 400 }}>
                    {c}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </FilterSection>

      <FilterSection title="Giá" defaultOpen={Boolean(priceRange)}>
        <Option name="price" checked={!priceRange} onChange={() => update('price', '')}>
          Tất cả
        </Option>
        {PRICE_RANGES.map((r) => (
          <Option key={r.key} name="price" checked={priceKey === r.key} onChange={() => update('price', r.key)}>
            {r.label}
          </Option>
        ))}
      </FilterSection>
    </Box>
  );

  const shown = filtered.slice(0, visible);

  return (
    <Box sx={{ ...container, py: { xs: 3, md: 5 } }}>
      <Box
        component="nav"
        aria-label="Breadcrumb"
        sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', fontSize: 13, color: C.muted, mb: { xs: 2, md: 3 } }}
      >
        <Box component={RouterLink} to="/" sx={{ ...linkSx, color: C.muted }}>
          Trang chủ
        </Box>
        <span>/</span>
        <Box component="span" sx={{ color: C.ink, fontWeight: 600 }}>
          {crumb}
        </Box>
      </Box>

      <Box component="h1" sx={{ ...h2Sx, mb: 3 }}>
        {title}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 3 }}>
        <Box
          component="button"
          type="button"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            height: 44,
            px: 2.5,
            border: `1px solid ${C.ink}`,
            borderRadius: 999,
            bgcolor: '#FFFFFF',
            font: 'inherit',
            fontSize: 15,
            fontWeight: 500,
            color: C.ink,
            cursor: 'pointer',
            ...focusRing
          }}
        >
          <Icon size={18}>
            <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
            <circle cx="16" cy="6" r="2" />
            <circle cx="10" cy="12" r="2" />
            <circle cx="18" cy="18" r="2" />
          </Icon>
          {showFilters ? 'Ẩn bộ lọc' : 'Hiện bộ lọc'}
        </Box>
        <Box sx={{ fontSize: 14, color: C.muted }}>{busy ? 'Đang tải...' : `${filtered.length} sản phẩm`}</Box>
        {/* Trang danh mục / tìm kiếm: chọn cách sắp xếp */}
        {!coll && (
          <Box component="label" sx={{ position: 'relative', ml: 'auto' }}>
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
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: showFilters ? '260px minmax(0, 1fr)' : '1fr' },
          gap: { xs: 3, md: 5 }
        }}
      >
        {showFilters && sidebar}

        <Box sx={{ minWidth: 0 }}>
          {active.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 3 }}>
              {active.map((f) => (
                <Box key={f.label} component="button" type="button" onClick={f.clear} aria-label={`Bỏ lọc ${f.label}`} sx={activeChipSx}>
                  {f.label}
                  <Icon size={14}>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </Icon>
                </Box>
              ))}
              <Box
                component="button"
                type="button"
                onClick={clearAll}
                sx={{
                  ...linkSx,
                  border: 0,
                  p: 0,
                  ml: 1,
                  bgcolor: 'transparent',
                  font: 'inherit',
                  fontSize: 14,
                  fontWeight: 600,
                  color: C.accent
                }}
              >
                Xoá lọc
              </Box>
            </Box>
          )}

          {error && (
            <Box component="p" sx={{ color: C.accent }}>
              {error}
            </Box>
          )}

          {!busy && !error && filtered.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 8, color: C.muted }}>
              <Box sx={{ fontFamily: SERIF, fontSize: 24, color: C.ink, mb: 1 }}>Không có sản phẩm phù hợp</Box>
              <Box sx={{ mb: 3 }}>{active.length ? 'Thử bỏ bớt bộ lọc.' : emptyText}</Box>
              {active.length > 0 && (
                <Box component="button" type="button" onClick={clearAll} sx={btnSx('outline')}>
                  XOÁ LỌC
                </Box>
              )}
            </Box>
          )}

          <Box
            sx={{
              display: 'grid',
              gap: { xs: '24px 12px', sm: '32px 20px' },
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                sm: 'repeat(3, minmax(0, 1fr))',
                lg: showFilters ? 'repeat(3, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))'
              }
            }}
          >
            {shown.map((p) => (
              <ProductCard key={p.productId} product={p} promo={promoMap.get(p.productId)} />
            ))}
          </Box>

          {filtered.length > visible && (
            <Box sx={{ textAlign: 'center', mt: 6 }}>
              <Box component="button" type="button" onClick={() => setVisible((v) => v + STEP)} sx={btnSx('outline')}>
                XEM THÊM ({filtered.length - visible})
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {account?.role === 'CUSTOMER' && <PendingCartHandler />}
    </Box>
  );
}
