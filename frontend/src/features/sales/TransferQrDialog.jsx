import { useEffect, useRef, useState } from 'react';
import { Alert, Box, CircularProgress, Dialog, Stack, Typography } from '@mui/material';
import { api } from '../../services/http';
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

export default function TransferQrDialog({ sale, onPaid, onCancelled }) {
  const orderId = sale?.orderId;
  const [link, setLink] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const doneRef = useRef(false);
  const busyRef = useRef(false);
  const callbacks = useRef({ onPaid, onCancelled });
  callbacks.current = { onPaid, onCancelled };

  async function run(task) {
    if (doneRef.current || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (err) {
      setError(err.message || 'Có lỗi xảy ra, vui lòng thử lại.');
      setHidden(false);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function complete() {
    const result = await api(`/sales/in-store/${orderId}/complete`, { method: 'POST' });
    doneRef.current = true;
    callbacks.current.onPaid(result);
  }

  async function release(message) {
    await api(`/sales/in-store/${orderId}/cancel`, { method: 'POST' });
    doneRef.current = true;
    callbacks.current.onCancelled(message);
  }

  // Tắt popup ngay, xử lý sau: đã nhận tiền thì tạo hóa đơn, chưa thì bỏ giữ hàng
  const closeHold = () => {
    setHidden(true);
    run(async () => {
      const res = await api(`/payment/payos/status/${orderId}`).catch(() => null);
      if (res?.paid) await complete();
      else await release();
    });
  };

  // Tạo mã PayOS khi mở
  useEffect(() => {
    if (!orderId) return;
    doneRef.current = false;
    setLink(null);
    setHidden(false);
    setError('');
    api('/payment/payos/create-link', { method: 'POST', body: { orderId } })
      .then(setLink)
      .catch((err) => run(() => release(`Không tạo được mã thanh toán: ${err.message || 'lỗi kết nối'}`)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Kiểm tra thanh toán mỗi 3 giây
  useEffect(() => {
    if (!link) return undefined;
    const check = () =>
      api(`/payment/payos/status/${orderId}`)
        .then((res) => res?.paid && run(complete))
        .catch(() => {});
    check();
    const timer = setInterval(check, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);

  const memo = sale ? `DH ${String(sale.orderNumber || '').replace(/[^a-zA-Z0-9]/g, '')}` : '';
  const bank = VIETNAMESE_BANKS.find((b) => b.bin === link?.bin);
  const qrUrl = link
    ? generateVietQrUrl({
        bankCode: link.bin,
        accountNumber: link.accountNumber,
        accountName: link.accountName,
        amount: link.amount,
        memo
      })
    : '';

  return (
    <Dialog
      open={Boolean(sale) && !hidden}
      onClose={busy || (!link && !error) ? undefined : closeHold}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { maxWidth: 400, borderRadius: 3, boxShadow: '0 8px 32px rgba(32,45,66,0.14)' } }}
    >
      <Box sx={{ p: 3 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 800, color: C.text, textAlign: 'center' }}>Chờ khách chuyển khoản</Typography>
        <Typography sx={{ fontSize: 24, fontWeight: 800, color: C.text, textAlign: 'center', mt: 0.5 }}>{money(sale?.totalAmount)}</Typography>

        <Box sx={{ my: 2, minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {qrUrl ? (
            <Box component="img" src={qrUrl} alt="Mã VietQR" sx={{ width: 240, maxWidth: '100%', borderRadius: 2, border: `1px solid ${C.border}` }} />
          ) : (
            <Stack alignItems="center" spacing={1}>
              <CircularProgress size={28} sx={{ color: C.main }} />
              <Typography sx={{ fontSize: 12.5, color: C.muted }}>Đang tạo mã thanh toán...</Typography>
            </Stack>
          )}
        </Box>

        {link && (
          <>
            <Stack spacing={0.75} sx={{ mb: 2 }}>
              <Row label="Ngân hàng" value={bank?.shortName || link.bin} />
              <Row label="Số tài khoản" value={link.accountNumber} />
              <Row label="Chủ tài khoản" value={link.accountName} />
              <Row label="Nội dung" value={memo} />
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mb: error ? 2 : 0 }}>
              <CircularProgress size={14} sx={{ color: C.main }} />
              <Typography sx={{ fontSize: 12.5, color: C.muted }}>
                Đang chờ thanh toán...
              </Typography>
            </Stack>
          </>
        )}

        {error && (
          <Alert severity="error" sx={{ fontSize: 12.5 }}>
            {error}
          </Alert>
        )}

      </Box>
    </Dialog>
  );
}
