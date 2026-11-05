import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import { CloseOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from 'services/http';
import { createCategory, getCategories } from 'services/categoryService';
import { Choice, Field } from './components';
import { money, number } from './model';

const MAX_MONEY = 999999999999;
const PRICE_STEP = 1000;
const emptyRow = (v = {}) => ({ color: v.color || '', size: v.size || '', quantity: '1', unitPrice: '', salePrice: '' });
// Whitespace is normalised; case is ignored only for duplicate checks; accents/wording are kept.
const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
const key = (color, size) => `${clean(color).toLocaleLowerCase('vi')}\u0000${clean(size).toLocaleLowerCase('vi')}`;

/**
 * Strict VND parser for typed or pasted text: "80000", "80.000", "80,000 đ" → 80000.
 * Anything ambiguous ("1.5", "-3", "80.00") is invalid instead of being silently rewritten.
 */
export function parseMoney(text) {
  const s = String(text ?? '').replace(/\s|đ|₫|vnđ|vnd/gi, '');
  if (!s) return { empty: true };
  if (/^\d+$/.test(s) || /^\d{1,3}([.,]\d{3})+$/.test(s)) {
    const value = Number(s.replace(/[.,]/g, ''));
    if (value <= MAX_MONEY) return { value };
  }
  return { invalid: true };
}
const parseQty = (text) => {
  const s = String(text ?? '').trim();
  return /^\d+$/.test(s) && Number(s) >= 1 && Number(s) <= 1000000 ? Number(s) : null;
};
const formatMoney = (v) => new Intl.NumberFormat('vi-VN').format(v);

/** Field-level checks; an empty purchase price is an error, never 0. Sale price is optional. */
function rowErrors(rows, withOrderFields, existingKeys) {
  const seen = new Map();
  rows.forEach((r) => {
    if (clean(r.color) && clean(r.size)) seen.set(key(r.color, r.size), (seen.get(key(r.color, r.size)) || 0) + 1);
  });
  return rows.map((r) => {
    const e = {};
    if (!clean(r.color)) e.color = 'Nhập màu.';
    else if (clean(r.color).length > 30) e.color = 'Tối đa 30 ký tự.';
    if (!clean(r.size)) e.size = 'Nhập size.';
    else if (clean(r.size).length > 10) e.size = 'Tối đa 10 ký tự.';
    if (!e.color && !e.size) {
      if (seen.get(key(r.color, r.size)) > 1) e.size = 'Trùng màu/size trong form.';
      else if (existingKeys.has(key(r.color, r.size))) e.size = 'Biến thể đã có — hãy chọn hàng có sẵn ở bảng chọn hàng.';
    }
    if (withOrderFields) {
      if (parseQty(r.quantity) == null) e.quantity = 'Số nguyên dương (1–1.000.000).';
      const p = parseMoney(r.unitPrice);
      if (p.empty) e.unitPrice = 'Nhập đơn giá nhập.';
      else if (p.invalid) e.unitPrice = 'Số tiền VNĐ không hợp lệ.';
    }
    const sale = parseMoney(r.salePrice);
    if (sale.empty) e.salePrice = 'Nhập giá bán.';
    else if (sale.invalid) e.salePrice = 'Số tiền VNĐ không hợp lệ.';
    return e;
  });
}

const stepper = (label, onClick, disabled, icon) => (
  <IconButton size="small" aria-label={label} disabled={disabled} onClick={onClick} edge={icon === 'minus' ? 'start' : 'end'}>
    {icon === 'minus' ? <MinusOutlined /> : <PlusOutlined />}
  </IconButton>
);

/** Integer quantity with always-visible −/+ (step 1, never below 1); typing allowed. */
function QuantityField({ value, onChange, label, error, disabled }) {
  const n = parseQty(value);
  return (
    <TextField
      size="small"
      fullWidth
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      error={Boolean(error)}
      helperText={error || ' '}
      slotProps={{
        htmlInput: { inputMode: 'numeric', 'aria-label': label, style: { textAlign: 'center' } },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              {stepper(`Giảm ${label}`, () => onChange(String(Math.max(1, (n ?? 2) - 1))), disabled || (n != null && n <= 1), 'minus')}
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              {stepper(`Tăng ${label}`, () => onChange(String(Math.min(1000000, (n ?? 0) + 1))), disabled || n >= 1000000, 'plus')}
            </InputAdornment>
          )
        }
      }}
    />
  );
}

