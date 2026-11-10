import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  CopyOutlined,
  CheckCircleOutlined,
  QrcodeOutlined,
  LinkOutlined,
  SyncOutlined,
  CloseOutlined
} from '@ant-design/icons';
import { brand } from 'features/account/tokens';
import { formatVnd } from '../constants';
import { ordersApi } from '../api';
import { generateVietQrUrl } from 'utils/vietqr';

export default function PayOSPaymentModal({ open, onClose, paymentData, onSuccess }) {
  const [checking, setChecking] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Tự động kiểm tra trạng thái mỗi 4 giây khi dialog đang mở
  useEffect(() => {
    if (!open || !paymentData?.orderId || success) return;

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
  }, [open, paymentData?.orderId, success, onSuccess]);

  if (!paymentData) return null;

  const copyText = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleManualCheck = async () => {
    setChecking(true);
    setErrorMsg('');
    try {
      const res = await ordersApi.checkPayOSStatus(paymentData.orderId);
      if (res.paid) {
        setSuccess(true);
        if (onSuccess) onSuccess();
      } else {
        setErrorMsg('Hệ thống chưa nhận được khoản thanh toán. Nếu bạn vừa chuyển khoản, vui lòng chờ 5-10 giây rồi thử lại.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Lỗi kiểm tra trạng thái thanh toán.');
    } finally {
      setChecking(false);
    }
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
        <IconButton onClick={onClose} size="small">
          <CloseOutlined />
        </IconButton>
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

              {errorMsg && (
                <Alert severity="warning" sx={{ mt: 2, fontSize: 13 }}>
                  {errorMsg}
                </Alert>
              )}

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

      {!success && (
        <DialogActions sx={{ p: 2, borderTop: `1px solid ${brand.line}`, justifyContent: 'space-between' }}>
          <Button onClick={onClose} sx={{ color: brand.muted, textTransform: 'none' }}>
            Hủy / Đóng
          </Button>
          <Button
            variant="contained"
            startIcon={checking ? <CircularProgress size={16} color="inherit" /> : <SyncOutlined />}
            disabled={checking}
            onClick={handleManualCheck}
            sx={{ bgcolor: brand.primary, textTransform: 'none', px: 2.5 }}
          >
            {checking ? 'Đang kiểm tra…' : 'Tôi đã chuyển khoản'}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}

