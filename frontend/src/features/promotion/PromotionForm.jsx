import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  InputAdornment,
  ListSubheader,
  MenuItem,
  Radio,
  RadioGroup,
  Snackbar,
  TextField,
  Typography
} from '@mui/material';
import { DownOutlined, PictureOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons';
import { categoryFullName, getCategories, sortCategoriesAsTree } from 'services/categoryService';
import { getActiveProductPromotions, overlaps } from 'services/promotionService';

const C = {
  text: '#202D42',
  muted: '#64748B',
  subtle: '#94A3B8',
  border: '#E2E8F0',
  main: '#FDE68A',
  mainHover: '#FCD34D',
  check: '#FCD34D',
  accent: '#92400E',
  selected: '#FFFBEB',
  dark: '#422006',
  error: '#EF4444'
};

const cardSx = { bgcolor: '#FFFFFF', borderRadius: 3.5, border: `1px solid ${C.border}`, p: { xs: 2.5, sm: 3 } };

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: '#FFFFFF',
    borderRadius: 2.5,
    fontSize: 14,
    '&, &.Mui-focused, &.Mui-error.Mui-focused': { boxShadow: 'none' },
    '& fieldset, &:hover fieldset, &.Mui-focused fieldset, &.Mui-error fieldset, &.Mui-error:hover fieldset, &.Mui-error.Mui-focused fieldset': {
      border: `1px solid ${C.border}`
    }
  },
  '& .MuiFormHelperText-root': { mx: 0.5, fontSize: 12 },
  '& .MuiInputLabel-root': { fontSize: 13.5 },
  '& .MuiInputLabel-root.Mui-focused, & .MuiInputLabel-root.Mui-error': { color: C.muted }
};

const PERCENT_PRESETS = [10, 20, 30, 40, 50];

export const emptyPromotion = {
  name: '',
  description: '',
  discountType: 'PERCENT',
  discountValue: '',
  minOrderValue: '',
  usageLimit: '',
  startDate: '',
  endDate: '',
  applyScope: 'SELECTED',
  productIds: []
};

export const productRows = (res) => (Array.isArray(res) ? res : res?.content ?? res?.data ?? []);
export const isOnline = (p) => p.status === 'ACTIVE' && Number(p.onlineVariantCount || 0) > 0;

const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;
const getProductId = (product) => Number(product.productId ?? product.id);
const getProductName = (product) => product.productName || product.name || 'Sản phẩm chưa có tên';
const getProductImage = (product) => product.primaryImageUrl || product.imageUrl || product.thumbnailUrl || product.image || '';
const priceRange = ({ minPrice, maxPrice }) => {
  if (minPrice == null && maxPrice == null) return 'Chưa có giá';
  if (minPrice == null || maxPrice == null || Number(minPrice) === Number(maxPrice)) return money(minPrice ?? maxPrice);
  return `${Number(minPrice).toLocaleString('vi-VN')} – ${money(maxPrice)}`;
};
const columns = { xs: '28px 44px minmax(0, 1fr) 120px', md: '28px 44px minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 0.8fr) minmax(0, 1.2fr)' };
const headSx = { fontSize: 11.5, fontWeight: 700, color: C.subtle, textTransform: 'uppercase', letterSpacing: 0.4 };
const desktop = { display: { xs: 'none', md: 'block' } };


const fromPromotion = (p) => ({
  kind: Number(p.minOrderValue) > 0 ? 'ORDER' : 'PRODUCT',
  name: p.name,
  description: p.description,
  discountType: p.discountType,
  discountValue: p.discountValue,
  minOrderValue: Number(p.minOrderValue) > 0 ? p.minOrderValue : '',
  usageLimit: p.usageLimit,
  usedCount: p.usedCount,
  startDate: p.startDate,
  endDate: p.endDate,
  allProducts: p.applyScope !== 'SELECTED',
  productIds: p.productIds
});

const nowInput = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

const dateText = (value) => new Date(value).toLocaleDateString('vi-VN');

