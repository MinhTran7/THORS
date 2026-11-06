import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { EnvironmentOutlined } from '@ant-design/icons';

/** Mã lỗi backend trả về khi không tìm thấy địa chỉ giao trên bản đồ. */
export const ADDRESS_NOT_FOUND = 'ADDRESS_NOT_FOUND';

/** Lý do từ chối có sẵn dùng cho trường hợp này. */
export const INVALID_ADDRESS_REASON = 'Địa chỉ giao hàng không hợp lệ';

/**
 * Hộp thoại giữa màn hình báo không tìm thấy địa chỉ giao, để chủ shop không bỏ sót.
 * value = { order, message } hoặc null; onReject (có thể bỏ) = mở luồng từ chối đơn.
 */
export default function AddressNotFoundDialog({ value, onClose, onReject }) {
  return (
    <Dialog open={Boolean(value)} onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: '16px', p: 1 } } }}>
      <DialogTitle sx={{ textAlign: 'center', pb: 1 }}>
        <Box
          sx={{
            width: 56,
            height: 56,
            mx: 'auto',
            mb: 1.5,
            borderRadius: '50%',
            bgcolor: '#FEE2E2',
            color: '#DC2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28
          }}
        >
          <EnvironmentOutlined />
        </Box>
        <Typography component="span" sx={{ fontWeight: 700, fontSize: 18, display: 'block' }}>
          Không tìm thấy địa chỉ giao hàng
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ textAlign: 'center' }}>
        {value?.order && (
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            Đơn #{value.order.orderNumber}
            {value.order.deliveryAddress ? ` · ${value.order.deliveryAddress}` : ''}
          </Typography>
        )}
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {value?.message}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', gap: 1, pb: 2 }}>
        <Button variant="outlined" onClick={onClose} sx={{ borderRadius: '10px', textTransform: 'none', px: 2.5 }}>
          Đóng
        </Button>
        {onReject && (
          <Button
            variant="contained"
            color="error"
            disableElevation
            onClick={onReject}
            sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 600, px: 2.5 }}
          >
            Từ chối đơn
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
