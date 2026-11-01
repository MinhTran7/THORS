import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Stack,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Divider,
  TextField,
  Stepper,
  Step,
  StepLabel,
  Grid
} from '@mui/material';
import {
  CheckOutlined,
  CloseOutlined,
  InboxOutlined,
  DollarCircleOutlined,
  AuditOutlined,
  CheckCircleFilled,
  BankOutlined,
  QrcodeOutlined,
  CopyOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { processReturnRequest, getReturnRequestById } from '../../services/returnService';
import { generateVietQrUrl, getBankByCode } from '../../utils/vietqr';

const COLORS = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  cyan: '#8DE9F2',
  green: '#25856A',
  red: '#D04D4D',
  yellow: '#E59A00'
};

function formatPrice(val) {
  if (val == null) return '0 ₫';
  return `${Number(val).toLocaleString('vi-VN')} ₫`;
}

function getStatusChip(status) {
  switch (status) {
    case 'PENDING':
      return <Chip size="small" label="Chờ cửa hàng duyệt" sx={{ bgcolor: '#FFF7E6', color: COLORS.yellow, fontWeight: 700 }} />;
    case 'APPROVED':
      return <Chip size="small" label="Cửa hàng đã duyệt" sx={{ bgcolor: '#EAFBFD', color: '#0E7A88', fontWeight: 700 }} />;
    case 'RECEIVED':
      return <Chip size="small" label="Đã nhận hàng tại shop" sx={{ bgcolor: '#E8F6F0', color: COLORS.green, fontWeight: 700 }} />;
    case 'COMPLETED':
      return <Chip size="small" label="Đã hoàn tất & Nhập kho" sx={{ bgcolor: '#E8F6F0', color: COLORS.green, fontWeight: 700 }} />;
    case 'REJECTED':
      return <Chip size="small" label="Cửa hàng đã từ chối" sx={{ bgcolor: '#FCECEC', color: COLORS.red, fontWeight: 700 }} />;
    default:
      return <Chip size="small" label={status} />;
  }
}

const STEPS = [
  'Tiếp nhận yêu cầu',
  'Cửa hàng phê duyệt',
  'Đã nhận hàng về shop',
  'Kiểm định & Nhập kho'
];

function getActiveStep(status) {
  switch (status) {
    case 'PENDING':
      return 0;
    case 'APPROVED':
      return 1;
    case 'RECEIVED':
      return 2;
    case 'COMPLETED':
      return 4;
    case 'REJECTED':
      return 1;
    default:
      return 0;
  }
}