function validate(form, minStart, originalStart, locked) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'Vui lòng nhập tên chương trình.';
  const value = Number(form.discountValue);
  const minOrder = Number(form.minOrderValue);
  const start = new Date(form.startDate);
  const end = new Date(form.endDate);
  if (!form.startDate) errors.startDate = 'Vui lòng chọn thời gian bắt đầu.';
  else if (form.startDate !== originalStart && form.startDate < minStart) errors.startDate = 'Thời gian bắt đầu phải từ hiện tại trở đi.';
  if (!form.endDate) errors.endDate = 'Vui lòng chọn thời gian kết thúc.';
  else if (form.startDate && end <= start) errors.endDate = 'Thời gian kết thúc phải sau thời gian bắt đầu.';
  else if (locked && end <= new Date()) errors.endDate = 'Thời gian kết thúc phải sau thời điểm hiện tại.';
  if (!form.discountValue) errors.discountValue = 'Vui lòng nhập mức giảm.';
  else if (!(value > 0)) errors.discountValue = 'Mức giảm phải lớn hơn 0.';
  else if (form.discountType === 'PERCENT' && value > 100) errors.discountValue = 'Mức giảm theo phần trăm tối đa là 100%.';
  if (form.kind === 'ORDER') {
    if (!(minOrder > 0)) errors.minOrderValue = 'Vui lòng nhập giá trị đơn tối thiểu.';
    else if (form.discountType === 'FIXED' && value >= minOrder) errors.discountValue = 'Số tiền giảm phải nhỏ hơn giá trị đơn tối thiểu.';
    if (!form.usageLimit) errors.usageLimit = 'Vui lòng nhập giới hạn lượt dùng.';
    else if (Number(form.usageLimit) < Math.max(1, Number(form.usedCount || 0)))
      errors.usageLimit = form.usedCount > 0 ? `Không được nhỏ hơn số lượt đã dùng (${form.usedCount}).` : 'Giới hạn lượt dùng phải từ 1 trở lên.';
  }
  if (form.kind === 'PRODUCT' && !form.allProducts && !form.productIds.length) errors.productIds = 'Vui lòng chọn ít nhất một sản phẩm.';
  return errors;
}

function Section({ title, description, locked, children }) {
  return (
    <Box sx={{ '& + &': { borderTop: `1px solid ${C.border}`, pt: 3, mt: 3 } }}>
      <Typography sx={{ fontSize: 16, fontWeight: 800, color: C.text }}>{title}</Typography>
      {description && <Typography sx={{ fontSize: 12.5, color: C.muted, mt: 0.25 }}>{description}</Typography>}
      <Box component="fieldset" disabled={locked} sx={{ border: 0, p: 0, m: 0, mt: 2, minWidth: 0, ...(locked && { opacity: 0.55, pointerEvents: 'none' }) }}>
        {children}
      </Box>
    </Box>
  );
}

function Pill({ active, children, onClick }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        px: 1.5,
        py: 0.6,
        borderRadius: 10,
        cursor: 'pointer',
        fontSize: 12.5,
        fontWeight: 700,
        fontFamily: 'inherit',
        border: `1px solid ${active ? C.main : C.border}`,
        bgcolor: active ? C.main : '#FFFFFF',
        color: active ? C.dark : C.muted
      }}
    >
      {children}
    </Box>
  );
}

function Segmented({ value, options, onChange }) {
  return (
    <Box sx={{ display: 'inline-flex', p: 0.5, borderRadius: 2.5, bgcolor: '#F1F5F9' }}>
      {options.map(([key, label]) => (
        <Box
          key={key}
          component="button"
          type="button"
          onClick={() => onChange(key)}
          sx={{
            px: 2,
            py: 0.75,
            border: 0,
            borderRadius: 2,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 700,
            bgcolor: value === key ? '#FFFFFF' : 'transparent',
            color: value === key ? C.text : C.muted,
            boxShadow: value === key ? '0 1px 3px rgba(15,23,42,0.1)' : 'none'
          }}
        >
          {label}
        </Box>
      ))}
    </Box>
  );
}

