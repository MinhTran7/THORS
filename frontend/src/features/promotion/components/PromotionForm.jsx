import { useRef, useState } from 'react';
import { Box, Button, CircularProgress, InputAdornment, TextField, Typography } from '@mui/material';
import { SaveOutlined } from '@ant-design/icons';
import { useOtherProductPromotions } from '../hooks';
import { C, fieldSx } from '../theme';
import {
  busyLabel,
  busyProducts,
  productIdOf,
  productNameOf,
  toAdjustRequest,
  toInputDateTime,
  toRequest,
  validateAdjust,
  validatePromotion
} from '../utils';
import { ErrorToast } from './PromotionDialogs';
import ProductPicker from './ProductPicker';

const PERCENT_PRESETS = [10, 20, 30, 40, 50];

function Section({ title, description, children }) {
  return (
    <Box sx={{ '& + &': { borderTop: `1px solid ${C.border}`, pt: 3, mt: 3 } }}>
      <Typography sx={{ fontSize: 16, fontWeight: 800, color: C.text }}>{title}</Typography>
      {description && <Typography sx={{ fontSize: 12.5, color: C.muted, mt: 0.25 }}>{description}</Typography>}
      <Box sx={{ mt: 2, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

// Chọn nhanh % giảm
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
        fontFamily: 'inherit',
        fontSize: 12.5,
        fontWeight: 700,
        border: `1px solid ${active ? C.yellow : C.border}`,
        bgcolor: active ? C.yellow : C.surface,
        color: active ? C.yellowDark : C.muted
      }}
    >
      {children}
    </Box>
  );
}

