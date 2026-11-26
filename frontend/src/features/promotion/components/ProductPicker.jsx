import { useMemo, useState } from 'react';
import { Box, Checkbox, CircularProgress, InputAdornment, ListSubheader, MenuItem, TextField, Typography } from '@mui/material';
import { DownOutlined, PictureOutlined, SearchOutlined } from '@ant-design/icons';
import { categoryFullName } from 'services/categoryService';
import { useCategories } from '../hooks';
import { C, fieldSx } from '../theme';
import { busyLabel, priceRange, productIdOf, productNameOf, salePrice } from '../utils';

const columns = { xs: '28px 44px minmax(0, 1fr) 120px', md: '28px 44px minmax(0, 2fr) minmax(0, 0.6fr) minmax(0, 1fr) minmax(0, 1fr)' };
const headSx = { fontSize: 11.5, fontWeight: 700, color: C.subtle, textTransform: 'uppercase', letterSpacing: 0.4 };
const desktop = { display: { xs: 'none', md: 'block' } };
const checkSx = { p: 0.5, '&:hover': { bgcolor: 'transparent' }, '&.Mui-checked': { color: C.yellowCheck } };
const vi = (text) => String(text || '').toLocaleLowerCase('vi-VN');

// Chọn danh mục dạng cây: danh mục cha mở ra danh mục con, chỉ mở một nhánh một lúc
function CategorySelect({ categories, value, onChange }) {
  const [expanded, setExpanded] = useState('');
  const parentOf = (id) => String(categories.find((c) => String(c.categoryId) === id)?.parentId ?? '');

  const options = [
    <MenuItem key="ALL" value="ALL" sx={{ fontSize: 13.5 }}>
      Tất cả danh mục
    </MenuItem>,
    ...categories
      .filter((c) => !c.parentId)
      .flatMap((root) => {
        const id = String(root.categoryId);
        const children = categories.filter((c) => String(c.parentId) === id);
        if (!children.length)
          return (
            <MenuItem key={id} value={id} sx={{ fontSize: 13.5, fontWeight: 600 }}>
              {root.categoryName}
            </MenuItem>
          );
        const open = expanded === id;
        return [
          <ListSubheader key={`group-${id}`} sx={{ position: 'static', p: 0, '&:hover': { bgcolor: C.bg } }}>
            <Box
              onClick={() => setExpanded(open ? '' : id)}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                px: 2,
                cursor: 'pointer',
                fontSize: 13.5,
                fontWeight: 600,
                color: C.text,
                lineHeight: '40px'
              }}
            >
              {root.categoryName}
              <DownOutlined style={{ fontSize: 10, color: C.subtle, transform: open ? 'rotate(180deg)' : 'none' }} />
            </Box>
          </ListSubheader>,
          ...(open
            ? [root, ...children].map((c) => (
                <MenuItem key={c.categoryId} value={String(c.categoryId)} sx={{ pl: 4, fontSize: 13.5 }}>
                  {c === root ? `Tất cả ${root.categoryName}` : c.categoryName}
                </MenuItem>
              ))
            : [])
        ];
      })
  ];
  const label = (v) => (v === 'ALL' ? 'Tất cả danh mục' : categoryFullName(categories.find((c) => String(c.categoryId) === v) || {}));

  return (
    <TextField
      select
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      slotProps={{
        select: {
          renderValue: label,
          onOpen: () => setExpanded(parentOf(value) || value),
          MenuProps: {
            variant: 'menu',
            anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
            transformOrigin: { vertical: 'top', horizontal: 'left' },
            slotProps: { paper: { sx: { mt: 0.5, maxHeight: 320 } } }
          }
        }
      }}
      sx={fieldSx}
    >
      {options}
      {/* Danh mục đang chọn nằm trong nhánh đóng: giữ một mục ẩn để Select không báo giá trị lạ */}
      {!options.some((o) => o.props.value === value) && <MenuItem value={value} sx={{ display: 'none' }} />}
    </TextField>
  );
}