function MoneyField({ label, value, onChange, error, hint, suffix = 'đ' }) {
  return (
    <TextField
      label={label}
      error={Boolean(error)}
      helperText={error || hint}
      value={value === '' ? '' : suffix === 'đ' ? Number(value).toLocaleString('vi-VN') : value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
      fullWidth
      slotProps={{ input: { endAdornment: <InputAdornment position="end">{suffix}</InputAdornment> }, htmlInput: { inputMode: 'numeric' } }}
      sx={fieldSx}
    />
  );
}

function ProductPicker({ products, loading, all, selected, busy, onChange }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    getCategories()
      .then((res) => setCategories(sortCategoriesAsTree(productRows(res).filter((c) => c.status === 'ACTIVE'))))
      .catch(() => setCategories([]));
  }, []);

  const categoryName = (product) => {
    const found = categories.find((c) => String(c.categoryId) === String(product.categoryId));
    return found ? categoryFullName(found) : product.categoryName || 'Chưa phân loại';
  };
  const parentOf = useMemo(() => new Map(categories.map((c) => [String(c.categoryId), String(c.parentId ?? '')])), [categories]);
  const [expanded, setExpanded] = useState('');
  const groups = useMemo(
    () =>
      categories
        .filter((c) => !c.parentId)
        .map((root) => ({ root, children: categories.filter((c) => String(c.parentId) === String(root.categoryId)) })),
    [categories]
  );
  const categoryOptions = [
    <MenuItem key="ALL" value="ALL" sx={{ fontSize: 13.5 }}>
      Tất cả danh mục
    </MenuItem>,
    ...groups.flatMap(({ root, children }) => {
      const id = String(root.categoryId);
      if (!children.length)
        return [
          <MenuItem key={id} value={id} sx={{ fontSize: 13.5, fontWeight: 600 }}>
            {root.categoryName}
          </MenuItem>
        ];
      const open = expanded === id;
      return [
        <ListSubheader key={`group-${id}`} sx={{ position: 'static', p: 0, '&:hover': { bgcolor: '#F8FAFC' } }}>
          <Box
            onClick={() => setExpanded(open ? '' : id)}
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: C.text, lineHeight: '40px' }}
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
  const categoryLabel = (value) => {
    if (value === 'ALL') return 'Tất cả danh mục';
    const found = categories.find((c) => String(c.categoryId) === value);
    return found ? categoryFullName(found) : '';
  };
  const visible = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi-VN');
    return products.filter((p) => {
      const id = String(p.categoryId);
      const inCategory = category === 'ALL' || id === category || parentOf.get(id) === category;
      return inCategory && [getProductName(p), p.sku].some((v) => String(v || '').toLocaleLowerCase('vi-VN').includes(keyword));
    });
  }, [products, search, category, parentOf]);
  const current = all ? products.map(getProductId) : selected;
  const visibleIds = visible.map(getProductId).filter((id) => !busy[id]);
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
        <TextField
          select
          size="small"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          slotProps={{
            select: {
              renderValue: categoryLabel,
              onOpen: () => setExpanded(parentOf.get(category) || category),
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
          {categoryOptions}
          {!categoryOptions.some((o) => o.props.value === category) && <MenuItem value={category} sx={{ display: 'none' }} />}
        </TextField>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box onClick={toggleVisible} sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <Checkbox readOnly disableRipple size="small" checked={allVisibleChecked} sx={{ p: 0.5, '&:hover': { bgcolor: 'transparent' }, '&.Mui-checked': { color: C.check } }} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: C.muted }}>Chọn tất cả</Typography>
        </Box>
        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: current.length ? C.accent : C.subtle }}>
          {products.length > 0 && current.length === products.length ? `Tất cả ${products.length} sản phẩm` : `Đã chọn ${current.length} sản phẩm`}
        </Typography>
      </Box>

      <Box sx={{ maxHeight: 420, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 2.5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: columns, gap: 1.5, alignItems: 'center', px: 1.25, py: 1, bgcolor: '#F8FAFC', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 1 }}>
          <Box />
          <Box />
          <Typography sx={headSx}>Sản phẩm</Typography>
          <Typography sx={{ ...headSx, ...desktop }}>Danh mục</Typography>
          <Typography sx={{ ...headSx, ...desktop, textAlign: 'center' }}>Tồn kho</Typography>
          <Typography sx={{ ...headSx, textAlign: 'right' }}>Giá bán</Typography>
        </Box>
        {loading ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <CircularProgress size={26} sx={{ color: C.main }} />
          </Box>
        ) : !visible.length ? (
          <Typography sx={{ py: 3, textAlign: 'center', color: C.muted, fontSize: 13.5 }}>Không tìm thấy sản phẩm phù hợp.</Typography>
        ) : (
          visible.map((product) => {
            const id = getProductId(product);
            const checked = current.includes(id);
            const blocked = busy[id] && !checked;
            const image = getProductImage(product);
            return (
              <Box
                key={id}
                onClick={blocked ? undefined : () => toggle(id)}
                sx={{
                  opacity: blocked ? 0.55 : 1,
                  display: 'grid',
                  gridTemplateColumns: columns,
                  alignItems: 'center',
                  gap: 1.5,
                  px: 1.25,
                  py: 1,
                  cursor: blocked ? 'not-allowed' : 'pointer',
                  borderBottom: `1px solid ${C.border}`,
                  bgcolor: checked ? C.selected : '#FFFFFF',
                  '&:last-of-type': { borderBottom: 0 }
                }}
              >
                <Checkbox readOnly disableRipple size="small" checked={checked} disabled={blocked} sx={{ p: 0.5, '&:hover': { bgcolor: 'transparent' }, '&.Mui-checked': { color: C.check } }} />
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: 1.5,
                    overflow: 'hidden',
                    bgcolor: '#F8FAFC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {image ? (
                    <Box component="img" src={image} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <PictureOutlined style={{ color: C.subtle }} />
                  )}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>
                    {getProductName(product)}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: 12, color: busy[id] ? C.accent : C.muted }}>
                    {busy[id] ? `Đang thuộc KM “${busy[id].name}” (${dateText(busy[id].startDate)} – ${dateText(busy[id].endDate)})` : product.sku || '—'}
                  </Typography>
                </Box>
                <Typography noWrap sx={{ ...desktop, fontSize: 13, color: C.muted }}>
                  {categoryName(product)}
                </Typography>
                <Typography sx={{ ...desktop, fontSize: 13, textAlign: 'center', color: Number(product.totalStock) > 0 ? C.text : C.error }}>
                  {Number(product.totalStock || 0).toLocaleString('vi-VN')}
                </Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text, textAlign: 'right' }}>{priceRange(product)}</Typography>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}

