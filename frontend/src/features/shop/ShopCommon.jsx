import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, IconButton, InputBase, Tooltip, Typography } from '@mui/material';
import { SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { brand } from 'features/account/tokens';
import ThorsMark from 'layouts/ThorsMark';
import { api } from 'services/http';

// Phần dùng chung cho trang danh sách (ShopPage) và trang chi tiết (ShopProductPage)

export const money = (n) => `${Number(n).toLocaleString('vi-VN')} ₫`;
export const priceText = (a, b) => (Number(a) === Number(b) ? money(a) : `${money(a)} - ${money(b)}`);

// Sản phẩm tạo trong vòng NEW_DAYS ngày được gắn nhãn "MỚI"; quá hạn thì tự mất.
// Cần API trả về thời điểm tạo sản phẩm (createdAt). Không có thì không gắn nhãn.
export const NEW_DAYS = 7;
export function isNewProduct(product) {
  const raw = product?.createdAt ?? product?.createdDate ?? product?.created_at;
  if (!raw) return false;
  const created = new Date(raw).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created < NEW_DAYS * 24 * 60 * 60 * 1000;
}

/* ---------- Cây danh mục (danh mục lớn + danh mục con) ---------- */

const foldName = (name) => (name || '').normalize('NFC').toLowerCase().trim();

/**
 * Gom danh mục thành cây: [{ ...danhMucLon, children: [{ ...danhMucCon, children: [...] }] }].
 * Có parentId (API /shop/categories trả về) thì dựa vào parentId.
 * Không có thì đoán theo tên (xem bên dưới).
 */
export function categoryTree(categories = []) {
  const byId = new Map(categories.map((c) => [c.categoryId, c]));
  let parentOf;
  if (categories.some((c) => c.parentId != null)) {
    parentOf = (c) => (c.parentId != null && byId.has(c.parentId) ? byId.get(c.parentId) : null);
  } else {
    // Danh mục cha = danh mục cùng chữ đầu, có các từ nằm hết trong tên này và nhiều từ nhất.
    // vd "Giày Da Nam" -> "Giày nam" (gồm "giày", "nam") -> "Giày"; "Giày cao gót" -> "Giày".
    const words = new Map(categories.map((c) => [c.categoryId, foldName(c.categoryName).split(/\s+/).filter(Boolean)]));
    parentOf = (c) => {
      const mine = words.get(c.categoryId);
      let best = null;
      for (const other of categories) {
        const theirs = words.get(other.categoryId);
        if (other === c || theirs.length === 0 || theirs.length >= mine.length || theirs[0] !== mine[0]) continue;
        if (!theirs.every((w) => mine.includes(w))) continue;
        if (!best || theirs.length > words.get(best.categoryId).length) best = other;
      }
      return best;
    };
  }
  // Dữ liệu lỗi có vòng lặp (A là cha B, B là cha A) thì coi như danh mục gốc
  const loops = (c) => {
    const seen = new Set([c.categoryId]);
    for (let cur = parentOf(c); cur; cur = parentOf(cur)) {
      if (seen.has(cur.categoryId)) return true;
      seen.add(cur.categoryId);
    }
    return false;
  };
  const nodes = new Map(categories.map((c) => [c.categoryId, { ...c, children: [] }]));
  const roots = [];
  categories.forEach((c) => {
    const parent = loops(c) ? null : parentOf(c);
    (parent ? nodes.get(parent.categoryId).children : roots).push(nodes.get(c.categoryId));
  });
  const byName = (a, b) => (a.categoryName || '').localeCompare(b.categoryName || '', 'vi');
  const sortDeep = (list) => {
    list.sort(byName).forEach((n) => sortDeep(n.children));
    return list;
  };
  return sortDeep(roots);
}

// Mọi danh mục con, cháu... của một nút trong cây (không gồm chính nó)
export const descendantsOf = (node) => node.children.flatMap((c) => [c, ...descendantsOf(c)]);

/* ---------- Màu sắc sản phẩm (chấm màu dưới thẻ sản phẩm) ---------- */

// Tên màu (tiếng Việt, viết thường, không dấu) -> mã màu. Màu lạ không có trong bảng thì hiện chấm xám nhạt.
const COLOR_HEX = {
  den: '#111111',
  trang: '#FFFFFF',
  kem: '#F3EAD8',
  be: '#E3D3B5',
  'trang kem': '#F3EAD8',
  xam: '#9E9E9E',
  ghi: '#9E9E9E',
  'xam dam': '#5F5F5F',
  'xam nhat': '#C9C9C9',
  nau: '#6B4A2F',
  'nau nhat': '#A47B55',
  bo: '#8B4A1F',
  'xanh duong': '#2F5DA8',
  'xanh navy': '#1F2A44',
  navy: '#1F2A44',
  'xanh than': '#1F2A44',
  'xanh da troi': '#6FA8DC',
  'xanh nhat': '#A9C8E8',
  'xanh la': '#3E8E41',
  'xanh reu': '#556B2F',
  'xanh mint': '#9ED9C4',
  xanh: '#2F5DA8',
  do: '#C62828',
  'do do': '#7B1E1E',
  'do man': '#7B1E1E',
  hong: '#F4A7B9',
  'hong nhat': '#F8C8D4',
  vang: '#F2C230',
  cam: '#EF7D2D',
  tim: '#7E57C2',
  'tim than': '#4A2C6F',
  reu: '#556B2F',
  olive: '#708238'
};

const normalizeColor = (name) =>
  String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();

export function colorHex(name) {
  return COLOR_HEX[normalizeColor(name)] ?? null;
}

// Danh sách màu của một sản phẩm. API danh sách có trường colors thì dùng luôn;
// không thì lấy từ API chi tiết (có lưu tạm để mỗi sản phẩm chỉ gọi một lần).
const variantCache = new Map(); // productId -> Promise<variant[]>

// Các phân loại (size, màu, giá, tồn) của một sản phẩm, lấy từ API chi tiết; mỗi sản phẩm chỉ gọi một lần.
export function fetchProductVariants(productId) {
  const key = String(productId);
  if (!variantCache.has(key)) {
    variantCache.set(
      key,
      api(`/shop/products/${productId}`)
        .then((d) => d.variants || [])
        .catch(() => [])
    );
  }
  return variantCache.get(key);
}

function fetchColors(productId) {
  return fetchProductVariants(productId).then((variants) => [...new Set(variants.map((v) => v.color).filter(Boolean))]);
}

export function useProductColors(product) {
  const given = Array.isArray(product?.colors) ? product.colors : null;
  const [colors, setColors] = useState(given || []);
  useEffect(() => {
    if (given) {
      setColors(given);
      return undefined;
    }
    let alive = true;
    fetchColors(product.productId).then((list) => alive && setColors(list));
    return () => {
      alive = false;
    };
  }, [product?.productId, given]);
  return colors;
}

export function ColorSwatches({ colors, size = 18 }) {
  if (!colors?.length) return null;
  return (
    <Box role="list" aria-label="Màu có sẵn" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {colors.map((name) => {
        const hex = colorHex(name);
        return (
          <Box
            key={name}
            role="listitem"
            title={name}
            aria-label={name}
            sx={{
              width: size,
              height: size,
              borderRadius: '50%',
              bgcolor: hex || '#E6E3DE',
              border: '1px solid',
              borderColor: hex && hex !== '#FFFFFF' && hex !== '#F3EAD8' ? 'transparent' : '#8C857B',
              boxSizing: 'border-box',
              flexShrink: 0
            }}
          />
        );
      })}
    </Box>
  );
}

export function Photo({ src, name, sx }) {
  return (
    <Box sx={{ bgcolor: brand.cyanSoft, display: 'grid', placeItems: 'center', overflow: 'hidden', ...sx }}>
      {src ? (
        <Box component="img" src={src} alt={name} loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Typography sx={{ fontSize: 32, fontWeight: 700, color: brand.ink }}>{name.charAt(0)}</Typography>
      )}
    </Box>
  );
}

// Ô tìm kiếm dùng chung cho header khách vãng lai và thanh tìm kiếm trong khung đã đăng nhập
function SearchForm({ initialQuery, onSearch, sx }) {
  const [input, setInput] = useState(initialQuery);
  useEffect(() => setInput(initialQuery), [initialQuery]);

  const submit = (e) => {
    e.preventDefault();
    onSearch(input.trim());
  };

  return (
    <Box
      component="form"
      onSubmit={submit}
      sx={{
        display: 'flex',
        alignItems: 'center',
        border: `1.5px solid ${brand.cyan}`,
        borderRadius: '10px',
        bgcolor: '#fff',
        pl: 1.5,
        ...sx
      }}
    >
      <InputBase
        fullWidth
        placeholder="Tìm sản phẩm..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        inputProps={{ 'aria-label': 'Tìm sản phẩm' }}
      />
      <IconButton type="submit" aria-label="Tìm kiếm">
        <SearchOutlined />
      </IconButton>
    </Box>
  );
}

// Thanh tìm kiếm đặt ở đầu nội dung trang khi đã đăng nhập (header và sidebar do ThorsLayout lo)
export function ShopSearchBar({ initialQuery = '', onSearch }) {
  return (
    <Box sx={{ mb: 2, maxWidth: 1240, mx: 'auto' }}>
      <SearchForm initialQuery={initialQuery} onSearch={onSearch} sx={{ maxWidth: 600 }} />
    </Box>
  );
}

export function ShopHeader({ account, initialQuery = '', onSearch }) {
  // Đã đăng nhập: đang nằm trong khung chung nên chỉ cần ô tìm kiếm, không vẽ thêm header
  if (account) return <ShopSearchBar initialQuery={initialQuery} onSearch={onSearch} />;

  return (
    <Box
      component="header"
      sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: brand.surface, borderBottom: `1px solid ${brand.line}` }}
    >
      <Box sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2, md: 4 }, height: 64, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box component={RouterLink} to="/" sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none' }}>
          <ThorsMark />
          <Typography sx={{ fontSize: 22, fontWeight: 700, letterSpacing: 1.5, color: brand.ink, display: { xs: 'none', sm: 'block' } }}>
            THORS
          </Typography>
        </Box>

        <SearchForm initialQuery={initialQuery} onSearch={onSearch} sx={{ flexGrow: 1, maxWidth: 600 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
          <Tooltip title="Đăng nhập để xem giỏ hàng">
            <IconButton component={RouterLink} to={`/login?returnTo=${encodeURIComponent('/cart')}`} size="small" aria-label="Giỏ hàng">
              <ShoppingCartOutlined />
            </IconButton>
          </Tooltip>
          <Button component={RouterLink} to="/login">
            Đăng nhập
          </Button>
          <Button component={RouterLink} to="/register" variant="contained">
            Đăng ký
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