function ProductRow({ product, checked, busy, discount, categoryName, onToggle }) {
  const blocked = busy && !checked;
  const sale =
    Number(discount.value) > 0 && product.minPrice != null
      ? priceRange({
          minPrice: salePrice(product.minPrice, discount.type, discount.value),
          maxPrice: salePrice(product.maxPrice ?? product.minPrice, discount.type, discount.value)
        })
      : '—';
  return (
    <Box
      onClick={blocked ? undefined : onToggle}
      sx={{
        display: 'grid',
        gridTemplateColumns: columns,
        alignItems: 'center',
        gap: 1.5,
        px: 1.25,
        py: 1,
        opacity: blocked ? 0.55 : 1,
        cursor: blocked ? 'not-allowed' : 'pointer',
        borderBottom: `1px solid ${C.border}`,
        bgcolor: checked ? C.yellowSelected : C.surface,
        '&:last-of-type': { borderBottom: 0 }
      }}
    >
      <Checkbox readOnly disableRipple size="small" checked={checked} disabled={blocked} sx={checkSx} />
      <Box sx={{ width: 40, height: 40, borderRadius: 1.5, overflow: 'hidden', bgcolor: C.bg, display: 'grid', placeItems: 'center' }}>
        {product.primaryImageUrl ? (
          <Box component="img" src={product.primaryImageUrl} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <PictureOutlined style={{ color: C.subtle }} />
        )}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>
          {productNameOf(product)}
        </Typography>
        <Typography noWrap sx={{ fontSize: 12, color: busy ? C.yellowText : C.muted }}>
          {busy ? `Đang thuộc KM ${busyLabel(busy)}` : [product.sku, categoryName].filter(Boolean).join(' · ') || '—'}
        </Typography>
      </Box>
      <Typography sx={{ ...desktop, fontSize: 13, textAlign: 'center', color: Number(product.totalStock) > 0 ? C.text : C.error }}>
        {Number(product.totalStock || 0).toLocaleString('vi-VN')}
      </Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text, textAlign: 'right' }}>{priceRange(product)}</Typography>
      <Typography sx={{ ...desktop, fontSize: 13, fontWeight: 700, color: C.yellowText, textAlign: 'right' }}>{sale}</Typography>
    </Box>
  );
}

// Bảng chọn sản phẩm cho khuyến mãi sản phẩm. busy: sản phẩm đã thuộc khuyến mãi khác trùng thời gian (không chọn được)
export default function ProductPicker({ products, loading, all, selected, busy, discount, onChange }) {
  const categories = useCategories();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');

  const categoryById = useMemo(() => new Map(categories.map((c) => [String(c.categoryId), c])), [categories]);
  const visible = useMemo(
    () =>
      products.filter((p) => {
        const id = String(p.categoryId);
        const inCategory = category === 'ALL' || id === category || String(categoryById.get(id)?.parentId) === category;
        return inCategory && [productNameOf(p), p.sku].some((v) => vi(v).includes(vi(search.trim())));
      }),
    [products, search, category, categoryById]
  );

  const current = all ? products.map(productIdOf) : selected;
  const visibleIds = visible.map(productIdOf).filter((id) => !busy[id]);
  const allVisibleChecked = visibleIds.length > 0 && visibleIds.every((id) => current.includes(id));
  const pick = (productIds) => onChange({ allProducts: false, productIds });
  const toggle = (id) => pick(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  const toggleVisible = () =>
    pick(allVisibleChecked ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);

  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' }, gap: 1.5, mb: 1.5 }}>
        <TextField
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm sản phẩm..."
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined style={{ color: C.subtle, fontSize: 15 }} />
                </InputAdornment>
              )
            }
          }}
          sx={fieldSx}
        />
        <CategorySelect categories={categories} value={category} onChange={setCategory} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box onClick={toggleVisible} sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <Checkbox readOnly disableRipple size="small" checked={allVisibleChecked} sx={checkSx} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: C.muted }}>Chọn tất cả</Typography>
        </Box>
        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: current.length ? C.yellowText : C.subtle }}>
          {products.length > 0 && current.length === products.length
            ? `Tất cả ${products.length} sản phẩm`
            : `Đã chọn ${current.length} sản phẩm`}
        </Typography>
      </Box>

      <Box sx={{ maxHeight: 420, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 2.5 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: columns,
            gap: 1.5,
            alignItems: 'center',
            px: 1.25,
            py: 1,
            bgcolor: C.bg,
            borderBottom: `1px solid ${C.border}`,
            position: 'sticky',
            top: 0,
            zIndex: 1
          }}
        >
          <Box />
          <Box />
          <Typography sx={headSx}>Sản phẩm</Typography>
          <Typography sx={{ ...headSx, ...desktop, textAlign: 'center' }}>Tồn kho</Typography>
          <Typography sx={{ ...headSx, textAlign: 'right' }}>Giá bán</Typography>
          <Typography sx={{ ...headSx, ...desktop, textAlign: 'right' }}>Giá sau giảm</Typography>
        </Box>
        {loading ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <CircularProgress size={26} sx={{ color: C.yellow }} />
          </Box>
        ) : !visible.length ? (
          <Typography sx={{ py: 3, textAlign: 'center', color: C.muted, fontSize: 13.5 }}>Không tìm thấy sản phẩm phù hợp.</Typography>
        ) : (
          visible.map((product) => {
            const id = productIdOf(product);
            return (
              <ProductRow
                key={id}
                product={product}
                checked={current.includes(id)}
                busy={busy[id]}
                discount={discount}
                categoryName={categoryById.get(String(product.categoryId))?.categoryName ?? product.categoryName}
                onToggle={() => toggle(id)}
              />
            );
          })
        )}
      </Box>
    </Box>
  );
}