/**
 * VND input: raw text while focused, thousand separators when not; −/+ step 1.000đ, never negative.
 * When empty and allowEmpty (sale price), −/+ are disabled so nothing is filled in automatically.
 */
function MoneyField({ value, onChange, label, error, disabled, allowEmpty, emptyHint }) {
  const [focused, setFocused] = useState(false);
  const parsed = parseMoney(value);
  const shown = focused || parsed.value == null ? value : formatMoney(parsed.value);
  const stepDisabled = disabled || parsed.invalid || (parsed.empty && allowEmpty);
  const base = parsed.value ?? 0;
  return (
    <TextField
      size="small"
      fullWidth
      value={shown}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (parsed.value != null) onChange(String(parsed.value));
      }}
      onChange={(e) => onChange(e.target.value)}
      error={Boolean(error)}
      helperText={error || (parsed.value != null ? `${formatMoney(parsed.value)} ₫` : parsed.empty ? emptyHint || ' ' : ' ')}
      slotProps={{
        htmlInput: { inputMode: 'numeric', 'aria-label': label, style: { textAlign: 'right' } },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              {stepper(`Giảm ${label}`, () => onChange(String(Math.max(0, base - PRICE_STEP))), stepDisabled || base <= 0, 'minus')}
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              {stepper(`Tăng ${label}`, () => onChange(String(Math.min(MAX_MONEY, base + PRICE_STEP))), stepDisabled, 'plus')}
            </InputAdornment>
          )
        }
      }}
    />
  );
}

/** Free text with suggestions from existing variants; whitespace normalised on blur. */
function SuggestField({ value, onChange, options, label, error, disabled, maxLength }) {
  return (
    <Autocomplete
      freeSolo
      disableClearable
      options={options}
      inputValue={value}
      disabled={disabled}
      onInputChange={(_, v, reason) => reason !== 'reset' && onChange(v)}
      onChange={(_, v) => onChange(clean(v))}
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          error={Boolean(error)}
          helperText={error || ' '}
          onBlur={() => clean(value) !== value && onChange(clean(value))}
          slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps?.htmlInput, 'aria-label': label, maxLength } }}
        />
      )}
    />
  );
}

/**
 * Quick catalogue creation inside a purchase order. Per variant: order quantity and purchase price
 * (go to the order line, stock_receipt_item.unit_price) and a required sale price
 * (product_detail.price, written through the product module's normal create).
 * New variants have stock 0 and online sales off; nothing is created until "Tạo và thêm vào phiếu".
 *
 * onCreated(rows) adds the rows to the order and returns an error message ('' when done). After a
 * successful create the result is kept, so retrying never calls the catalogue API twice.
 */