export default function ReturnDetailDialog({ open, onClose, returnData, onProcessed }) {
  const [processing, setProcessing] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [completeItems, setCompleteItems] = useState({}); // { [itemId]: { quantityReceived, quantityRestocked, refundAmount } }
  const [currentData, setCurrentData] = useState(returnData);
  const [copied, setCopied] = useState(false);

  const initCompleteItems = (items) => {
    const initial = {};
    (items || []).forEach((item) => {
      const qtyRecv = item.quantityReceived > 0 ? item.quantityReceived : item.quantityReturned;
      const qtyRestock = item.quantityRestocked > 0 ? item.quantityRestocked : qtyRecv;
      const refund = item.refundAmount && Number(item.refundAmount) > 0
        ? Number(item.refundAmount)
        : Number(item.unitPrice) * qtyRecv;

      initial[item.returnRequestItemId] = {
        quantityReceived: qtyRecv,
        quantityRestocked: qtyRestock,
        refundAmount: refund
      };
    });
    setCompleteItems(initial);
  };

  useEffect(() => {
    if (!open || !returnData) {
      setCurrentData(null);
      return;
    }

    setCurrentData(returnData);
    setShowCompleteForm(false);
    setError('');

    if (returnData.items && returnData.items.length > 0) {
      initCompleteItems(returnData.items);
    } else if (returnData.returnRequestId) {
      setLoadingDetail(true);
      getReturnRequestById(returnData.returnRequestId)
        .then((fullData) => {
          setCurrentData(fullData);
          initCompleteItems(fullData.items || []);
        })
        .catch((err) => {
          console.error('Failed to load return details:', err);
        })
        .finally(() => {
          setLoadingDetail(false);
        });
    }
  }, [open, returnData]);

  if (!open || (!returnData && !currentData)) return null;

  const data = currentData || returnData;

  const handleAction = async (action, itemsPayload = null) => {
    try {
      setProcessing(true);
      setError('');

      const payload = { action };
      if (itemsPayload) {
        payload.items = itemsPayload;
      }

      await processReturnRequest(data.returnRequestId, payload);
      if (onProcessed) {
        onProcessed(`Cửa hàng đã xác nhận thao tác [${action}] thành công cho phiếu #${data.returnRequestId}!`);
      }
      onClose();
    } catch (err) {
      console.error('Process return failed:', err);
      setError(err?.message || 'Không thể xử lý yêu cầu. Vui lòng kiểm tra lại quyền hạn hoặc trạng thái.');
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmComplete = () => {
    const payload = Object.entries(completeItems).map(([id, val]) => ({
      returnRequestItemId: Number(id),
      quantityReceived: Number(val.quantityReceived),
      quantityRestocked: Number(val.quantityRestocked),
      refundAmount: Number(val.refundAmount)
    }));
    handleAction('COMPLETE', payload);
  };

  const status = data.status;
  const activeStep = getActiveStep(status);

  return (
    <Dialog open={open} onClose={() => !processing && onClose()} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, color: COLORS.text, pb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography fontSize={18} fontWeight={700}>
              Xác nhận & Xử lý hoàn hàng #{data.returnRequestId}
            </Typography>
            <Typography fontSize={12} color={COLORS.muted}>
              Khu vực thao tác nghiệp vụ dành cho Chủ cửa hàng / Nhân viên
            </Typography>
          </Box>
          {getStatusChip(status)}
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        {/* STORE WORKFLOW STEPPER */}
        <Box sx={{ mb: 3, mt: 1 }}>
          <Stepper activeStep={activeStep} alternativeLabel>
            {STEPS.map((label, index) => {
              const isError = status === 'REJECTED' && index === 1;
              return (
                <Step key={label}>
                  <StepLabel error={isError}>
                    <Typography fontSize={12} fontWeight={activeStep === index ? 700 : 500}>
                      {isError ? 'Cửa hàng từ chối' : label}
                    </Typography>
                  </StepLabel>
                </Step>
              );
            })}
          </Stepper>
        </Box>

        {/* ORDER & CUSTOMER INFORMATION */}
        <Paper sx={{ p: 2, mb: 2.5, bgcolor: '#F7F9FC', border: `1px solid ${COLORS.border}`, borderRadius: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
            <Box>
              <Typography fontSize={13} color={COLORS.muted}>
                Mã đơn hàng: <strong style={{ color: '#0E7A88' }}>{data.orderNumber}</strong>
              </Typography>
              <Typography fontSize={13} color={COLORS.muted} sx={{ mt: 0.5 }}>
                Khách hàng: <strong>{data.customerName || 'Khách vãng lai'}</strong> — SĐT: {data.customerPhone || '—'}
              </Typography>
              <Typography fontSize={13} color={COLORS.muted} sx={{ mt: 0.5 }}>
                Lý do hoàn trả: <strong style={{ color: COLORS.text }}>{data.reason}</strong>
              </Typography>
            </Box>
            <Box sx={{ textAlign: { sm: 'right' } }}>
              <Typography fontSize={12} color={COLORS.muted}>
                Ngày yêu cầu: {data.requestedAt ? new Date(data.requestedAt).toLocaleString('vi-VN') : '—'}
              </Typography>
              <Typography fontSize={13} color={COLORS.muted} sx={{ mt: 0.5 }}>
                Tổng tiền hoàn dự kiến: <strong style={{ color: COLORS.green, fontSize: 15 }}>{formatPrice(data.totalRefundAmount)}</strong>
              </Typography>
              {data.processedByName && (
                <Typography fontSize={11} color={COLORS.muted} sx={{ mt: 0.5 }}>
                  Người xử lý: <strong>{data.processedByName}</strong> ({data.processedAt ? new Date(data.processedAt).toLocaleString('vi-VN') : ''})
                </Typography>
              )}
            </Box>
          </Stack>
        </Paper>

        {/* ONLINE REFUND & SHIPPING INFO */}
        {(data.bankAccountNumber || data.returnTrackingCode || data.evidenceUrls) && (
          <Paper sx={{ p: 2, mb: 2.5, bgcolor: '#FAFCFF', border: `1px solid ${COLORS.cyan}`, borderRadius: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
              <BankOutlined style={{ color: '#0E7A88', fontSize: 16 }} />
              <Typography fontSize={13} fontWeight={700} color={COLORS.text}>
                Thông tin hoàn tiền & Vận chuyển bưu cục (Online)
              </Typography>
            </Stack>

            <Grid container spacing={2}>
              {data.bankAccountNumber && (
                <>
                  <Grid item xs={12} sm={4}>
                    <Typography fontSize={11} color={COLORS.muted}>Ngân hàng thụ hưởng</Typography>
                    <Typography fontSize={13} fontWeight={700} color={COLORS.text}>
                      {getBankByCode(data.bankCode)?.name || data.bankCode || '—'}
                    </Typography>
                  </Grid>

                  <Grid item xs={12} sm={4}>
                    <Typography fontSize={11} color={COLORS.muted}>Số tài khoản nhận tiền</Typography>
                    <Typography fontSize={13} fontWeight={700} color="#0E7A88">
                      {data.bankAccountNumber}
                    </Typography>
                  </Grid>

                  <Grid item xs={12} sm={4}>
                    <Typography fontSize={11} color={COLORS.muted}>Chủ tài khoản</Typography>
                    <Typography fontSize={13} fontWeight={700} color={COLORS.text}>
                      {data.bankAccountName || data.customerName || '—'}
                    </Typography>
                  </Grid>
                </>
              )}

              {data.returnTrackingCode && (
                <Grid item xs={12} sm={6}>
                  <Typography fontSize={11} color={COLORS.muted}>Mã vận đơn bưu cục gửi hoàn</Typography>
                  <Typography fontSize={13} fontWeight={700} color={COLORS.text}>
                    {data.returnTrackingCode}
                  </Typography>
                </Grid>
              )}

              {data.evidenceUrls && (
                <Grid item xs={12} sm={6}>
                  <Typography fontSize={11} color={COLORS.muted}>Ảnh minh chứng lỗi</Typography>
                  <Typography fontSize={12} color="#0E7A88" sx={{ wordBreak: 'break-all' }}>
                    {data.evidenceUrls.startsWith('http') ? (
                      <a href={data.evidenceUrls} target="_blank" rel="noreferrer" style={{ color: '#0E7A88', fontWeight: 600 }}>
                        Xem ảnh minh chứng ↗
                      </a>
                    ) : (
                      data.evidenceUrls
                    )}
                  </Typography>
                </Grid>
              )}
            </Grid>
          </Paper>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* ITEMS INSPECTION TABLE */}
        <Typography fontSize={13} fontWeight={700} color={COLORS.text} sx={{ mb: 1 }}>
          Chi tiết kiểm định hàng trả
        </Typography>

        <TableContainer component={Paper} sx={{ border: `1px solid ${COLORS.border}`, borderRadius: 2, mb: 2 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#F7F9FC' }}>
              <TableRow>
                <TableCell sx={{ fontSize: 11, fontWeight: 600, color: COLORS.muted }}>SẢN PHẨM</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 600, color: COLORS.muted }}>ĐƠN GIÁ</TableCell>
                <TableCell align="center" sx={{ fontSize: 11, fontWeight: 600, color: COLORS.muted }}>SL KHÁCH TRẢ</TableCell>
                <TableCell align="center" sx={{ fontSize: 11, fontWeight: 600, color: COLORS.muted }}>SL THỰC NHẬN</TableCell>
                <TableCell align="center" sx={{ fontSize: 11, fontWeight: 600, color: COLORS.muted }}>SL NHẬP LẠI KHO</TableCell>
                <TableCell align="right" sx={{ fontSize: 11, fontWeight: 600, color: COLORS.muted }}>TIỀN HOÀN</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loadingDetail && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={20} />
                    <Typography fontSize={12} color={COLORS.muted} sx={{ mt: 1 }}>
                      Đang tải danh sách sản phẩm hoàn...
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {!loadingDetail && (!data.items || data.items.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3, color: COLORS.muted, fontSize: 13 }}>
                    Không tìm thấy thông tin mặt hàng trong yêu cầu hoàn.
                  </TableCell>
                </TableRow>
              )}
              {!loadingDetail && data.items?.map((item) => {
                const cState = completeItems[item.returnRequestItemId] || {};

                return (
                  <TableRow key={item.returnRequestItemId} hover>
                    <TableCell>
                      <Typography fontSize={12} fontWeight={600} color={COLORS.text}>
                        {item.productName}
                      </Typography>
                      <Typography fontSize={11} color={COLORS.muted}>
                        Size: {item.size} | Màu: {item.color}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography fontSize={12} color={COLORS.text}>
                        {formatPrice(item.unitPrice)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography fontSize={12} fontWeight={700} color={COLORS.text}>
                        {item.quantityReturned}
                      </Typography>
                    </TableCell>

                    {/* QUANTITY RECEIVED */}
                    <TableCell align="center">
                      {showCompleteForm ? (
                        <TextField
                          size="small"
                          type="number"
                          value={cState.quantityReceived ?? item.quantityReturned}
                          slotProps={{ htmlInput: { min: 0, max: item.quantityReturned, style: { textAlign: 'center', fontSize: 12, padding: '4px' } } }}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setCompleteItems((prev) => ({
                              ...prev,
                              [item.returnRequestItemId]: {
                                ...prev[item.returnRequestItemId],
                                quantityReceived: val,
                                quantityRestocked: Math.min(prev[item.returnRequestItemId]?.quantityRestocked ?? val, val),
                                refundAmount: Number(item.unitPrice) * val
                              }
                            }));
                          }}
                          sx={{ width: 75 }}
                        />
                      ) : (
                        <Typography fontSize={12} color={COLORS.text}>
                          {item.quantityReceived}
                        </Typography>
                      )}
                    </TableCell>

                    {/* QUANTITY RESTOCKED */}
                    <TableCell align="center">
                      {showCompleteForm ? (
                        <TextField
                          size="small"
                          type="number"
                          value={cState.quantityRestocked ?? item.quantityReturned}
                          slotProps={{ htmlInput: { min: 0, max: cState.quantityReceived ?? item.quantityReturned, style: { textAlign: 'center', fontSize: 12, padding: '4px' } } }}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setCompleteItems((prev) => ({
                              ...prev,
                              [item.returnRequestItemId]: {
                                ...prev[item.returnRequestItemId],
                                quantityRestocked: val
                              }
                            }));
                          }}
                          sx={{ width: 75 }}
                        />
                      ) : (
                        <Typography fontSize={12} fontWeight={item.quantityRestocked > 0 ? 700 : 400} color={item.quantityRestocked > 0 ? COLORS.green : COLORS.muted}>
                          {item.quantityRestocked}
                        </Typography>
                      )}
                    </TableCell>

                    {/* REFUND AMOUNT */}
                    <TableCell align="right">
                      {showCompleteForm ? (
                        <TextField
                          size="small"
                          type="number"
                          value={cState.refundAmount ?? item.refundAmount}
                          slotProps={{ htmlInput: { min: 0, style: { textAlign: 'right', fontSize: 12, padding: '4px' } } }}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setCompleteItems((prev) => ({
                              ...prev,
                              [item.returnRequestItemId]: {
                                ...prev[item.returnRequestItemId],
                                refundAmount: val
                              }
                            }));
                          }}
                          sx={{ width: 110 }}
                        />
                      ) : (
                        <Typography fontSize={12} fontWeight={700} color={COLORS.text}>
                          {formatPrice(item.refundAmount)}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        {showCompleteForm && data.bankAccountNumber && (
          <Paper sx={{ p: 2.5, my: 2, bgcolor: '#F0FCFE', border: `1.5px dashed #0E7A88`, borderRadius: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems="center">
              <Box sx={{ textAlign: 'center', bgcolor: '#FFF', p: 1.5, borderRadius: 2, border: `1px solid ${COLORS.border}`, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
                <img
                  src={generateVietQrUrl({
                    bankCode: data.bankCode || 'MB',
                    accountNumber: data.bankAccountNumber,
                    accountName: data.bankAccountName || data.customerName,
                    amount: Object.values(completeItems).reduce((sum, item) => sum + (Number(item.refundAmount) || 0), 0),
                    memo: `THORS HOAN TIEN DON ${data.orderNumber}`
                  })}
                  alt="VietQR Chuyển khoản hoàn tiền"
                  style={{ width: 175, height: 175, display: 'block', objectFit: 'contain' }}
                />
                <Typography fontSize={11} fontWeight={600} color={COLORS.muted} sx={{ mt: 0.5 }}>
                  Mã VietQR NAPAS 247
                </Typography>
              </Box>

              <Box sx={{ flex: 1, width: '100%' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <QrcodeOutlined style={{ color: '#0E7A88', fontSize: 18 }} />
                  <Typography fontSize={15} fontWeight={700} color={COLORS.text}>
                    Quét mã VietQR chuyển khoản hoàn tiền
                  </Typography>
                </Stack>

                <Typography fontSize={12} color={COLORS.muted} sx={{ mb: 1.5 }}>
                  Hệ thống đã tự động tính đúng tổng tiền hoàn và nạp thông tin tài khoản của khách. Bạn chỉ cần mở app ngân hàng quét mã trong 3 giây.
                </Typography>

                <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#FFF', borderRadius: 1.5 }}>
                  <Grid container spacing={1.5}>
                    <Grid item xs={6}>
                      <Typography fontSize={11} color={COLORS.muted}>Ngân hàng thụ hưởng:</Typography>
                      <Typography fontSize={13} fontWeight={700} color={COLORS.text}>
                        {getBankByCode(data.bankCode)?.name || data.bankCode || '—'}
                      </Typography>
                    </Grid>

                    <Grid item xs={6}>
                      <Typography fontSize={11} color={COLORS.muted}>Số tài khoản:</Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography fontSize={13} fontWeight={700} color="#0E7A88">
                          {data.bankAccountNumber}
                        </Typography>
                        <Button
                          size="small"
                          startIcon={copied ? <CheckCircleOutlined /> : <CopyOutlined />}
                          onClick={() => {
                            navigator.clipboard.writeText(data.bankAccountNumber);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          sx={{ minWidth: 'auto', p: '2px 6px', fontSize: 11, textTransform: 'none' }}
                        >
                          {copied ? 'Đã chép' : 'Sao chép'}
                        </Button>
                      </Stack>
                    </Grid>

                    <Grid item xs={6}>
                      <Typography fontSize={11} color={COLORS.muted}>Chủ tài khoản:</Typography>
                      <Typography fontSize={13} fontWeight={700} color={COLORS.text}>
                        {data.bankAccountName || data.customerName || '—'}
                      </Typography>
                    </Grid>

                    <Grid item xs={6}>
                      <Typography fontSize={11} color={COLORS.muted}>Số tiền chuyển hoàn:</Typography>
                      <Typography fontSize={15} fontWeight={700} color={COLORS.green}>
                        {formatPrice(Object.values(completeItems).reduce((sum, item) => sum + (Number(item.refundAmount) || 0), 0))}
                      </Typography>
                    </Grid>
                  </Grid>
                </Paper>
              </Box>
            </Stack>
          </Paper>
        )}

        {showCompleteForm && (
          <Alert severity="info" sx={{ mt: 1 }}>
            💡 <strong>Quy trình Cửa hàng xác nhận:</strong> Khi bạn bấm <strong>&quot;Xác nhận hoàn tất & Tăng tồn kho&quot;</strong>, hệ thống sẽ:
            <ol style={{ margin: '6px 0 0 16px', padding: 0 }}>
              <li>Tự động cộng tăng số lượng tồn kho (<code>stock_quantity</code>) của sản phẩm tương ứng với số lượng nhập lại.</li>
              <li>Ghi một bản ghi nhật ký kho <code>RESTOCK</code> vào bảng <code>stock_adjustment</code> để phục vụ kiểm toán kho.</li>
              <li>Cập nhật số tiền đã hoàn cho khách vào bảng thanh toán (<code>payment.refunded_amount</code>).</li>
            </ol>
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={processing} sx={{ color: COLORS.muted, textTransform: 'none' }}>
          Đóng
        </Button>

        {/* STORE ACTIONS FOR PENDING */}
        {status === 'PENDING' && (
          <>
            <Button
              variant="outlined"
              color="error"
              disabled={processing}
              startIcon={<CloseOutlined />}
              onClick={() => handleAction('REJECT')}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Cửa hàng từ chối
            </Button>
            <Button
              variant="contained"
              disabled={processing}
              startIcon={<CheckOutlined />}
              onClick={() => handleAction('APPROVE')}
              sx={{ bgcolor: '#0E7A88', color: '#FFF', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#095B66' } }}
            >
              Cửa hàng phê duyệt
            </Button>
          </>
        )}

        {/* STORE ACTIONS FOR APPROVED/PENDING */}
        {(status === 'APPROVED' || status === 'PENDING') && !showCompleteForm && (
          <Button
            variant="outlined"
            disabled={processing}
            startIcon={<InboxOutlined />}
            onClick={() => handleAction('RECEIVE')}
            sx={{ borderColor: COLORS.green, color: COLORS.green, textTransform: 'none', fontWeight: 600 }}
          >
            Xác nhận đã nhận hàng về shop
          </Button>
        )}

        {/* STORE ACTIONS FOR COMPLETE & RESTOCK */}
        {status !== 'COMPLETED' && status !== 'REJECTED' && (
          <>
            {!showCompleteForm ? (
              <Button
                variant="contained"
                disabled={processing}
                startIcon={<DollarCircleOutlined />}
                onClick={() => setShowCompleteForm(true)}
                sx={{ bgcolor: COLORS.green, color: '#FFF', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#1E6B55' } }}
              >
                Kiểm định, Nhập kho & Hoàn tiền
              </Button>
            ) : (
              <Button
                variant="contained"
                disabled={processing}
                startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <CheckCircleFilled />}
                onClick={handleConfirmComplete}
                sx={{ bgcolor: COLORS.green, color: '#FFF', textTransform: 'none', fontWeight: 700, '&:hover': { bgcolor: '#1E6B55' } }}
              >
                {processing ? 'Đang hoàn tất...' : 'Xác nhận hoàn tất & Tăng tồn kho'}
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
