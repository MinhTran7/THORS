// Danh sách các ngân hàng phổ biến tại Việt Nam (chuẩn NAPAS / VietQR)
export const VIETNAMESE_BANKS = [
  { code: 'MB', bin: '970422', shortName: 'MBBank', name: 'Ngân hàng Quân đội (MB)' },
  { code: 'VCB', bin: '970436', shortName: 'Vietcombank', name: 'Ngân hàng Ngoại thương (VCB)' },
  { code: 'TCB', bin: '970407', shortName: 'Techcombank', name: 'Ngân hàng Kỹ thương (Techcombank)' },
  { code: 'ICB', bin: '970415', shortName: 'VietinBank', name: 'Ngân hàng Công thương (VietinBank)' },
  { code: 'BIDV', bin: '970418', shortName: 'BIDV', name: 'Ngân hàng Đầu tư và Phát triển (BIDV)' },
  { code: 'ACB', bin: '970416', shortName: 'ACB', name: 'Ngân hàng Á Châu (ACB)' },
  { code: 'VPB', bin: '970432', shortName: 'VPBank', name: 'Ngân hàng Việt Nam Thịnh Vượng (VPBank)' },
  { code: 'TPB', bin: '970423', shortName: 'TPBank', name: 'Ngân hàng Tiên Phong (TPBank)' },
  { code: 'STB', bin: '970403', shortName: 'Sacombank', name: 'Ngân hàng Sài Gòn Thương Tín (Sacombank)' },
  { code: 'VIB', bin: '970441', shortName: 'VIB', name: 'Ngân hàng Quốc tế (VIB)' },
  { code: 'HDB', bin: '970437', shortName: 'HDBank', name: 'Ngân hàng Phát triển TP.HCM (HDBank)' },
  { code: 'OCB', bin: '970448', shortName: 'OCB', name: 'Ngân hàng Phương Đông (OCB)' },
  { code: 'VBA', bin: '970405', shortName: 'Agribank', name: 'Ngân hàng Nông nghiệp (Agribank)' },
  { code: 'MSB', bin: '970426', shortName: 'MSB', name: 'Ngân hàng Hàng Hải (MSB)' },
  { code: 'SHB', bin: '970443', shortName: 'SHB', name: 'Ngân hàng Sài Gòn - Hà Nội (SHB)' },
  { code: 'LPB', bin: '970449', shortName: 'LPBank', name: 'Ngân hàng Lộc Phát (LPBank)' }
];

export function getBankByCode(code) {
  if (!code) return null;
  return VIETNAMESE_BANKS.find((b) => b.code.toUpperCase() === code.toUpperCase()) || null;
}

/**
 * Tạo link ảnh mã VietQR động chuẩn NAPAS 247
 * @param {Object} params
 * @param {string} params.bankCode - Mã ngân hàng (ví dụ: MB, VCB, TCB)
 * @param {string} params.accountNumber - Số tài khoản thụ hưởng
 * @param {string} params.accountName - Tên chủ tài khoản
 * @param {number} params.amount - Số tiền chuyển
 * @param {string} params.memo - Nội dung chuyển tiền
 * @param {string} [params.template='compact2'] - Kiểu hiển thị (compact2, compact, qr_only)
 */
export function generateVietQrUrl({
  bankCode,
  accountNumber,
  accountName,
  amount,
  memo,
  template = 'compact2'
}) {
  if (!bankCode || !accountNumber) return '';

  const cleanAcc = String(accountNumber).trim();
  const cleanBank = String(bankCode).trim();
  const safeAmount = Math.max(0, Math.round(Number(amount) || 0));

  const query = new URLSearchParams();
  if (safeAmount > 0) query.set('amount', String(safeAmount));
  if (memo && memo.trim()) query.set('addInfo', memo.trim());
  if (accountName && accountName.trim()) query.set('accountName', accountName.trim());

  return `https://img.vietqr.io/image/${cleanBank}-${cleanAcc}-${template}.png?${query.toString()}`;
}

