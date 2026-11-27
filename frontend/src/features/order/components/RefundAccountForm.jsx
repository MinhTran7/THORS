import PropTypes from 'prop-types';
import { Box, MenuItem, TextField, Typography } from '@mui/material';
import { VIETNAMESE_BANKS } from 'utils/vietqr';

// Tài khoản nhận tiền hoàn: { bankBin, bankName, accountNumber, accountName }

const INTERMEDIARY_KEYWORDS = ['CONG TY', 'DICH VU DI DONG', 'M_SERVICE', 'ZALOPAY', 'SHOPEEPAY', 'VNPAY'];

export function isLikelyIntermediaryAccount(account) {
  if (!account?.accountNumber) return false;
  const name = String(account.accountName || '').trim().toUpperCase();
  if (!name) return true;
  return INTERMEDIARY_KEYWORDS.some((kw) => name.includes(kw));
}

export function isUsableRefundAccount(account) {
  return Boolean(
    account?.bankBin &&
      /^\d{6,19}$/.test(String(account.accountNumber || '').replace(/\s/g, '')) &&
      String(account.accountName || '').trim() &&
      !isLikelyIntermediaryAccount(account)
  );
}

/** Tài khoản rỗng; chỉ điền sẵn nếu PayOS trả về tài khoản ngân hàng cá nhân đầy đủ (bỏ qua ví trung gian). */
export function initialRefundAccount(payer) {
  if (isUsableRefundAccount(payer)) {
    const bank = VIETNAMESE_BANKS.find((b) => b.bin === String(payer.bankBin || ''));
    return {
      bankBin: payer.bankBin || '',
      bankName: bank?.shortName || payer.bankName || '',
      accountNumber: payer.accountNumber || '',
      accountName: (payer.accountName || '').toUpperCase()
    };
  }
  return { bankBin: '', bankName: '', accountNumber: '', accountName: '' };
}

/** '' = hợp lệ; còn lại là câu báo lỗi (cùng luật với backend). */
export function validateRefundAccount(account) {
  if (!account?.bankBin) return 'Vui lòng chọn ngân hàng nhận tiền hoàn.';
  if (!/^\d{6,19}$/.test(String(account.accountNumber || '').replace(/\s/g, ''))) {
    return 'Số tài khoản chỉ gồm 6–19 chữ số.';
  }
  if (!String(account.accountName || '').trim()) return 'Vui lòng nhập tên chủ tài khoản.';
  if (isLikelyIntermediaryAccount(account)) {
    return 'Không dùng tài khoản trung gian ví điện tử. Hãy nhập tài khoản ngân hàng cá nhân của khách.';
  }
  return '';
}

/**
 * Form nhập tài khoản nhận tiền hoàn (cửa hàng không hoàn tiền tự động: chủ shop quét mã VietQR tạo từ
 * tài khoản này để chuyển trả). prefilled = true khi đã điền sẵn từ tài khoản khách dùng để thanh toán.
 */
export default function RefundAccountForm({ value, onChange, disabled, prefilled }) {
  // Ngân hàng của tài khoản người chuyển có thể không nằm trong danh sách phổ biến -> vẫn hiện để chọn
  const banks =
    value.bankBin && !VIETNAMESE_BANKS.some((b) => b.bin === value.bankBin)
      ? [{ bin: value.bankBin, shortName: value.bankName || value.bankBin, name: value.bankName || value.bankBin }, ...VIETNAMESE_BANKS]
      : VIETNAMESE_BANKS;

  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        Tài khoản nhận tiền hoàn
      </Typography>
      {prefilled && (
        <Typography variant="caption" sx={{ color: 'text.secondary', mt: -1 }}>
          Đã điền sẵn tài khoản bạn dùng để thanh toán. Kiểm tra lại hoặc sửa nếu muốn nhận vào tài khoản khác.
        </Typography>
      )}
      <TextField
        select
        fullWidth
        size="small"
        label="Ngân hàng"
        value={value.bankBin}
        disabled={disabled}
        onChange={(event) => {
          const bank = banks.find((b) => b.bin === event.target.value);
          set({ bankBin: event.target.value, bankName: bank?.shortName || '' });
        }}
        slotProps={{ select: { MenuProps: { slotProps: { paper: { sx: { maxHeight: 320 } } } } } }}
      >
        {banks.map((bank) => (
          <MenuItem key={bank.bin} value={bank.bin}>
            {bank.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        fullWidth
        size="small"
        label="Số tài khoản"
        value={value.accountNumber}
        disabled={disabled}
        onChange={(event) => set({ accountNumber: event.target.value.replace(/\D/g, '').slice(0, 19) })}
        slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off' } }}
      />
      <TextField
        fullWidth
        size="small"
        label="Tên chủ tài khoản"
        placeholder="VD: NGUYEN VAN A"
        value={value.accountName}
        disabled={disabled}
        onChange={(event) => set({ accountName: event.target.value.toUpperCase().slice(0, 100) })}
        slotProps={{ htmlInput: { autoComplete: 'off' } }}
      />
    </Box>
  );
}

RefundAccountForm.propTypes = {
  value: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  prefilled: PropTypes.bool
};
