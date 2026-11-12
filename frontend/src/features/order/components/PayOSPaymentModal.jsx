import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  CircularProgress,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  CopyOutlined,
  CheckCircleOutlined,
  QrcodeOutlined,
  LinkOutlined,
  CloseOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { brand } from 'features/account/tokens';
import { formatVnd } from '../constants';
import { ordersApi } from '../api';
import { generateVietQrUrl } from 'utils/vietqr';

export default function PayOSPaymentModal({ open, onClose, paymentData, onSuccess, onCancelled }) {
  const [copiedField, setCopiedField] = useState(null);
  const [success, setSuccess] = useState(false);
  // Hủy đơn ngay trong hộp thanh toán: null -> 'confirm' (hỏi lại) -> 'working' -> 'done'
  const [cancelState, setCancelState] = useState(null);
  const [cancelError, setCancelError] = useState('');
  const cancelled = cancelState === 'done';

  async function cancelOrder() {
    setCancelState('working');
    setCancelError('');
    try {
      await ordersApi.changeStatus(paymentData.orderId, 'CANCELLED', 'Khách hủy khi đang thanh toán');
      setCancelState('done');
      if (onCancelled) onCancelled();
    } catch (err) {
      setCancelState('confirm');
      setCancelError(err?.message || 'Không hủy được đơn hàng.');
    }
  }

  // Đơn chuyển khoản chỉ giữ 10 phút: backend trả số giây còn lại, đếm ngược tại máy khách
  const deadline = useMemo(
    () => (paymentData?.expiresInSeconds != null ? Date.now() + Number(paymentData.expiresInSeconds) * 1000 : null),
    [paymentData]
  );
  const [now, setNow] = useState(() => Date.now());
  const remaining = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const expired = remaining === 0;

  useEffect(() => {
    if (!open || !deadline || success || expired || cancelled) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open, deadline, success, expired, cancelled]);

  // Tự động kiểm tra trạng thái mỗi 4 giây khi dialog đang mở (dừng khi đã hết hạn)
  useEffect(() => {
    if (!open || !paymentData?.orderId || success || expired || cancelled) return;

    const interval = setInterval(async () => {
      try {
        const res = await ordersApi.checkPayOSStatus(paymentData.orderId);
        if (res.paid) {
          setSuccess(true);
          if (onSuccess) onSuccess();
        }
      } catch (err) {
        // im lặng bỏ qua lỗi polling
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [open, paymentData?.orderId, success, expired, cancelled, onSuccess]);

  if (!paymentData) return null;

  const copyText = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Tạo ảnh VietQR từ bin hoặc qrCode
  const memoText = `DH ${paymentData.orderNumber ? paymentData.orderNumber.replace(/[^a-zA-Z0-9]/g, '') : paymentData.orderId}`;
  const qrUrl = generateVietQrUrl({
    bankCode: paymentData.bin || '970422',
    accountNumber: paymentData.accountNumber,
    accountName: paymentData.accountName,
    amount: paymentData.amount,
    memo: memoText,
    template: 'compact2'
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${brand.line}` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <QrcodeOutlined style={{ fontSize: 22, color: brand.primary }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: brand.ink }}>
            Thanh toán VietQR / PayOS
          </Typography>
        </Box>
        <Tooltip title={success || cancelled || expired ? 'Đóng' : 'Đóng — thanh toán sau trong chi tiết đơn hàng (trước khi hết hạn giữ đơn)'}>
          <IconButton onClick={onClose} size="small" aria-label="Đóng">
            <CloseOutlined />
          </IconButton>
        </Tooltip>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        {success ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircleOutlined style={{ fontSize: 60, color: '#16a34a', marginBottom: 16 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#16a34a', mb: 1 }}>
              Thanh toán thành công!
            </Typography>
            <Typography variant="body1" sx={{ color: brand.muted, mb: 3 }}>
              Hệ thống đã xác nhận đơn hàng {paymentData.orderNumber} của bạn đã được thanh toán.
            </Typography>
            <Button variant="contained" onClick={onClose} sx={{ bgcolor: brand.primary, textTransform: 'none' }}>
              Đóng và xem đơn hàng
            </Button>
          </Box>
        ) : cancelled ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CloseOutlined style={{ fontSize: 48, color: brand.muted, marginBottom: 16 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: brand.ink, mb: 1 }}>
              Đã hủy đơn hàng
            </Typography>
            <Typography variant="body1" sx={{ color: brand.muted, mb: 3 }}>
              Đơn {paymentData.orderNumber} đã được hủy, hàng đã trả lại kho. Bạn chưa bị trừ tiền.
            </Typography>
            <Button variant="contained" onClick={onClose} sx={{ bgcolor: brand.primary, textTransform: 'none' }}>
              Đóng
            </Button>
          </Box>
        ) : expired ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <ClockCircleOutlined style={{ fontSize: 56, color: '#dc2626', marginBottom: 16 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#dc2626', mb: 1 }}>
              Hết thời gian thanh toán
            </Typography>
            <Typography variant="body1" sx={{ color: brand.muted, mb: 3 }}>
              Đơn {paymentData.orderNumber} chỉ được giữ 10 phút nên đã bị hủy và hàng được trả lại kho. Vui lòng đặt lại đơn mới.
            </Typography>
            <Button variant="contained" onClick={onClose} sx={{ bgcolor: brand.primary, textTransform: 'none' }}>
              Đóng
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 3, alignItems: 'center' }}>
            {/* Cột trái: Mã QR */}
            <Box sx={{ textAlign: 'center', flexShrink: 0 }}>
              <Box
                sx={{
                  p: 1.5,
                  bgcolor: '#fff',
                  border: `1px solid ${brand.line}`,
                  borderRadius: 2,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  display: 'inline-block'
                }}
              >
                <Box
                  component="img"
                  src={qrUrl}
                  alt="VietQR PayOS"
                  sx={{ width: 200, height: 260, objectFit: 'contain', display: 'block' }}
                />
              </Box>
              <Typography variant="caption" sx={{ display: 'block', mt: 1, color: brand.muted }}>
                Mở App ngân hàng quét mã QR
              </Typography>
            </Box>

            {/* Cột phải: Thông tin chuyển khoản */}
            <Box sx={{ flex: 1, width: '100%' }}>
              <Box sx={{ bgcolor: '#f8fafc', p: 2, borderRadius: 2, border: `1px solid ${brand.line}`, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: brand.muted }}>Số tài khoản thụ hưởng</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: brand.ink }}>
                      {paymentData.accountNumber || '—'}
                    </Typography>
                    {paymentData.accountNumber && (
                      <Tooltip title={copiedField === 'acc' ? 'Đã sao chép!' : 'Sao chép STK'}>
                        <IconButton size="small" onClick={() => copyText(paymentData.accountNumber, 'acc')}>
                          <CopyOutlined style={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>

                <Box>
                  <Typography variant="caption" sx={{ color: brand.muted }}>Chủ tài khoản</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: brand.ink }}>
                    {paymentData.accountName || '—'}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" sx={{ color: brand.muted }}>Số tiền</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: '#dc2626' }}>
                      {formatVnd(paymentData.amount)}
                    </Typography>
                    <Tooltip title={copiedField === 'amount' ? 'Đã sao chép!' : 'Sao chép số tiền'}>
                      <IconButton size="small" onClick={() => copyText(String(paymentData.amount), 'amount')}>
                        <CopyOutlined style={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>

                <Box>
                  <Typography variant="caption" sx={{ color: brand.muted }}>Nội dung chuyển khoản (chính xác)</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: brand.primary, bgcolor: '#e0f2fe', px: 1, py: 0.5, borderRadius: 1 }}>
                      {memoText}
                    </Typography>
                    <Tooltip title={copiedField === 'memo' ? 'Đã sao chép!' : 'Sao chép nội dung'}>
                      <IconButton size="small" onClick={() => copyText(memoText, 'memo')}>
                        <CopyOutlined style={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </Box>

              {paymentData.checkoutUrl && (
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<LinkOutlined />}
                  href={paymentData.checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ mt: 2, textTransform: 'none' }}
                >
                  Mở trang thanh toán PayOS
                </Button>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>

      {!success && !expired && !cancelled && (
        <DialogActions sx={{ p: 2, borderTop: `1px solid ${brand.line}`, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          {/* X ở góc = đóng, thanh toán sau (trước khi hết hạn); "Hủy đơn" = hủy hẳn, trả hàng về kho */}
          {cancelState === 'confirm' || cancelState === 'working' ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ color: '#dc2626', fontWeight: 600 }}>
                {cancelError || 'Hủy đơn này? Hàng đang giữ sẽ được trả lại kho.'}
              </Typography>
              <Button
                size="small"
                disabled={cancelState === 'working'}
                onClick={() => {
                  setCancelState(null);
                  setCancelError('');
                }}
                sx={{ color: brand.muted, textTransform: 'none' }}
              >
                Không
              </Button>
              <Button
                size="small"
                variant="contained"
                disabled={cancelState === 'working'}
                onClick={cancelOrder}
                sx={{ bgcolor: '#dc2626', textTransform: 'none', '&:hover': { bgcolor: '#b91c1c' } }}
              >
                {cancelState === 'working' ? 'Đang hủy…' : 'Hủy đơn'}
              </Button>
            </Box>
          ) : (
            <Button onClick={() => setCancelState('confirm')} sx={{ color: '#dc2626', textTransform: 'none', fontWeight: 600 }}>
              Hủy đơn
            </Button>
          )}
          {/* Không cần bấm xác nhận: hệ thống tự kiểm tra mỗi 4 giây, nhận tiền là tự chuyển sang "Thanh toán thành công" */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {remaining != null && (
              <Typography
                variant="body2"
                sx={{ fontWeight: 700, color: remaining <= 60 ? '#dc2626' : brand.ink, display: 'flex', alignItems: 'center', gap: 0.75 }}
              >
                <ClockCircleOutlined />
                Giữ đơn còn {String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}
              </Typography>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: brand.muted }}>
              <CircularProgress size={14} color="inherit" />
              <Typography variant="body2">Đang chờ thanh toán… tự cập nhật khi nhận được tiền</Typography>
            </Box>
          </Box>
        </DialogActions>
      )}
    </Dialog>
  );
}

