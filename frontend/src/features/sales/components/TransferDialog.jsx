import { Box, Button, CircularProgress, Dialog, IconButton, Typography } from '@mui/material';
import { MinusOutlined, ReloadOutlined } from '@ant-design/icons';
import { generateVietQrUrl } from 'utils/vietqr';
import { C, NO_EFFECTS, outlineButtonSx, primaryButtonSx } from '../theme';
import { money, transferMemo } from '../utils';

function QrBox({ transfer, onRetry, working }) {
  if (!transfer.link)
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography sx={{ fontSize: 13.5, color: C.error, mb: 1.5 }}>{transfer.error || 'Chưa tạo được mã QR.'}</Typography>
        <Button variant="contained" startIcon={<ReloadOutlined />} disabled={working} onClick={onRetry} sx={{ ...primaryButtonSx, px: 2 }}>
          Tạo mã QR
        </Button>
      </Box>
    );
  const { bin, accountNumber, accountName } = transfer.link;
  return (
    <Box sx={{ textAlign: 'center' }}>
      <Box
        component="img"
        alt="Mã QR chuyển khoản"
        src={generateVietQrUrl({
          bankCode: bin,
          accountNumber,
          accountName,
          amount: transfer.amount,
          memo: transferMemo(transfer.orderNumber)
        })}
        sx={{ width: 260, height: 260, objectFit: 'contain', border: `1px solid ${C.border}`, borderRadius: 2.5 }}
      />
      <Typography sx={{ fontSize: 12.5, color: C.muted, mt: 1 }}>
        {accountName} · {accountNumber}
      </Typography>
    </Box>
  );
}

export default function TransferDialog({ order, working, onRetry, onCancel, onClose }) {
  const { transfer } = order;

  return (
    <Dialog
      className={NO_EFFECTS}
      open
      onClose={onClose}
      fullWidth
      slotProps={{ paper: { sx: { maxWidth: 400, borderRadius: 3.5, m: 2 } } }}
    >
      <Box sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
          <Typography sx={{ fontSize: 16.5, fontWeight: 800, color: C.text }}>{order.label} · Chuyển khoản</Typography>
          <IconButton size="small" title="Thu nhỏ" onClick={onClose} sx={{ ml: 'auto', color: C.muted }}>
            <MinusOutlined style={{ fontSize: 13 }} />
          </IconButton>
        </Box>

        <QrBox transfer={transfer} onRetry={onRetry} working={working} />

        <Box sx={{ textAlign: 'center', my: 2 }}>
          <Typography sx={{ fontSize: 24, fontWeight: 800, color: C.text }}>{money(transfer.amount)}</Typography>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mt: 0.5, color: C.muted, fontSize: 13 }}>
            <CircularProgress size={12} sx={{ color: C.cyan }} />
            Đang chờ khách chuyển khoản
          </Box>
        </Box>

        <Button fullWidth disabled={working} onClick={onCancel} sx={{ ...outlineButtonSx, height: 38, borderRadius: 2.5 }}>
          Hủy thanh toán chuyển khoản
        </Button>
      </Box>
    </Dialog>
  );
}
