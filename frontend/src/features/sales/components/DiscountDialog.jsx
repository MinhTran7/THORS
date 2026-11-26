import { useEffect, useState } from 'react';
import { Box, Button, Dialog, InputAdornment, TextField, Typography } from '@mui/material';
import { C, choiceSx, NO_EFFECTS, outlineButtonSx, primaryButtonSx } from '../theme';
import { discountAmount, formatNumberInput, money } from '../utils';

const TYPES = [
  { value: 'amount', label: 'VNĐ' },
  { value: 'percent', label: '%' }
];

// Giảm giá tay theo VNĐ hoặc %; maxPercent: giới hạn theo vai trò (null là không giới hạn)
export default function DiscountDialog({ open, type, value, subtotal, maxPercent, onApply, onClose }) {
  const [draftType, setDraftType] = useState(type);
  const [draftValue, setDraftValue] = useState(value);
  const [draftError, setDraftError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraftType(type);
    setDraftValue(value);
    setDraftError('');
  }, [open, type, value]);

  function apply() {
    const number = Number(draftValue) || 0;
    if (draftType === 'percent' && number > 100) return setDraftError('Phần trăm giảm tối đa là 100%.');
    if (draftType === 'amount' && number > subtotal) return setDraftError('Giảm giá không được vượt quá tổng tiền hàng.');
    const amount = discountAmount(draftType, number, subtotal);
    if (maxPercent != null && amount * 100 > subtotal * maxPercent)
      return setDraftError(`Thành viên gia đình chỉ được giảm tối đa ${maxPercent}% tổng tiền hàng.`);
    onApply(draftType, draftValue);
  }

  return (
    <Dialog
      className={NO_EFFECTS}
      open={open}
      onClose={onClose}
      fullWidth
      slotProps={{ paper: { sx: { maxWidth: 380, borderRadius: 3.5, m: 2 } } }}
    >
      <Box sx={{ p: 2.5 }}>
        <Typography sx={{ fontSize: 16.5, fontWeight: 800, color: C.text, mb: 2 }}>Giảm giá</Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
          {TYPES.map((opt) => {
            const selected = draftType === opt.value;
            return (
              <Box
                key={opt.value}
                component="button"
                type="button"
                onClick={() => {
                  setDraftType(opt.value);
                  setDraftValue('');
                  setDraftError('');
                }}
                sx={{ ...choiceSx(selected), height: 36 }}
              >
                {opt.label}
              </Box>
            );
          })}
        </Box>

        <TextField
          fullWidth
          autoFocus
          size="small"
          placeholder={draftType === 'percent' ? 'Nhập % giảm' : 'Nhập số tiền giảm'}
          value={draftType === 'amount' ? formatNumberInput(draftValue) : draftValue}
          onChange={(e) => {
            setDraftValue(e.target.value.replace(/\D/g, '').slice(0, draftType === 'percent' ? 3 : 12));
            setDraftError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          error={Boolean(draftError)}
          helperText={
            draftError ||
            (draftType === 'percent' && Number(draftValue) > 0
              ? `= ${money(discountAmount('percent', draftValue, subtotal))}`
              : `Tổng tiền hàng: ${money(subtotal)}${maxPercent != null ? ` · Giảm tối đa ${maxPercent}%` : ''}`)
          }
          slotProps={{
            input: { endAdornment: <InputAdornment position="end">{draftType === 'percent' ? '%' : 'đ'}</InputAdornment> },
            htmlInput: { inputMode: 'numeric' }
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, height: 40 } }}
        />

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2.5 }}>
          <Button type="button" onClick={onClose} sx={{ ...outlineButtonSx, fontSize: 12.5, height: 34, px: 2 }}>
            Hủy
          </Button>
          <Button
            type="button"
            variant="contained"
            onClick={apply}
            sx={{ ...primaryButtonSx, fontSize: 12.5, height: 34, px: 2, borderRadius: 1.5 }}
          >
            Áp dụng
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}
