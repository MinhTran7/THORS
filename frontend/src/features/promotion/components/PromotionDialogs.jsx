import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, Typography } from '@mui/material';
import { C, dialogPaper } from '../theme';

const actionButtonSx = {
  bgcolor: C.cyan,
  color: C.text,
  boxShadow: 'none',
  textTransform: 'none',
  fontWeight: 700,
  fontSize: 13.5,
  borderRadius: 2,
  px: 2.5,
  '&:hover': { bgcolor: C.cyanHover, boxShadow: 'none' }
};

// Lý do thao tác bị chặn hoặc lỗi từ backend
function NoticeDialog({ message, onClose }) {
  return (
    <Dialog open={Boolean(message)} onClose={onClose} maxWidth="xs" fullWidth slotProps={dialogPaper}>
      <DialogTitle sx={{ color: C.text, fontWeight: 700, fontSize: 17, pb: 1 }}>Không thể thực hiện</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13.5, color: C.muted, lineHeight: 1.6 }}>{message}</Typography>
      </DialogContent>
      <DialogActions sx={{ p: 2, pt: 1 }}>
        <Button variant="contained" onClick={onClose} sx={actionButtonSx}>
          Đã hiểu
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Xác nhận bật/tắt, kết thúc sớm, xóa; confirm tạo bởi usePromotionActions
function ConfirmDialog({ confirm, working, onCancel, onConfirm }) {
  return (
    <Dialog open={Boolean(confirm)} onClose={() => !working && onCancel()} maxWidth="xs" fullWidth slotProps={dialogPaper}>
      <DialogTitle sx={{ color: C.text, fontWeight: 700, fontSize: 17, pb: 1 }}>{confirm?.title}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13.5, color: C.muted }}>
          {confirm?.message} <strong style={{ color: C.text }}>{confirm?.promotion.name}</strong>?
        </Typography>
        {confirm?.warning && (
          <Alert severity="warning" sx={{ mt: 1.5, fontSize: 13, borderRadius: 2 }}>
            {confirm.warning}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2, pt: 1 }}>
        <Button onClick={onCancel} disabled={working} sx={{ color: C.muted, textTransform: 'none', fontSize: 13.5, borderRadius: 2 }}>
          Hủy
        </Button>
        <Button variant="contained" onClick={onConfirm} disabled={working} sx={actionButtonSx}>
          {working ? 'Đang xử lý...' : 'Xác nhận'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Cả hai hộp thoại của usePromotionActions
export function ActionDialogs({ confirm, working, notice, onCancel, onConfirm, onCloseNotice }) {
  return (
    <>
      <ConfirmDialog confirm={confirm} working={working} onCancel={onCancel} onConfirm={onConfirm} />
      <NoticeDialog message={notice} onClose={onCloseNotice} />
    </>
  );
}

// Thông báo lỗi góc trên phải, tự ẩn sau 5 giây
export function ErrorToast({ message, onClose }) {
  return (
    <Snackbar
      open={Boolean(message)}
      autoHideDuration={5000}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      sx={{ mt: 7 }}
    >
      <Alert
        severity="error"
        onClose={onClose}
        sx={{
          maxWidth: 340,
          bgcolor: C.surface,
          color: C.text,
          border: `1px solid ${C.border}`,
          borderLeft: `5px solid ${C.error}`,
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
          fontWeight: 600,
          fontSize: 13
        }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
