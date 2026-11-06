import { useState, useEffect } from 'react';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Paper,
  Stack,
  Button,
  Grid,
  Chip,
  Divider,
  TextField,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Stepper,
  Step,
  StepLabel,
  Card,
  CardContent,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  CarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  EyeInvisibleOutlined,
  LockOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  ShoppingOutlined,
  UnlockOutlined,
  ArrowLeftOutlined
} from '@ant-design/icons';
import { trackOrderPublic } from '../../services/returnService';
import CustomerReturnDialog from '../returns/CustomerReturnDialog';
import { orderStatusMeta, shipmentStatusLabel, formatVnd } from './constants';

const COLORS = {
  text: '#1E293B',
  muted: '#64748B',
  border: '#E2E8F0',
  primary: '#0284C7',
  primaryLight: '#E0F2FE',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444'
};

const STEP_LABELS = ['Đặt hàng', 'Xác nhận đơn', 'Đang vận chuyển', 'Đã giao hàng', 'Hoàn tất'];

function getActiveStepIndex(orderStatus, shipmentStatus) {
  if (!orderStatus) return 0;
  if (['CANCELLED', 'REJECTED', 'EXPIRED'].includes(orderStatus)) return -1;
  if (orderStatus === 'COMPLETED') return 4;
  if (orderStatus === 'DELIVERED' || shipmentStatus === 'DELIVERED') return 3;
  if (['SHIPPING', 'AWAITING_PICKUP'].includes(orderStatus) || ['IN_TRANSIT', 'AWAITING_PICKUP'].includes(shipmentStatus)) {
    return 2;
  }
  if (['PENDING_CONFIRMATION', 'PROCESSING', 'AWAITING_PAYMENT'].includes(orderStatus)) {
    return 1;
  }
  return 0;
}

