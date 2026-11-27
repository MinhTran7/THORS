import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { C, dialogPaper, outlineButtonSx, primaryButtonSx } from '../theme';

const cancelSx = { ...outlineButtonSx, '&:hover': { bgcolor: C.surface, borderColor: C.border, color: '#374151' } };
const dangerSx = {
  ...outlineButtonSx,
  borderColor: '#F2A3A3',
  color: C.error,
  '&:hover': { bgcolor: C.surface, borderColor: '#F2A3A3', color: C.error }
};

export function NoticeDialog({ notice, onClose }) {
  return (
    <Dialog open={Boolean(notice)} onClose={onClose} maxWidth="xs" fullWidth slotProps={dialogPaper}>
      <DialogTitle sx={{ fontWeight: 800, fontSize: 17 }}>{notice?.title}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>{notice?.content}</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="inherit" onClick={onClose} sx={primaryButtonSx}>
          Đóng
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Hộp xác nhận dùng chung cho "Đặt làm mặc định" và "Xóa"; danger = nút xác nhận màu đỏ
export function ConfirmDialog({ open, title, message, confirmLabel, busyLabel, danger = false, busy, error, onCancel, onConfirm }) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth slotProps={dialogPaper}>
      <DialogTitle sx={{ fontWeight: 800, fontSize: 17 }}>{title}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>{message}</Typography>
        {error && <Typography sx={{ color: C.error, fontSize: 13.5, fontWeight: 600, mt: 1.5 }}>{error}</Typography>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button color="inherit" onClick={onCancel} disabled={busy} sx={cancelSx}>
          Hủy
        </Button>
        <Button color="inherit" onClick={onConfirm} disabled={busy} sx={danger ? dangerSx : primaryButtonSx}>
          {busy ? busyLabel : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