export default function PromotionForm({ title, promotionId, initial, products, productsLoading, submitLabel, locked, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => fromPromotion(initial));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [minStart] = useState(nowInput);
  const [others, setOthers] = useState([]);

  useEffect(() => {
    getActiveProductPromotions(promotionId)
      .then(setOthers)
      .catch(() => setOthers([]));
  }, [promotionId]);

  const set = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setError('');
  };
  const isPercent = form.discountType === 'PERCENT';
  const allSelected = form.allProducts || (products.length > 0 && products.every((p) => form.productIds.includes(getProductId(p))));
  const busy = useMemo(() => {
    if (form.kind !== 'PRODUCT' || !form.startDate || !form.endDate) return {};
    return others
      .filter((p) => overlaps(p, form))
      .reduce((map, p) => {
        (p.applyScope === 'SELECTED' ? p.productIds.map(Number) : products.map(getProductId)).forEach((id) => {
          map[id] = map[id] || p;
        });
        return map;
      }, {});
  }, [form.kind, form.startDate, form.endDate, others, products]);

  const conflicts = (allSelected ? products.map(getProductId) : form.productIds).filter((id) => busy[id]);
  const conflictError = conflicts.length
    ? `“${getProductName(products.find((p) => getProductId(p) === conflicts[0]) || {})}”${conflicts.length > 1 ? ` và ${conflicts.length - 1} sản phẩm khác` : ''} đang thuộc khuyến mãi “${busy[conflicts[0]].name}” (${dateText(busy[conflicts[0]].startDate)} – ${dateText(busy[conflicts[0]].endDate)}).`
    : '';
  const check = () => ({ ...validate(form, minStart, initial.startDate, locked), ...(!locked && form.kind === 'PRODUCT' && conflictError && { productIds: conflictError }) });
  const errors = submitted ? check() : {};

  const formRef = useRef(null);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(check()).length) {
      setTimeout(() => {
        const target = formRef.current?.querySelector('.MuiInputBase-root.Mui-error, [data-error]');
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target?.querySelector('input, textarea')?.focus({ preventScroll: true });
      });
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        description: form.description,
        discountType: form.discountType,
        discountValue: form.discountValue,
        minOrderValue: form.kind === 'ORDER' ? form.minOrderValue : 0,
        usageLimit: form.kind === 'ORDER' ? form.usageLimit : '',
        startDate: form.startDate,
        endDate: form.endDate,
        applyScope: form.kind === 'ORDER' || allSelected ? 'ALL' : 'SELECTED',
        productIds: form.productIds
      });
    } catch (err) {
      setError(err?.message || 'Không thể lưu khuyến mãi. Vui lòng thử lại.');
      setSaving(false);
    }
  };

  return (
    <Box component="form" ref={formRef} noValidate onSubmit={handleSubmit} sx={{ color: C.text, pb: 4 }}>
      <Typography sx={{ mb: 3, fontSize: { xs: 22, sm: 28 }, fontWeight: 800 }}>{title}</Typography>

      {locked && (
        <Alert severity="warning" sx={{ mb: 2.5, borderRadius: 2.5, fontSize: 13.5 }}>
          Khuyến mãi đang diễn ra nên chỉ sửa được tên, mô tả, thời gian kết thúc và giới hạn lượt dùng. Muốn đổi mức giảm hoặc sản phẩm, hãy tắt khuyến mãi này rồi tạo khuyến mãi mới.
        </Alert>
      )}

      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError('')} anchorOrigin={{ vertical: 'top', horizontal: 'right' }} sx={{ mt: 7 }}>
        <Alert severity="error" onClose={() => setError('')} sx={{ bgcolor: '#FFFFFF', border: `1px solid ${C.border}`, borderLeft: '5px solid #EF4444', fontWeight: 600, fontSize: 13 }}>
          {error}
        </Alert>
      </Snackbar>

      <Box sx={cardSx}>
        <Section title="Thông tin chung" description="Tên, mô tả và thời gian diễn ra chương trình.">
          <TextField
            label="Tên chương trình"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            error={Boolean(errors.name)}
            helperText={errors.name || ' '}
            fullWidth
            slotProps={{ htmlInput: { maxLength: 100 } }}
            sx={fieldSx}
          />
          <TextField
            label="Mô tả (không bắt buộc)"
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            multiline
            minRows={2}
            fullWidth
            slotProps={{ htmlInput: { maxLength: 255 } }}
            sx={{ ...fieldSx, mb: 2 }}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField
              label="Bắt đầu"
              type="datetime-local"
              value={form.startDate}
              disabled={locked}
              onChange={(e) => set({ startDate: e.target.value })}
              error={Boolean(errors.startDate)}
              helperText={errors.startDate}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: initial.startDate && initial.startDate < minStart ? undefined : minStart } }}
              sx={fieldSx}
            />
            <TextField
              label="Kết thúc"
              type="datetime-local"
              value={form.endDate}
              onChange={(e) => set({ endDate: e.target.value })}
              error={Boolean(errors.endDate)}
              helperText={errors.endDate}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: form.startDate || minStart } }}
              sx={fieldSx}
            />
          </Box>
        </Section>

        <Section title="Loại giảm giá" locked={locked}>
          <RadioGroup value={form.kind} onChange={(e) => set({ kind: e.target.value })} sx={{ gap: 1.5 }}>
            {[
              ['PRODUCT', 'Giảm giá sản phẩm', 'Cho sản phẩm được chọn hoặc toàn bộ cửa hàng'],
              ['ORDER', 'Giảm theo đơn hàng', 'Khi tổng tiền đơn đạt mức tối thiểu']
            ].map(([value, label, hint]) => (
              <FormControlLabel
                key={value}
                value={value}
                control={<Radio disableRipple sx={{ '&:hover': { bgcolor: 'transparent' }, '&.Mui-checked': { color: C.check } }} />}
                label={
                  <Box>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>{label}</Typography>
                    <Typography sx={{ fontSize: 12.5, color: C.muted }}>{hint}</Typography>
                  </Box>
                }
                sx={{ m: 0, alignItems: 'flex-start', '& .MuiRadio-root': { mt: -0.5 } }}
              />
            ))}
          </RadioGroup>
        </Section>

        <Section title="Mức giảm" locked={locked}>
          <Segmented
            value={form.discountType}
            options={[
              ['PERCENT', 'Theo %'],
              ['FIXED', 'Số tiền']
            ]}
            onChange={(discountType) => set({ discountType, discountValue: '' })}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: form.kind === 'ORDER' ? '1fr 1fr' : '1fr' }, gap: 2, mt: 2 }}>
            <Box>
              <MoneyField
                label={isPercent ? 'Giảm bao nhiêu phần trăm' : 'Giảm bao nhiêu tiền'}
                value={form.discountValue}
                suffix={isPercent ? '%' : 'đ'}
                error={errors.discountValue}
                onChange={(discountValue) => set({ discountValue })}
              />
              {isPercent && (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1.25 }}>
                  {PERCENT_PRESETS.map((v) => (
                    <Pill key={v} active={Number(form.discountValue) === v} onClick={() => set({ discountValue: String(v) })}>
                      {v}%
                    </Pill>
                  ))}
                </Box>
              )}
            </Box>
            {form.kind === 'ORDER' && (
              <MoneyField label="Cho đơn hàng từ" value={form.minOrderValue} error={errors.minOrderValue} onChange={(minOrderValue) => set({ minOrderValue })} />
            )}
          </Box>
        </Section>

        {form.kind === 'ORDER' && (
          <Section title="Giới hạn lượt dùng" description="Tổng số đơn hàng được dùng voucher này.">
            <Box sx={{ maxWidth: { sm: 'calc(50% - 8px)' } }}>
              <MoneyField
                label="Số lượt"
                value={form.usageLimit}
                suffix="lượt"
                error={errors.usageLimit}
                hint={form.usedCount > 0 ? `Đã dùng ${form.usedCount} lượt.` : undefined}
                onChange={(usageLimit) => set({ usageLimit })}
              />
            </Box>
          </Section>
        )}

        {form.kind === 'PRODUCT' && (
          <Section title="Sản phẩm được giảm" description="Chọn sản phẩm được giảm, tick “Chọn tất cả” để áp dụng cho toàn bộ cửa hàng." locked={locked}>
            <ProductPicker
              products={products}
              loading={productsLoading}
              all={form.allProducts}
              selected={form.productIds}
              busy={busy}
              onChange={set}
            />
            {errors.productIds && (
              <Typography data-error sx={{ mt: 1, mx: 0.5, fontSize: 12, color: C.error }}>
                {errors.productIds}
              </Typography>
            )}
          </Section>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 3, pt: 2.5, borderTop: `1px solid ${C.border}` }}>
          <Button onClick={onCancel} disabled={saving} disableRipple sx={{ color: C.muted, borderRadius: 2.5, textTransform: 'none', px: 2.5, '&:hover': { bgcolor: 'transparent' } }}>
            Hủy
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveOutlined />}
            sx={{ minWidth: 170, bgcolor: C.main, color: C.dark, fontWeight: 700, borderRadius: 2.5, py: 1.1, boxShadow: 'none', textTransform: 'none', '&:hover': { bgcolor: C.main, boxShadow: 'none' } }}
          >
            {saving ? 'Đang lưu...' : submitLabel}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