export default function OrderTrackingPage() {
  const { orderNumber } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Security 4-digit PIN unlock
  const [phonePin, setPhonePin] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [pinError, setPinError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // Return Dialog
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [successBanner, setSuccessBanner] = useState('');

  const loadTracking = async (pin = '') => {
    if (!orderNumber) return;
    try {
      setLoading(true);
      setError('');
      setPinError('');
      const data = await trackOrderPublic(orderNumber, pin);
      setOrder(data);
    } catch (err) {
      console.error('Track order error:', err);
      setError(err?.message || 'Không tìm thấy thông tin đơn hàng hoặc mã tra cứu không hợp lệ.');
    } finally {
      setLoading(false);
      setVerifyingPin(false);
    }
  };

  useEffect(() => {
    loadTracking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber]);

  const handleVerifyPin = async (e) => {
    e.preventDefault();
    if (!phonePin.trim()) {
      setPinError('Vui lòng nhập 4 số cuối số điện thoại người nhận.');
      return;
    }
    setVerifyingPin(true);
    try {
      const data = await trackOrderPublic(orderNumber, phonePin.trim());
      setOrder(data);
      if (!data.verified) {
        setPinError('Số điện thoại không khớp với người nhận của đơn hàng này.');
      } else {
        setPinError('');
      }
    } catch (err) {
      setPinError(err?.message || 'Xác minh thất bại.');
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleCopyTrackingNumber = () => {
    if (!order?.trackingNumber) return;
    navigator.clipboard?.writeText(order.trackingNumber);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const activeStep = getActiveStepIndex(order?.orderStatus, order?.shipmentStatus);
  const isCanceled = ['CANCELLED', 'REJECTED', 'EXPIRED'].includes(order?.orderStatus);

  // Can request return if delivered/completed and not having active return
  const canRequestReturn =
    ['DELIVERED', 'COMPLETED'].includes(order?.orderStatus) && !order?.activeReturnId;

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress size={40} sx={{ color: COLORS.primary, mb: 2 }} />
        <Typography color={COLORS.muted}>Đang tra cứu hành trình đơn hàng...</Typography>
      </Container>
    );
  }

  if (error || !order) {
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Paper elevation={0} sx={{ p: 4, textAlign: 'center', border: `1px solid ${COLORS.border}`, borderRadius: 3 }}>
          <ShoppingOutlined style={{ fontSize: 50, color: COLORS.muted, marginBottom: 16 }} />
          <Typography variant="h6" fontWeight={700} color={COLORS.text} gutterBottom>
            Không tìm thấy thông tin đơn hàng
          </Typography>
          <Typography variant="body2" color={COLORS.muted} sx={{ maxWidth: 480, mx: 'auto', mb: 3 }}>
            {error || 'Mã đơn hàng bạn vừa truy cập không tồn tại hoặc đã bị xóa khỏi hệ thống.'}
          </Typography>
          <Button
            variant="contained"
            component={RouterLink}
            to="/"
            startIcon={<ArrowLeftOutlined />}
            sx={{ bgcolor: COLORS.primary, textTransform: 'none', fontWeight: 600 }}
          >
            Quay về Cửa hàng
          </Button>
        </Paper>
      </Container>
    );
  }

  const statusMeta = orderStatusMeta(order.orderStatus);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* TOP BAR / BACK NAVIGATION */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2.5 }}>
        <Button
          startIcon={<ArrowLeftOutlined />}
          component={RouterLink}
          to="/"
          sx={{ color: COLORS.muted, textTransform: 'none', fontWeight: 600 }}
        >
          Trang chủ Cửa hàng
        </Button>
        <Typography fontSize={13} color={COLORS.muted}>
          Tra cứu đơn hàng trực tuyến
        </Typography>
      </Stack>

      {successBanner && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccessBanner('')}>
          {successBanner}
        </Alert>
      )}

      {/* HEADER CARD */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 3,
          border: `1px solid ${COLORS.border}`,
          background: 'linear-gradient(135deg, #F0F9FF 0%, #FFFFFF 100%)'
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}>
          <Box>
            <Typography fontSize={12} fontWeight={700} color={COLORS.primary} sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Mã đơn hàng
            </Typography>
            <Typography variant="h5" fontWeight={800} color={COLORS.text}>
              {order.orderNumber}
            </Typography>
            <Typography fontSize={12} color={COLORS.muted} sx={{ mt: 0.5 }}>
              Thời gian đặt: {order.createdAt ? new Date(order.createdAt).toLocaleString('vi-VN') : '—'}
            </Typography>
          </Box>
          <Box sx={{ textAlign: { sm: 'right' } }}>
            <Chip
              label={statusMeta.label}
              color={statusMeta.tone === 'success' ? 'success' : statusMeta.tone === 'danger' ? 'error' : 'warning'}
              sx={{ fontWeight: 700, fontSize: 13, px: 1 }}
            />
            <Typography fontSize={13} fontWeight={600} color={COLORS.text} sx={{ mt: 0.8 }}>
              Tổng tiền: {formatVnd(order.totalAmount)}
            </Typography>
          </Box>
        </Stack>

        {/* STEPPER PROGRESS */}
        <Box sx={{ mt: 4, mb: 1 }}>
          {isCanceled ? (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              Đơn hàng này đã bị hủy hoặc từ chối xử lý.
            </Alert>
          ) : (
            <Stepper activeStep={activeStep} alternativeLabel>
              {STEP_LABELS.map((label, index) => (
                <Step key={label} completed={activeStep > index}>
                  <StepLabel
                    slotProps={{
                      stepIcon: {
                        sx: {
                          '&.Mui-completed': { color: COLORS.success },
                          '&.Mui-active': { color: COLORS.primary }
                        }
                      }
                    }}
                  >
                    <Typography fontSize={12} fontWeight={activeStep === index ? 700 : 500}>
                      {label}
                    </Typography>
                  </StepLabel>
                </Step>
              ))}
            </Stepper>
          )}
        </Box>
      </Paper>

      {/* ACTIVE RETURN BANNER (IF ALREADY REQUESTED) */}
      {order.activeReturnId && (
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            mb: 3,
            bgcolor:
              order.activeReturnStatus === 'COMPLETED'
                ? '#F6FFED'
                : order.activeReturnStatus === 'REJECTED'
                ? '#FFF1F0'
                : '#FFFBE6',
            border: `1px solid ${
              order.activeReturnStatus === 'COMPLETED'
                ? '#B7EB8F'
                : order.activeReturnStatus === 'REJECTED'
                ? '#FFA39E'
                : '#FFE58F'
            }`,
            borderRadius: 3
          }}
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5}>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1}>
                <RollbackOutlined style={{ fontSize: 18, color: '#D48806' }} />
                <Typography fontSize={14} fontWeight={700} color={COLORS.text}>
                  Yêu cầu Trả hàng / Hoàn tiền: {order.activeReturnStatus}
                </Typography>
              </Stack>
              <Typography fontSize={12} color={COLORS.muted} sx={{ mt: 0.5 }}>
                Lý do: <strong>{order.activeReturnReason || 'Không có mô tả'}</strong>
              </Typography>
              {order.activeReturnStatus === 'PENDING' && (
                <Typography fontSize={12} color="#D48806" sx={{ mt: 0.5 }}>
                  ⏳ Cửa hàng đang tiếp nhận và xem xét yêu cầu trong vòng 24 giờ.
                </Typography>
              )}
              {order.activeReturnStatus === 'APPROVED' && (
                <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#FFF', border: '1px solid #B7EB8F', borderRadius: 2 }}>
                  <Typography fontSize={13} fontWeight={700} color="#389E0D" sx={{ mb: 0.5 }}>
                    ✓ Cửa hàng đã chấp thuận yêu cầu đổi trả!
                  </Typography>
                  <Typography fontSize={12} color={COLORS.text} sx={{ mb: 0.5 }}>
                    Quý khách vui lòng đóng gói hàng và mang ra bưu cục gần nhất (GHTK, Viettel Post, GHN, VNPost...) gửi về địa chỉ:
                  </Typography>
                  <Typography fontSize={12} fontWeight={700} color={COLORS.text}>
                    📍 Kho THORS: Số 123 Đường Cầu Giấy, P. Quan Hoa, Q. Cầu Giấy, Hà Nội
                  </Typography>
                  <Typography fontSize={12} color={COLORS.text}>
                    📞 Người nhận: Bộ phận Đổi trả THORS — SĐT: 038.686.8686
                  </Typography>
                  <Typography fontSize={11} color={COLORS.muted} sx={{ mt: 0.5 }}>
                    * Quý khách thanh toán cước trực tiếp cho bên vận chuyển. Shop sẽ kiểm nhận kiện hàng và chuyển khoản hoàn tiền ngay vào tài khoản ngân hàng của quý khách.
                  </Typography>
                </Box>
              )}
              {order.activeReturnStatus === 'RECEIVED' && (
                <Typography fontSize={12} color="#0958D9" sx={{ mt: 0.5 }}>
                  📦 Shop đã nhận được kiện hàng hoàn về và đang kiểm tra chất lượng sản phẩm để chuyển khoản hoàn tiền.
                </Typography>
              )}
              {order.activeReturnStatus === 'COMPLETED' && (
                <Typography fontSize={12} color="#389E0D" sx={{ mt: 0.5, fontWeight: 600 }}>
                  🎉 Đã hoàn tất đổi trả & chuyển tiền thành công vào tài khoản ngân hàng của quý khách!
                </Typography>
              )}
              {order.activeReturnStatus === 'REJECTED' && (
                <Typography fontSize={12} color="#CF1322" sx={{ mt: 0.5 }}>
                  ✕ Rất tiếc, yêu cầu hoàn hàng không được chấp thuận (vui lòng liên hệ shop để được giải đáp).
                </Typography>
              )}
            </Box>
            <Chip
              label={`Mã phiếu: #${order.activeReturnId}`}
              size="small"
              sx={{ bgcolor: '#FFF', fontWeight: 600 }}
            />
          </Stack>
        </Paper>
      )}

      {/* MAIN DETAILS GRID */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* SHIPPING / CARRIER CARD */}
        <Grid item xs={12} sm={6}>
          <Paper elevation={0} sx={{ p: 2.5, height: '100%', border: `1px solid ${COLORS.border}`, borderRadius: 3 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
              <CarOutlined style={{ fontSize: 18, color: COLORS.primary }} />
              <Typography fontSize={14} fontWeight={700} color={COLORS.text}>
                Thông tin Vận chuyển
              </Typography>
            </Stack>

            <Stack spacing={1.2}>
              <Box>
                <Typography fontSize={11} color={COLORS.muted}>
                  Đơn vị vận chuyển:
                </Typography>
                <Typography fontSize={13} fontWeight={600} color={COLORS.text}>
                  {order.shippingCarrier || 'Cửa hàng tự giao / Chờ cập nhật'}
                </Typography>
              </Box>

              <Box>
                <Typography fontSize={11} color={COLORS.muted}>
                  Mã vận đơn tra cứu:
                </Typography>
                {order.trackingNumber ? (
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography fontSize={13} fontWeight={700} color={COLORS.primary}>
                      {order.trackingNumber}
                    </Typography>
                    <Tooltip title={copiedCode ? 'Đã sao chép!' : 'Sao chép mã vận đơn'}>
                      <IconButton size="small" onClick={handleCopyTrackingNumber}>
                        {copiedCode ? <CheckCircleOutlined style={{ color: COLORS.success }} /> : <CopyOutlined />}
                      </IconButton>
                    </Tooltip>
                  </Stack>
                ) : (
                  <Typography fontSize={13} color={COLORS.muted}>
                    Chưa có mã vận đơn
                  </Typography>
                )}
              </Box>

              <Box>
                <Typography fontSize={11} color={COLORS.muted}>
                  Trạng thái kiện hàng:
                </Typography>
                <Typography fontSize={13} fontWeight={600} color={COLORS.text}>
                  {shipmentStatusLabel(order.shipmentStatus)}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>

        {/* RECIPIENT & PRIVACY CARD */}
        <Grid item xs={12} sm={6}>
          <Paper elevation={0} sx={{ p: 2.5, height: '100%', border: `1px solid ${COLORS.border}`, borderRadius: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                {order.verified ? (
                  <SafetyCertificateOutlined style={{ fontSize: 18, color: COLORS.success }} />
                ) : (
                  <LockOutlined style={{ fontSize: 18, color: COLORS.warning }} />
                )}
                <Typography fontSize={14} fontWeight={700} color={COLORS.text}>
                  Người nhận hàng
                </Typography>
              </Stack>
              <Chip
                label={order.verified ? 'Đã xác thực' : 'Bảo mật thông tin'}
                size="small"
                color={order.verified ? 'success' : 'default'}
                sx={{ fontSize: 11, fontWeight: 600 }}
              />
            </Stack>

            <Stack spacing={1}>
              <Box>
                <Typography fontSize={11} color={COLORS.muted}>
                  Tên người nhận:
                </Typography>
                <Typography fontSize={13} fontWeight={600} color={COLORS.text}>
                  {order.customerName || 'Khách hàng'}
                </Typography>
              </Box>

              <Box>
                <Typography fontSize={11} color={COLORS.muted}>
                  Số điện thoại:
                </Typography>
                <Typography fontSize={13} fontWeight={600} color={COLORS.text}>
                  {order.customerPhone || '—'}
                </Typography>
              </Box>

              <Box>
                <Typography fontSize={11} color={COLORS.muted}>
                  Địa chỉ giao hàng:
                </Typography>
                <Typography fontSize={13} color={COLORS.text}>
                  {order.deliveryAddress || '—'}
                </Typography>
              </Box>
            </Stack>

            {/* UNLOCK PROMPT FOR GUEST USERS */}
            {!order.verified && (
              <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px dashed ${COLORS.border}` }}>
                <Typography fontSize={11} color={COLORS.muted} sx={{ mb: 1 }}>
                  🔒 Nhập 4 số cuối SĐT người nhận để mở khóa địa chỉ đầy đủ & gửi yêu cầu đổi trả:
                </Typography>
                <Box component="form" onSubmit={handleVerifyPin}>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      size="small"
                      placeholder="Ví dụ: 0971"
                      value={phonePin}
                      onChange={(e) => setPhonePin(e.target.value)}
                      slotProps={{ htmlInput: { maxLength: 10, style: { fontSize: 12, padding: '6px 10px' } } }}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      type="submit"
                      disabled={verifyingPin}
                      startIcon={verifyingPin ? <CircularProgress size={12} /> : <UnlockOutlined />}
                      sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                      Mở khóa
                    </Button>
                  </Stack>
                  {pinError && (
                    <Typography fontSize={11} color={COLORS.danger} sx={{ mt: 0.5 }}>
                      {pinError}
                    </Typography>
                  )}
                </Box>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* ITEMS IN ORDER */}
      <Paper elevation={0} sx={{ p: 2.5, mb: 3, border: `1px solid ${COLORS.border}`, borderRadius: 3 }}>
        <Typography fontSize={14} fontWeight={700} color={COLORS.text} sx={{ mb: 2 }}>
          Danh sách sản phẩm trong đơn ({order.items?.length || 0})
        </Typography>

        <TableContainer>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#F8FAFC' }}>
              <TableRow>
                <TableCell sx={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>SẢN PHẨM</TableCell>
                <TableCell align="right" sx={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>ĐƠN GIÁ</TableCell>
                <TableCell align="center" sx={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>SỐ LƯỢNG</TableCell>
                <TableCell align="right" sx={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>THÀNH TIỀN</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {order.items?.map((item) => (
                <TableRow key={item.orderItemId} hover>
                  <TableCell>
                    <Typography fontSize={13} fontWeight={600} color={COLORS.text}>
                      {item.productName}
                    </Typography>
                    <Typography fontSize={11} color={COLORS.muted}>
                      Size: {item.size} • Màu: {item.color}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontSize={12} color={COLORS.text}>
                      {formatVnd(item.unitPrice)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography fontSize={12} color={COLORS.text}>
                      {item.quantityPurchased}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontSize={13} fontWeight={600} color={COLORS.text}>
                      {formatVnd(Number(item.unitPrice || 0) * (item.quantityPurchased || 1))}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* CUSTOMER RETURN CALL-TO-ACTION */}
      {canRequestReturn && (
        <Paper
          elevation={0}
          sx={{
            p: 3,
            mb: 3,
            bgcolor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: 3,
            textAlign: 'center'
          }}
        >
          <Typography variant="h6" fontWeight={700} color="#166534" gutterBottom>
            Sản phẩm chưa vừa ý hoặc gặp vấn đề?
          </Typography>
          <Typography fontSize={13} color="#15803D" sx={{ maxWidth: 560, mx: 'auto', mb: 2 }}>
            Quý khách có thể gửi yêu cầu Trả hàng & Hoàn tiền trực tuyến tại đây. Cửa hàng luôn hỗ trợ giải quyết nhanh chóng trong 24 giờ!
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={() => setReturnDialogOpen(true)}
            startIcon={<RollbackOutlined />}
            sx={{
              bgcolor: '#16A34A',
              fontWeight: 700,
              textTransform: 'none',
              px: 4,
              py: 1.2,
              borderRadius: 2,
              '&:hover': { bgcolor: '#15803D' }
            }}
          >
            Yêu cầu Trả hàng / Hoàn tiền
          </Button>
        </Paper>
      )}

      {/* SHOP CONTACT FOOTER */}
      <Box sx={{ textAlign: 'center', py: 2 }}>
        <Typography fontSize={12} color={COLORS.muted}>
          Cần hỗ trợ thêm về đơn hàng? Vui lòng liên hệ Hotline: <strong>038.686.8686</strong> hoặc nhắn tin trực tiếp qua Fanpage.
        </Typography>
      </Box>

      {/* CUSTOMER RETURN DIALOG */}
      {returnDialogOpen && (
        <CustomerReturnDialog
          open={returnDialogOpen}
          onClose={() => setReturnDialogOpen(false)}
          orderData={order}
          isPublic={true}
          verifiedPhone={phonePin}
          onSuccess={(msg) => {
            setSuccessBanner(msg);
            loadTracking(phonePin);
          }}
        />
      )}
    </Container>
  );
}

