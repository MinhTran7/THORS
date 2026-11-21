import { Box, CircularProgress, Dialog, Stack, Typography } from '@mui/material';
import { generateVietQrUrl, VIETNAMESE_BANKS } from '../../utils/vietqr';

const C = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  main: '#8DE9F2'
};

const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

function Row({ label, value }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
      <Typography sx={{ fontSize: 12.5, color: C.muted }}>{label}</Typography>
      <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: C.text, textAlign: 'right', wordBreak: 'break-all' }}>{value || '—'}</Typography>
    </Box>
  );
}

// Chỉ hiển thị mã; tạo mã, kiểm tra tiền về và hủy do trang bán hàng xử lý
export default function TransferQrDialog({ transfer, onClose }) {
  const sale = transfer?.sale;
  const link = transfer?.link;

  const memo = sale ? `DH ${String(sale.orderNumber || '').replace(/[^a-zA-Z0-9]/g, '')}` : '';
  const bank = VIETNAMESE_BANKS.find((b) => b.bin === link?.bin);
  const qrUrl = link
    ? generateVietQrUrl({ bankCode: link.bin, accountNumber: link.accountNumber, accountName: link.accountName, amount: link.amount, memo })
    : undefined;

  return (
    <Dialog
      className="pos-no-effects"
      open={Boolean(transfer)}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: { maxWidth: 400, borderRadius: 3, boxShadow: '0 8px 32px rgba(32,45,66,0.14)' } } }}
    >
      <Box sx={{ p: 3 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 800, color: C.text, textAlign: 'center' }}>Chờ khách chuyển khoản</Typography>
        <Typography sx={{ fontSize: 24, fontWeight: 800, color: C.text, textAlign: 'center', mt: 0.5 }}>{money(sale?.totalAmount)}</Typography>

        <Box sx={{ my: 2, minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Box component="img" src={qrUrl} alt="Mã VietQR" sx={{ width: 240, maxWidth: '100%', borderRadius: 2, border: `1px solid ${C.border}` }} />
        </Box>

        {link && (
          <>
            <Stack spacing={0.75} sx={{ mb: 2 }}>
              <Row label="Ngân hàng" value={bank?.shortName || link.bin} />
              <Row label="Số tài khoản" value={link.accountNumber} />
              <Row label="Chủ tài khoản" value={link.accountName} />
              <Row label="Nội dung" value={memo} />
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress size={14} sx={{ color: C.main }} />
              <Typography sx={{ fontSize: 12.5, color: C.muted }}>Đang chờ thanh toán...</Typography>
            </Stack>
            <Typography sx={{ fontSize: 11.5, color: C.muted, textAlign: 'center', mt: 1 }}>
              Có thể tắt mã để bán hóa đơn khác, khách chuyển xong hệ thống vẫn tự ghi nhận.
            </Typography>
          </>
        )}

      </Box>
    </Dialog>
  );
}