export default function QuickCreateDialog({ initial = {}, products, variants = [], withOrderFields = true, onCreated, onClose }) {
  const [mode, setMode] = useState(initial.productId ? 'variant' : 'product');
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [newCategory, setNewCategory] = useState(null);
  const [categoryError, setCategoryError] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [name, setName] = useState(initial.productName || '');
  const [productId, setProductId] = useState(initial.productId || '');
  const [rows, setRows] = useState([emptyRow(initial)]);
  const [similar, setSimilar] = useState([]);
  const [allowSimilar, setAllowSimilar] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const created = useRef(null);

  const loadCategories = () =>
    getCategories().then((list) => {
      const active = (list || []).filter((c) => c.status === 'ACTIVE');
      setCategories(active);
      return active;
    });

  useEffect(() => {
    loadCategories().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (mode !== 'product' || name.trim().length < 2) {
      setSimilar([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      api(`/warehouse/catalog/similar?name=${encodeURIComponent(name.trim())}`)
        .then(setSimilar)
        .catch(() => setSimilar([]));
    }, 350);
    return () => clearTimeout(timer);
  }, [name, mode]);

  // Suggestions come from existing variants; no colour/size table is added.
  const suggestions = useMemo(() => {
    const pick = (field) => [...new Map(variants.map((v) => [clean(v[field]).toLocaleLowerCase('vi'), clean(v[field])])).values()].filter(Boolean);
    return { color: pick('color').sort((a, b) => a.localeCompare(b, 'vi')), size: pick('size') };
  }, [variants]);

  const existingKeys = new Set(
    mode === 'variant' && productId ? variants.filter((v) => v.product_id === Number(productId)).map((v) => key(v.color, v.size)) : []
  );
  const errors = rowErrors(rows, withOrderFields, existingKeys);
  const headerError =
    mode === 'product'
      ? !name.trim()
        ? 'Nhập tên sản phẩm.'
        : name.trim().length > 200
          ? 'Tên tối đa 200 ký tự.'
          : !categoryId
            ? 'Chọn danh mục.'
            : ''
      : !productId
        ? 'Chọn sản phẩm có sẵn.'
        : '';
  const exact = similar.filter((p) => p.exact);
  const lineAmount = (r) => {
    const q = parseQty(r.quantity);
    const p = parseMoney(r.unitPrice).value;
    return q != null && p != null ? q * p : null;
  };
  const totalQty = rows.reduce((n, r) => n + (parseQty(r.quantity) ?? 0), 0);
  const totalAmount = rows.reduce((n, r) => n + (lineAmount(r) ?? 0), 0);
  const locked = Boolean(created.current);
  const setRow = (idx, patch) => setRows((old) => old.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

  const saveCategory = async () => {
    const categoryName = clean(newCategory);
    setCategoryError('');
    if (!categoryName) return setCategoryError('Nhập tên danh mục.');
    if (categoryName.length > 100) return setCategoryError('Tên danh mục tối đa 100 ký tự.');
    const same = categories.find((c) => clean(c.categoryName).toLocaleLowerCase('vi') === categoryName.toLocaleLowerCase('vi'));
    if (same) return setCategoryError(`Danh mục “${same.categoryName}” đã có — hãy chọn trong danh sách.`);
    if (categoryBusy) return undefined;
    setCategoryBusy(true);
    try {
      await createCategory({ categoryName });
      const list = await loadCategories();
      const createdCategory = list.find((c) => clean(c.categoryName).toLocaleLowerCase('vi') === categoryName.toLocaleLowerCase('vi'));
      if (createdCategory) setCategoryId(createdCategory.categoryId);
      setNewCategory(null);
    } catch (e) {
      setCategoryError(e.code === 'CATEGORY_NAME_EXISTS' ? 'Tên danh mục đã tồn tại (có thể đang ngừng hoạt động).' : e.message);
    } finally {
      setCategoryBusy(false);
    }
    return undefined;
  };

  // Order data travels with the created variants; the catalogue API only receives the sale price.
  const withOrder = (result) =>
    result.variants.map((v) => {
      const row = rows.find((r) => key(r.color, r.size) === key(v.color, v.size)) || {};
      return {
        ...v,
        product_id: result.product_id,
        product_name: result.product_name,
        ...(withOrderFields ? { order_quantity: parseQty(row.quantity), order_unit_price: parseMoney(row.unitPrice).value } : {})
      };
    });

  const finish = (result) => {
    const message = onCreated(withOrder(result));
    if (message) setError(`${message} Hàng đã tạo trong catalog được giữ lại; bấm lại sẽ không tạo lần nữa.`);
  };

  const submit = async () => {
    if (sending.current) return; // double-click guard
    setError('');
    if (created.current) return finish(created.current); // retry adding without re-creating
    setShowErrors(true);
    if (headerError || errors.some((e) => Object.keys(e).length)) return;
    const payload = rows.map((r) => ({ color: clean(r.color), size: clean(r.size), salePrice: parseMoney(r.salePrice).value }));
    sending.current = true;
    setBusy(true);
    try {
      const result =
        mode === 'product'
          ? await api('/warehouse/catalog/products', {
              method: 'POST',
              body: { categoryId: Number(categoryId), productName: clean(name), variants: payload, allowSimilar }
            })
          : await api(`/warehouse/catalog/products/${productId}/variants`, { method: 'POST', body: { variants: payload } });
      created.current = result;
      finish(result);
    } catch (e) {
      setError(e.code === 'SIMILAR_PRODUCT' ? `${e.message} Nếu chắc chắn là sản phẩm khác, đánh dấu xác nhận rồi bấm lại.` : e.message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const err = (idx, field) => (showErrors ? errors[idx][field] : '');

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="xl">
      <DialogTitle>Tạo nhanh hàng mới</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Tabs value={mode} onChange={(_, v) => !locked && setMode(v)}>
            <Tab value="product" label="Sản phẩm mới" />
            <Tab value="variant" label="Thêm màu/size cho sản phẩm có sẵn" />
          </Tabs>
          <Alert severity="info">
            {withOrderFields
              ? 'Nhập thông tin hàng mới, số lượng đặt và giá nhập để thêm vào phiếu. Hàng mới chưa có tồn kho và chưa bật bán online.'
              : 'Tạo hàng mới cho dòng Excel; số lượng và giá nhập lấy từ file. Hàng mới chưa có tồn kho và chưa bật bán online.'}
          </Alert>
          {mode === 'product' ? (
            <>
              <Field
                id="quick-name"
                label="Tên sản phẩm"
                value={name}
                disabled={locked}
                onChange={(e) => setName(e.target.value)}
                error={showErrors && headerError.startsWith('Nhập tên')}
                slotProps={{ htmlInput: { maxLength: 200 } }}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'flex-end' } }}>
                <Box sx={{ flex: 1 }}>
                  <Choice
                    label="Danh mục"
                    value={categoryId}
                    disabled={locked}
                    error={showErrors && headerError === 'Chọn danh mục.'}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <MenuItem value="">Chọn danh mục đang hoạt động</MenuItem>
                    {categories.map((c) => (
                      <MenuItem key={c.categoryId} value={c.categoryId}>
                        {c.categoryName}
                      </MenuItem>
                    ))}
                  </Choice>
                </Box>
                <Button variant="outlined" disabled={locked || newCategory != null} onClick={() => setNewCategory('')}>
                  + Thêm danh mục
                </Button>
              </Stack>
              {newCategory != null && (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'flex-start' } }}>
                  <TextField
                    size="small"
                    autoFocus
                    sx={{ flex: 1 }}
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    error={Boolean(categoryError)}
                    helperText={categoryError || 'Danh mục chỉ được tạo khi bấm “Lưu danh mục”.'}
                    slotProps={{ htmlInput: { maxLength: 100, 'aria-label': 'Tên danh mục mới' } }}
                  />
                  <Button variant="contained" disabled={categoryBusy} onClick={saveCategory}>
                    {categoryBusy ? 'Đang lưu…' : 'Lưu danh mục'}
                  </Button>
                  <Button
                    disabled={categoryBusy}
                    onClick={() => {
                      setNewCategory(null);
                      setCategoryError('');
                    }}
                  >
                    Hủy
                  </Button>
                </Stack>
              )}
              {similar.length > 0 && !locked && (
                <Alert severity={exact.length ? 'warning' : 'info'}>
                  <Typography variant="subtitle2">
                    Có sản phẩm tên gần giống trong catalog. Tên giống nhau chưa chắc là cùng sản phẩm — hãy kiểm tra. Nếu là hàng có sẵn,
                    chọn ở bảng chọn hàng hoặc thêm màu/size cho sản phẩm đó.
                  </Typography>
                  {similar.map((p) => (
                    <Stack key={p.product_id} direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5, flexWrap: 'wrap' }}>
                      <Typography variant="body2">
                        #{p.product_id} · {p.product_name} · {p.category_name || 'Không danh mục'}
                        {p.variants.length ? ` (${p.variants.map((v) => `${v.color}/${v.size}`).join(', ')})` : ''}
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => {
                          setProductId(p.product_id);
                          setMode('variant');
                        }}
                      >
                        Thêm màu/size cho sản phẩm này
                      </Button>
                    </Stack>
                  ))}
                </Alert>
              )}
              {exact.length > 0 && !locked && (
                <FormControlLabel
                  control={<Checkbox checked={allowSimilar} onChange={(e) => setAllowSimilar(e.target.checked)} />}
                  label="Tôi xác nhận đây là sản phẩm khác, vẫn tạo mới"
                />
              )}
            </>
          ) : (
            <Choice
              label="Sản phẩm có sẵn"
              value={productId}
              disabled={locked}
              error={showErrors && Boolean(headerError)}
              onChange={(e) => setProductId(e.target.value)}
            >
              <MenuItem value="">Chọn sản phẩm</MenuItem>
              {(products || []).map((p) => (
                <MenuItem key={p.product_id} value={p.product_id}>
                  #{p.product_id} · {p.product_name}
                </MenuItem>
              ))}
            </Choice>
          )}
          {showErrors && headerError && <Alert severity="warning">{headerError}</Alert>}

          <Typography variant="subtitle2">Biến thể cần tạo</Typography>
          <Box sx={{ overflowX: 'auto', maxHeight: 380, overflowY: 'auto' }}>
            <Table size="small" stickyHeader sx={{ minWidth: withOrderFields ? 1180 : 720, '& td': { verticalAlign: 'top', px: 1 } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 170 }}>Màu</TableCell>
                  <TableCell sx={{ minWidth: 120 }}>Size</TableCell>
                  {withOrderFields && <TableCell sx={{ minWidth: 160 }}>Số lượng đặt</TableCell>}
                  {withOrderFields && <TableCell sx={{ minWidth: 210 }}>Đơn giá nhập (VNĐ)</TableCell>}
                  <TableCell sx={{ minWidth: 210 }}>Giá bán (VNĐ)</TableCell>
                  {withOrderFields && (
                    <TableCell align="right" sx={{ minWidth: 140 }}>
                      Thành tiền nhập
                    </TableCell>
                  )}
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <SuggestField
                        label={`Màu dòng ${idx + 1}`}
                        value={r.color}
                        options={suggestions.color}
                        disabled={locked}
                        maxLength={30}
                        error={err(idx, 'color')}
                        onChange={(v) => setRow(idx, { color: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <SuggestField
                        label={`Size dòng ${idx + 1}`}
                        value={r.size}
                        options={suggestions.size}
                        disabled={locked}
                        maxLength={10}
                        error={err(idx, 'size')}
                        onChange={(v) => setRow(idx, { size: v })}
                      />
                    </TableCell>
                    {withOrderFields && (
                      <TableCell>
                        <QuantityField
                          label={`Số lượng đặt dòng ${idx + 1}`}
                          value={r.quantity}
                          disabled={locked}
                          error={err(idx, 'quantity') || (r.quantity !== '' && parseQty(r.quantity) == null ? 'Số nguyên dương (1–1.000.000).' : '')}
                          onChange={(v) => setRow(idx, { quantity: v })}
                        />
                      </TableCell>
                    )}
                    {withOrderFields && (
                      <TableCell>
                        <MoneyField
                          label={`Đơn giá nhập dòng ${idx + 1}`}
                          value={r.unitPrice}
                          disabled={locked}
                          error={err(idx, 'unitPrice') || (parseMoney(r.unitPrice).invalid ? 'Số tiền VNĐ không hợp lệ.' : '')}
                          onChange={(v) => setRow(idx, { unitPrice: v })}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <MoneyField
                        label={`Giá bán dòng ${idx + 1}`}
                        value={r.salePrice}
                        disabled={locked}
                        error={err(idx, 'salePrice') || (parseMoney(r.salePrice).invalid ? 'Số tiền VNĐ không hợp lệ.' : '')}
                        onChange={(v) => setRow(idx, { salePrice: v })}
                      />
                    </TableCell>
                    {withOrderFields && (
                      <TableCell align="right" sx={{ pt: 2.25, whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {lineAmount(r) != null ? money(lineAmount(r)) : '—'}
                      </TableCell>
                    )}
                    <TableCell>
                      <IconButton
                        aria-label={`Xóa dòng ${idx + 1}`}
                        disabled={rows.length === 1 || locked}
                        onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                      >
                        <CloseOutlined />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 1 }}>
            <Button disabled={rows.length >= 50 || locked} onClick={() => setRows([...rows, emptyRow({ color: rows.at(-1)?.color })])}>
              Thêm màu/size
            </Button>
            {withOrderFields && (
              <Typography variant="subtitle1">
                Tổng số lượng: <b>{number(totalQty)}</b> · Tổng tiền nhập: <b>{money(totalAmount)}</b>
              </Typography>
            )}
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>
          Quay lại
        </Button>
        <Button variant="contained" disabled={busy} onClick={submit}>
          {busy ? 'Đang tạo…' : withOrderFields ? 'Tạo và thêm vào phiếu' : 'Tạo và dùng cho dòng Excel'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