function Segmented({ value, options, onChange, disabled }) {
  return (
    <Box sx={{ display: 'inline-flex', p: 0.5, borderRadius: 2.5, bgcolor: C.borderLight, opacity: disabled ? 0.6 : 1 }}>
      {options.map(([key, label]) => (
        <Box
          key={key}
          component="button"
          type="button"
          disabled={disabled}
          onClick={() => onChange(key)}
          sx={{
            px: 2,
            py: 0.75,
            border: 0,
            borderRadius: 2,
            cursor: disabled ? 'default' : 'pointer',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 700,
            bgcolor: value === key ? C.surface : 'transparent',
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

// Ô số nguyên tối đa 10 chữ số; đơn vị đ thì hiện dấu chấm ngăn cách hàng nghìn
function NumberField({ label, value, onChange, error, hint, disabled, suffix = 'đ' }) {
  return (
    <TextField
      label={label}
      disabled={disabled}
      error={Boolean(error)}
      helperText={error || hint}
      value={value === '' || suffix !== 'đ' ? value : Number(value).toLocaleString('vi-VN')}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
      fullWidth
      slotProps={{ input: { endAdornment: <InputAdornment position="end">{suffix}</InputAdornment> }, htmlInput: { inputMode: 'numeric' } }}
      sx={fieldSx}
    />
  );
}

// Form tạo/sửa khuyến mãi. adjustOnly: đang diễn ra, chỉ sửa ngày kết thúc (và lượt dùng của mã giảm giá)
// onSubmit nhận body đã chuẩn hóa; lỗi ném ra được hiện ở góc màn hình
export default function PromotionForm({
  kind,
  title,
  promotionId,
  initial,
  products,
  productsLoading,
  adjustOnly,
  submitLabel,
  onSubmit,
  onCancel
}) {
  const voucher = kind === 'ORDER';
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [minStart] = useState(() => toInputDateTime());
  const others = useOtherProductPromotions(promotionId, !voucher);
  const formRef = useRef(null);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const percent = form.discountType === 'PERCENT';
  const allSelected = form.allProducts || (products.length > 0 && products.every((p) => form.productIds.includes(productIdOf(p))));
  const busy = voucher ? {} : busyProducts(others, form, products);

  const check = () => {
    const errors = adjustOnly ? validateAdjust(form, kind, initial) : validatePromotion(form, kind, minStart, initial.startDate);
    const conflicts = (allSelected ? products.map(productIdOf) : form.productIds).filter((id) => busy[id]);
    if (conflicts.length) {
      const first = products.find((p) => productIdOf(p) === conflicts[0]) || {};
      const more = conflicts.length > 1 ? ` và ${conflicts.length - 1} sản phẩm khác` : '';
      errors.productIds = `“${productNameOf(first)}”${more} đang thuộc khuyến mãi ${busyLabel(busy[conflicts[0]])}.`;
    }
    return errors;
  };
  const errors = submitted ? check() : {};

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(check()).length) {
      // Chờ render lỗi rồi cuộn tới ô lỗi đầu tiên
      setTimeout(() => {
        const target = formRef.current?.querySelector('.MuiInputBase-root.Mui-error, [data-error]');
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target?.querySelector('input, textarea')?.focus({ preventScroll: true });
      });
      return;
    }
    setSaving(true);
    try {
      await onSubmit(adjustOnly ? toAdjustRequest(form) : toRequest(form, kind, allSelected));
    } catch (err) {
      setError(err.message || 'Không thể lưu khuyến mãi. Vui lòng thử lại.');
      setSaving(false);
    }
  };

  return (
    <Box component="form" ref={formRef} noValidate onSubmit={handleSubmit} sx={{ color: C.text, pb: 4 }}>
      <Typography sx={{ mb: 3, fontSize: { xs: 22, sm: 28 }, fontWeight: 800 }}>{title}</Typography>
      <ErrorToast message={error} onClose={() => setError('')} />

      <Box sx={{ bgcolor: C.surface, borderRadius: 3.5, border: `1px solid ${C.border}`, p: { xs: 2.5, sm: 3 } }}>
        <Section title="Thông tin chung" description="Tên, mô tả và thời gian diễn ra chương trình.">
          <TextField
            label="Tên chương trình"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            disabled={adjustOnly}
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
            disabled={adjustOnly}
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
              onChange={(e) => set({ startDate: e.target.value })}
              disabled={adjustOnly}
              error={Boolean(errors.startDate)}
              helperText={errors.startDate}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { min: initial.startDate && initial.startDate < minStart ? undefined : minStart }
              }}
              sx={fieldSx}
            />
            <TextField
              label="Kết thúc"
              type="datetime-local"
              value={form.endDate}
              onChange={(e) => set({ endDate: e.target.value })}
              error={Boolean(errors.endDate)}
              helperText={errors.endDate}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: adjustOnly ? initial.endDate : form.startDate || minStart } }}
              sx={fieldSx}
            />
          </Box>
        </Section>

        <Section title="Mức giảm">
          <Segmented
            value={form.discountType}
            options={[
              ['PERCENT', 'Theo %'],
              ['FIXED', 'Số tiền']
            ]}
            onChange={(discountType) => set({ discountType, discountValue: '', maxDiscountAmount: '' })}
            disabled={adjustOnly}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: voucher ? '1fr 1fr' : '1fr' }, gap: 2, mt: 2 }}>
            <Box>
              <NumberField
                label={percent ? 'Giảm bao nhiêu phần trăm' : 'Giảm bao nhiêu tiền'}
                value={form.discountValue}
                suffix={percent ? '%' : 'đ'}
                error={errors.discountValue}
                disabled={adjustOnly}
                onChange={(discountValue) => set({ discountValue })}
              />
              {percent && !adjustOnly && (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1.25 }}>
                  {PERCENT_PRESETS.map((v) => (
                    <Pill key={v} active={Number(form.discountValue) === v} onClick={() => set({ discountValue: String(v) })}>
                      {v}%
                    </Pill>
                  ))}
                </Box>
              )}
            </Box>
            {voucher && (
              <NumberField
                label="Cho đơn hàng từ"
                value={form.minOrderValue}
                error={errors.minOrderValue}
                disabled={adjustOnly}
                onChange={(minOrderValue) => set({ minOrderValue })}
              />
            )}
            {voucher && percent && (
              <NumberField
                label="Giảm tối đa (không bắt buộc)"
                value={form.maxDiscountAmount}
                error={errors.maxDiscountAmount}
                hint="Để trống nếu không giới hạn số tiền giảm."
                disabled={adjustOnly}
                onChange={(maxDiscountAmount) => set({ maxDiscountAmount })}
              />
            )}
          </Box>
        </Section>

        {voucher && (
          <Section title="Giới hạn lượt dùng" description="Tổng số đơn hàng được dùng voucher này.">
            <Box sx={{ maxWidth: { sm: 'calc(50% - 8px)' } }}>
              <NumberField
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

        {!voucher && (
          <Section title="Sản phẩm được giảm" description="Chọn sản phẩm được giảm, tick “Chọn tất cả” để áp dụng cho toàn bộ cửa hàng.">
            <Box aria-disabled={adjustOnly} sx={adjustOnly ? { pointerEvents: 'none', opacity: 0.6 } : undefined}>
              <ProductPicker
                products={products}
                loading={productsLoading}
                all={form.allProducts}
                selected={form.productIds}
                busy={busy}
                discount={{ type: form.discountType, value: form.discountValue }}
                onChange={set}
              />
            </Box>
            {errors.productIds && (
              <Typography data-error sx={{ mt: 1, mx: 0.5, fontSize: 12, color: C.error }}>
                {errors.productIds}
              </Typography>
            )}
          </Section>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 3, pt: 2.5, borderTop: `1px solid ${C.border}` }}>
          <Button
            onClick={onCancel}
            disabled={saving}
            disableRipple
            sx={{ color: C.muted, borderRadius: 2.5, textTransform: 'none', px: 2.5, '&:hover': { bgcolor: 'transparent' } }}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveOutlined />}
            sx={{
              minWidth: 170,
              bgcolor: C.yellow,
              color: C.yellowDark,
              fontWeight: 700,
              borderRadius: 2.5,
              py: 1.1,
              boxShadow: 'none',
              textTransform: 'none',
              '&:hover': { bgcolor: C.yellow, boxShadow: 'none' }
            }}
          >
            {saving ? 'Đang lưu...' : submitLabel}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
