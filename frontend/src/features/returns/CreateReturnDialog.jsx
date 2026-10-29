import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
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
  Checkbox,
  Divider,
  Paper,
  Chip,
  RadioGroup,
  FormControlLabel,
  Radio
} from '@mui/material';
import { SearchOutlined, CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { getReturnableOrder, createReturnRequest } from '../../services/returnService';

const COLORS = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  cyan: '#8DE9F2',
  cyanLight: '#EAFBFD',
  green: '#25856A',
  red: '#D04D4D'
};

function formatPrice(val) {
  if (val == null) return '0 ₫';
  return `${Number(val).toLocaleString('vi-VN')} ₫`;
}

export default function CreateReturnDialog({ open, onClose, onSuccess }) {
  const [orderNumber, setOrderNumber] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [orderData, setOrderData] = useState(null);

  // Return form state
  const [reason, setReason] = useState('');
  const [requestType, setRequestType] = useState('RETURN');
  const [instantComplete, setInstantComplete] = useState(true); // Default to in-store direct completion
  const [selectedItems, setSelectedItems] = useState({}); // { [orderItemId]: { checked, quantity, itemReason } }
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const resetDialog = () => {
    setOrderNumber('');
    setSearching(false);
    setSearchError('');
    setOrderData(null);
    setReason('');
    setRequestType('RETURN');
    setInstantComplete(true);
    setSelectedItems({});
    setSubmitting(false);
    setSubmitError('');
  };

  const handleClose = () => {
    if (submitting) return;
    resetDialog();
    onClose();
  };

  const handleSearchOrder = async () => {
    if (!orderNumber.trim()) {
      setSearchError('Vui lòng nhập mã đơn hàng (Ví dụ: ORD-...).');
      return;
    }

    try {
      setSearching(true);
      setSearchError('');
      setOrderData(null);
      setSelectedItems({});

      const data = await getReturnableOrder(orderNumber.trim());
      setOrderData(data);

      // Pre-populate items
      const initial = {};
      data.items?.forEach((item) => {
        initial[item.orderItemId] = {
          checked: false,
          quantity: item.quantityReturnable > 0 ? 1 : 0,
          itemReason: '',
          restock: true
        };
      });
      setSelectedItems(initial);
    } catch (err) {
      console.error('Failed to lookup order:', err);
      setSearchError(err?.message || 'Không tìm thấy đơn hàng hoặc đơn hàng chưa hoàn tất.');
    } finally {
      setSearching(false);
    }
  };

  const handleItemCheck = (orderItemId, checked) => {
    setSelectedItems((prev) => ({
      ...prev,
      [orderItemId]: {
        ...prev[orderItemId],
        checked
      }
    }));
  };

  const handleItemQtyChange = (orderItemId, qty, maxQty) => {
    const val = Math.max(1, Math.min(maxQty, Number(qty) || 1));
    setSelectedItems((prev) => ({
      ...prev,
      [orderItemId]: {
        ...prev[orderItemId],
        quantity: val
      }
    }));
  };

  const handleItemRestockToggle = (orderItemId, restock) => {
    setSelectedItems((prev) => ({
      ...prev,
      [orderItemId]: {
        ...prev[orderItemId],
        restock
      }
    }));
  };

  const handleItemReasonChange = (orderItemId, itemReason) => {
    setSelectedItems((prev) => ({
      ...prev,
      [orderItemId]: {
        ...prev[orderItemId],
        itemReason
      }
    }));
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setSubmitError('Vui lòng nhập lý do hoàn hàng tổng quát.');
      return;
    }

    const itemsToReturn = Object.entries(selectedItems)
      .filter(([_, val]) => val.checked)
      .map(([id, val]) => ({
        orderItemId: Number(id),
        quantityReturned: val.quantity,
        quantityReceived: val.quantity,
        quantityRestocked: instantComplete && val.restock === false ? 0 : val.quantity,
        itemReason: val.itemReason || reason.trim()
      }));

    if (itemsToReturn.length === 0) {
      setSubmitError('Vui lòng chọn ít nhất một sản phẩm cần hoàn trả.');
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError('');

      await createReturnRequest({
        orderNumber: orderData.orderNumber,
        customerName: orderData.customerName,
        customerPhone: orderData.customerPhone,
        reason: reason.trim(),
        requestType,
        instantComplete,
        items: itemsToReturn
      });

      handleClose();
      if (onSuccess) {
        onSuccess(
          instantComplete
            ? `Cửa hàng đã hoàn tất đổi trả & tự động cộng lại tồn kho cho đơn ${orderData.orderNumber}!`
            : `Đã tiếp nhận yêu cầu hoàn hàng cho đơn ${orderData.orderNumber}!`
        );
      }
    } catch (err) {
      console.error('Submit return request failed:', err);
      setSubmitError(err?.message || 'Không thể tạo yêu cầu hoàn hàng. Vui lòng kiểm tra lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, color: COLORS.text }}>
        Tạo phiếu đổi trả & hoàn hàng
      </DialogTitle>

      <DialogContent dividers>
        {/* STEP 1: SEARCH ORDER */}
        <Box sx={{ mb: 2.5 }}>
          <Typography fontSize={13} fontWeight={700} color={COLORS.text} sx={{ mb: 1 }}>
            Bước 1: Tra cứu đơn hàng cần hoàn trả
          </Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              fullWidth
              placeholder="Nhập mã đơn hàng (Ví dụ: ORD-...)"
              value={orderNumber}
              disabled={searching || submitting}
              onChange={(e) => setOrderNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearchOrder();
                }
              }}
            />
            <Button
              variant="contained"
              startIcon={searching ? <CircularProgress size={16} color="inherit" /> : <SearchOutlined />}
              disabled={searching || submitting}
              onClick={handleSearchOrder}
              sx={{
                bgcolor: COLORS.cyan,
                color: COLORS.text,
                fontWeight: 600,
                textTransform: 'none',
                minWidth: 120,
                '&:hover': { bgcolor: '#6DDDE9' }
              }}
            >
              {searching ? 'Đang tìm...' : 'Tra cứu'}
            </Button>
          </Stack>

          {searchError && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {searchError}
            </Alert>
          )}
        </Box>

        {/* STEP 2: ORDER INFO & ITEMS */}
        {orderData && (
          <Box>
            <Divider sx={{ mb: 2 }} />

            {/* PROCESSING MODE SELECTION */}
            <Paper sx={{ p: 1.5, mb: 2, bgcolor: '#F0FCFE', border: `1px solid ${COLORS.cyan}`, borderRadius: 2 }}>
              <Typography fontSize={12} fontWeight={700} color={COLORS.text} sx={{ mb: 0.5 }}>
                Hình thức xử lý của Cửa hàng:
              </Typography>
              <RadioGroup
                row
                value={instantComplete ? 'instant' : 'pending'}
                onChange={(e) => setInstantComplete(e.target.value === 'instant')}
              >
                <FormControlLabel
                  value="instant"
                  control={<Radio size="small" />}
                  label={
                    <Typography fontSize={12} fontWeight={600} color={COLORS.green}>
                      ⚡ Đổi trả trực tiếp tại quầy (Kiểm hàng, hoàn tiền & nhập kho ngay)
                    </Typography>
                  }
                />
                <FormControlLabel
                  value="pending"
                  control={<Radio size="small" />}
                  label={
                    <Typography fontSize={12} color={COLORS.muted}>
                      📦 Tiếp nhận từ xa / Online (Chờ khách gửi hàng về rồi mới duyệt)
                    </Typography>
                  }
                />
              </RadioGroup>
            </Paper>

            <Paper sx={{ p: 2, mb: 2.5, bgcolor: '#F7F9FC', border: `1px solid ${COLORS.border}`, borderRadius: 2 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
                <Box>
                  <Typography fontSize={14} fontWeight={700} color={COLORS.text}>
                    Đơn hàng: {orderData.orderNumber}
                  </Typography>
                  <Typography fontSize={12} color={COLORS.muted} sx={{ mt: 0.5 }}>
                    Khách hàng: <strong>{orderData.customerName || 'Khách vãng lai'}</strong> — SĐT: {orderData.customerPhone || '—'}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: { sm: 'right' } }}>
                  <Chip label={orderData.orderStatus} size="small" sx={{ bgcolor: '#E8F6F0', color: COLORS.green, fontWeight: 700 }} />
                  <Typography fontSize={12} color={COLORS.muted} sx={{ mt: 0.5 }}>
                    Tổng tiền đơn: <strong>{formatPrice(orderData.totalAmount)}</strong>
                  </Typography>
                </Box>
              </Stack>
            </Paper>

            <Typography fontSize={13} fontWeight={700} color={COLORS.text} sx={{ mb: 1 }}>
              Bước 2: Chọn sản phẩm và số lượng muốn hoàn trả
            </Typography>

            <TableContainer component={Paper} sx={{ border: `1px solid ${COLORS.border}`, borderRadius: 2, mb: 2.5 }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#F7F9FC' }}>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell sx={{ fontSize: 11, fontWeight: 600, color: COLORS.muted }}>SẢN PHẨM</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 600, color: COLORS.muted }}>ĐƠN GIÁ</TableCell>
                    <TableCell align="center" sx={{ fontSize: 11, fontWeight: 600, color: COLORS.muted }}>ĐÃ MUA</TableCell>
                    <TableCell align="center" sx={{ fontSize: 11, fontWeight: 600, color: COLORS.muted }}>CÒN ĐƯỢC TRẢ</TableCell>
                    <TableCell align="center" sx={{ fontSize: 11, fontWeight: 600, color: COLORS.muted }}>SL TRẢ</TableCell>
                    {instantComplete && (
                      <TableCell align="center" sx={{ fontSize: 11, fontWeight: 600, color: COLORS.muted }}>
                        NHẬP LẠI KHO?
                      </TableCell>
                    )}
                    <TableCell sx={{ fontSize: 11, fontWeight: 600, color: COLORS.muted }}>LÝ DO CHI TIẾT</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orderData.items?.map((item) => {
                    const itemState = selectedItems[item.orderItemId] || { checked: false, quantity: 1, itemReason: '', restock: true };
                    const isReturnable = item.quantityReturnable > 0;

                    return (
                      <TableRow key={item.orderItemId} hover sx={{ opacity: isReturnable ? 1 : 0.5 }}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={itemState.checked}
                            disabled={!isReturnable || submitting}
                            onChange={(e) => handleItemCheck(item.orderItemId, e.target.checked)}
                          />
                        </TableCell>
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
                          <Typography fontSize={12} color={COLORS.text}>
                            {item.quantityPurchased}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography fontSize={12} fontWeight={700} color={item.quantityReturnable > 0 ? COLORS.green : COLORS.red}>
                            {item.quantityReturnable}
                          </Typography>
                        </TableCell>
                        <TableCell align="center" sx={{ width: 90 }}>
                          <TextField
                            size="small"
                            type="number"
                            disabled={!itemState.checked || submitting}
                            value={itemState.quantity}
                            slotProps={{ htmlInput: { min: 1, max: item.quantityReturnable, style: { textAlign: 'center', fontSize: 12, padding: '4px 6px' } } }}
                            onChange={(e) => handleItemQtyChange(item.orderItemId, e.target.value, item.quantityReturnable)}
                          />
                        </TableCell>

                        {instantComplete && (
                          <TableCell align="center" sx={{ minWidth: 150 }}>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  size="small"
                                  checked={itemState.restock !== false}
                                  disabled={!itemState.checked || submitting}
                                  onChange={(e) => handleItemRestockToggle(item.orderItemId, e.target.checked)}
                                  sx={{ color: COLORS.green, '&.Mui-checked': { color: COLORS.green }, p: 0.5 }}
                                />
                              }
                              label={
                                <Typography
                                  fontSize={11}
                                  fontWeight={700}
                                  color={itemState.restock !== false ? COLORS.green : COLORS.red}
                                >
                                  {itemState.restock !== false ? 'Có (Cộng kho)' : 'Hàng lỗi (Không cộng kho)'}
                                </Typography>
                              }
                              sx={{ m: 0 }}
                            />
                          </TableCell>
                        )}

                        <TableCell>
                          <TextField
                            size="small"
                            fullWidth
                            placeholder="Lý do chi tiết"
                            disabled={!itemState.checked || submitting}
                            value={itemState.itemReason}
                            slotProps={{ htmlInput: { style: { fontSize: 11, padding: '4px 8px' } } }}
                            onChange={(e) => handleItemReasonChange(item.orderItemId, e.target.value)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            {/* STEP 3: REASON & TYPE */}
            <Typography fontSize={13} fontWeight={700} color={COLORS.text} sx={{ mb: 1 }}>
              Bước 3: Lý do hoàn trả chung
            </Typography>
            <TextField
              size="small"
              fullWidth
              multiline
              rows={2}
              placeholder="Nhập lý do khách trả hàng (Ví dụ: Khách mặc chật đổi size L, lỗi khóa kéo, không ưng màu...)"
              disabled={submitting}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              sx={{ mb: 2 }}
            />

            {submitError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {submitError}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={submitting} sx={{ color: COLORS.muted, textTransform: 'none' }}>
          Hủy
        </Button>
        <Button
          variant="contained"
          disabled={!orderData || submitting}
          onClick={handleSubmit}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : instantComplete ? <ThunderboltOutlined /> : <CheckCircleOutlined />}
          sx={{
            bgcolor: instantComplete ? COLORS.green : '#0E7A88',
            color: '#FFFFFF',
            fontWeight: 700,
            textTransform: 'none',
            '&:hover': { bgcolor: instantComplete ? '#1E6B55' : '#095B66' }
          }}
        >
          {submitting
            ? 'Đang xử lý...'
            : instantComplete
            ? 'Xác nhận hoàn hàng & Nhập kho ngay'
            : 'Gửi yêu cầu hoàn hàng'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
