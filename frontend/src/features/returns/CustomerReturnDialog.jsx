import { useState, useMemo } from 'react';
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
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Grid,
  IconButton
} from '@mui/material';
import {
  CheckCircleOutlined,
  RollbackOutlined,
  CloudUploadOutlined,
  CloseOutlined,
  VideoCameraOutlined
} from '@ant-design/icons';
import { createPublicReturnRequest, createReturnRequest, uploadReturnEvidence } from '../../services/returnService';
import { VIETNAMESE_BANKS } from '../../utils/vietqr';

const COLORS = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  cyan: '#8DE9F2',
  green: '#25856A',
  red: '#D04D4D',
  primary: '#1677FF',
  warning: '#FAAD14'
};

const RETURN_REASONS = [
  {
    id: 'DEFECT',
    label: 'Sản phẩm lỗi kỹ thuật, rách, bung chỉ (Lỗi do Shop)',
    payer: 'SHOP',
    requireEvidence: true,
    badgeText: 'Shop bồi hoàn cước gửi sau kiểm nhận'
  },
  {
    id: 'WRONG_ITEM',
    label: 'Giao sai mẫu, sai màu hoặc sai kích cỡ so với đơn (Lỗi do Shop)',
    payer: 'SHOP',
    requireEvidence: true,
    badgeText: 'Shop bồi hoàn cước gửi sau kiểm nhận'
  },
  {
    id: 'NOT_MATCH_DESC',
    label: 'Hàng không đúng mô tả / hình ảnh (Lỗi do Shop)',
    payer: 'SHOP',
    requireEvidence: true,
    badgeText: 'Shop bồi hoàn cước gửi sau kiểm nhận'
  },
  {
    id: 'WRONG_SIZE_CUSTOMER',
    label: 'Tôi chọn nhầm kích cỡ, mặc không vừa (Nhu cầu cá nhân)',
    payer: 'CUSTOMER',
    requireEvidence: false,
    badgeText: 'Khách tự trả cước cho bưu cục'
  },
  {
    id: 'CHANGE_MIND',
    label: 'Tôi đổi ý không còn nhu cầu sử dụng (Nhu cầu cá nhân)',
    payer: 'CUSTOMER',
    requireEvidence: false,
    badgeText: 'Khách tự trả cước cho bưu cục'
  },
  {
    id: 'OTHER',
    label: 'Lý do khác (Cửa hàng sẽ liên hệ xác nhận)',
    payer: 'CUSTOMER',
    requireEvidence: false,
    badgeText: 'Khách tự trả cước cho bưu cục'
  }
];

function formatPrice(val) {
  if (val == null) return '0 ₫';
  return `${Number(val).toLocaleString('vi-VN')} ₫`;
}

export default function CustomerReturnDialog({
  open,
  onClose,
  orderData,
  isPublic = false,
  verifiedPhone = '',
  onSuccess
}) {
  const [selectedReasonKey, setSelectedReasonKey] = useState('DEFECT');
  const [customReasonNote, setCustomReasonNote] = useState('');
  const [phoneConfirm, setPhoneConfirm] = useState(verifiedPhone || '');
  const [selectedItems, setSelectedItems] = useState({});
  const [bankCode, setBankCode] = useState('MB');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');

  // Upload evidence states
  const [evidenceFiles, setEvidenceFiles] = useState([]); // [{ url, resourceType, name }]
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const normalizedItems = useMemo(() => {
    if (orderData?.items && orderData.items.length > 0) return orderData.items;
    if (orderData?.lines && orderData.lines.length > 0) {
      return orderData.lines.map((line) => ({
        orderItemId: line.orderItemId,
        productName: line.productName,
        size: line.size,
        color: line.color,
        unitPrice: line.unitPrice,
        quantityPurchased: line.quantity,
        quantityReturnable: line.quantityReturnable !== undefined ? line.quantityReturnable : line.quantity
      }));
    }
    return [];
  }, [orderData]);

  // Pre-fill selected items when orderData changes
  const activeReason = useMemo(() => {
    return RETURN_REASONS.find((r) => r.id === selectedReasonKey) || RETURN_REASONS[0];
  }, [selectedReasonKey]);

  const handleItemCheck = (orderItemId, checked) => {
    setSelectedItems((prev) => {
      const cur = prev[orderItemId] || { quantity: 1, itemReason: '' };
      return {
        ...prev,
        [orderItemId]: { ...cur, checked }
      };
    });
  };

  const handleItemQtyChange = (orderItemId, val, maxQty) => {
    let q = parseInt(val, 10);
    if (isNaN(q) || q < 1) q = 1;
    if (q > maxQty) q = maxQty;

    setSelectedItems((prev) => ({
      ...prev,
      [orderItemId]: { ...(prev[orderItemId] || { checked: true }), quantity: q }
    }));
  };

  const calculateSubtotal = () => {
    return normalizedItems.reduce((sum, item) => {
      const state = selectedItems[item.orderItemId];
      if (state?.checked) {
        return sum + Number(item.unitPrice || 0) * (state.quantity || 1);
      }
      return sum;
    }, 0);
  };

  const totalItemRefund = calculateSubtotal();

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (evidenceFiles.length + files.length > 5) {
      setUploadError('Quý khách chỉ có thể tải lên tối đa 5 ảnh hoặc video.');
      return;
    }

    setUploading(true);
    setUploadError('');

    try {
      const uploadedResults = [];
      for (const file of files) {
        if (file.size > 25 * 1024 * 1024) {
          throw new Error(`Tệp "${file.name}" vượt quá dung lượng tối đa 25MB.`);
        }
        const res = await uploadReturnEvidence(file);
        if (res?.url) {
          uploadedResults.push({
            url: res.url,
            resourceType: res.resourceType || (file.type.startsWith('video') ? 'video' : 'image'),
            name: file.name
          });
        }
      }
      setEvidenceFiles((prev) => [...prev, ...uploadedResults]);
    } catch (err) {
      console.error('Evidence upload error:', err);
      setUploadError(err.message || 'Không thể tải lên tệp. Vui lòng thử lại.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveFile = (indexToRemove) => {
    setEvidenceFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const resetDialog = () => {
    setSelectedReasonKey('DEFECT');
    setCustomReasonNote('');
    setPhoneConfirm(verifiedPhone || '');
    setSelectedItems({});
    setBankCode('MB');
    setBankAccountNumber('');
    setBankAccountName('');
    setEvidenceFiles([]);
    setUploadError('');
    setSubmitError('');
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    resetDialog();
    onClose();
  };

  const handleSubmit = async () => {
    if (!orderData) return;

    const itemsToReturn = Object.entries(selectedItems)
      .filter(([_, val]) => val.checked)
      .map(([id, val]) => ({
        orderItemId: Number(id),
        quantityReturned: val.quantity,
        quantityReceived: 0,
        quantityRestocked: 0,
        itemReason: val.itemReason || activeReason.label
      }));

    if (itemsToReturn.length === 0) {
      setSubmitError('Vui lòng chọn ít nhất 1 sản phẩm bạn muốn hoàn trả.');
      return;
    }

    // Anti-spam rule: Must provide evidence photo if claiming Shop Fault
    if (activeReason.requireEvidence && evidenceFiles.length === 0) {
      setSubmitError(
        'Để đảm bảo tính xác thực khi báo lỗi từ phía Cửa hàng, quý khách vui lòng tải lên ít nhất 1 ảnh/video chụp rõ lỗi sản phẩm và tem mác.'
      );
      return;
    }

    if (isPublic && !orderData.verified && !phoneConfirm.trim()) {
      setSubmitError('Vui lòng nhập số điện thoại đặt hàng để xác nhận danh tính.');
      return;
    }

    if (!bankAccountNumber.trim()) {
      setSubmitError('Vui lòng nhập số tài khoản ngân hàng để nhận lại tiền.');
      return;
    }

    if (!bankAccountName.trim()) {
      setSubmitError('Vui lòng nhập tên chủ tài khoản ngân hàng.');
      return;
    }

    const payload = {
      orderNumber: orderData.orderNumber,
      customerName: orderData.customerName || 'Khách hàng',
      customerPhone: phoneConfirm.trim() || orderData.customerPhone || orderData.deliveryPhone,
      reason: `${activeReason.label}${customReasonNote.trim() ? ` — Chi tiết: ${customReasonNote.trim()}` : ''}`,
      requestType: 'RETURN',
      instantComplete: false,
      bankCode,
      bankAccountNumber: bankAccountNumber.trim(),
      bankAccountName: bankAccountName.trim().toUpperCase(),
      returnShippingFee: 0,
      returnShippingPayer: activeReason.payer,
      evidenceUrls: evidenceFiles.map((f) => f.url).join(','),
      items: itemsToReturn
    };

    try {
      setSubmitting(true);
      setSubmitError('');

      if (isPublic) {
        await createPublicReturnRequest(payload);
      } else {
        await createReturnRequest(payload);
      }

      handleClose();
      if (onSuccess) {
        onSuccess(
          `Yêu cầu hoàn hàng cho đơn ${orderData.orderNumber} đã gửi thành công! Cửa hàng sẽ kiểm tra và phản hồi sớm nhất.`
        );
      }
    } catch (err) {
      console.error('Submit return request failed:', err);
      setSubmitError(err?.message || 'Không thể gửi yêu cầu hoàn hàng. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, color: COLORS.text, pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <RollbackOutlined style={{ color: COLORS.primary }} />
          <span>Yêu cầu Trả hàng & Hoàn tiền</span>
        </Stack>
        <Typography fontSize={13} color={COLORS.muted} sx={{ mt: 0.5 }}>
          Đơn hàng: <strong>{orderData?.orderNumber}</strong> • Khách hàng: {orderData?.customerName || 'Khách hàng'}
        </Typography>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 2 }}>
        {/* POLICY ALERT BANNER - OPTION 1 TRANSPARENT POLICY */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2.5,
            bgcolor: '#F0F9FF',
            border: '1px solid #BAE6FD',
            borderRadius: 2
          }}
        >
          <Typography fontSize={13} fontWeight={700} color="#0369A1" sx={{ mb: 0.5 }}>
            📦 Quy định Vận chuyển & Hoàn tiền minh bạch (Chuẩn sàn TMĐT):
          </Typography>
          <Typography fontSize={12} color={COLORS.text} sx={{ mb: 0.5 }}>
            • <strong>Hình thức gửi hàng:</strong> Sau khi shop duyệt yêu cầu, quý khách đóng gói sản phẩm và mang ra bưu cục gần nhất (GHTK, Viettel Post, GHN, VNPost...) gửi về kho shop và <strong>thanh toán cước vận chuyển thực tế trực tiếp với bên bưu cục</strong>.
          </Typography>
          <Typography fontSize={12} color={COLORS.text} sx={{ mb: 0.5 }}>
            • <strong>Khách đổi ý / Chọn nhầm size:</strong> Cửa hàng hoàn trả <strong>100% tiền hàng</strong> vào tài khoản ngân hàng ngay khi kiểm nhận kiện hàng gửi về.
          </Typography>
          <Typography fontSize={12} color={COLORS.text}>
            • <strong>Hàng lỗi do Shop (rách, sai mẫu):</strong> Shop hoàn <strong>100% tiền hàng + bồi hoàn tiền cước gửi hàng</strong> cho quý khách (quý khách giữ lại phiếu thu cước của bưu tá).
          </Typography>
          <Divider sx={{ my: 1, borderColor: '#BAE6FD' }} />
          <Typography fontSize={11} color="#B45309" sx={{ fontStyle: 'italic' }}>
            ⚠️ Lưu ý kiểm định: Shop quay video đồng kiểm khi mở gói hàng hoàn. Sản phẩm phải còn nguyên tem mác, chưa qua sử dụng hoặc giặt tẩy. Nếu khách báo lỗi shop nhưng kiểm tra hàng không có lỗi, shop sẽ không bồi hoàn tiền cước gửi hàng.
          </Typography>
        </Paper>

        {/* STEP 1: SELECT ITEMS */}
        <Typography fontSize={13} fontWeight={700} color={COLORS.text} sx={{ mb: 1 }}>
          1. Chọn sản phẩm bạn muốn hoàn trả:
        </Typography>

        <TableContainer component={Paper} variant="outlined" sx={{ mb: 2.5, borderRadius: 2 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#F8FAFC' }}>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell sx={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>SẢN PHẨM</TableCell>
                <TableCell align="right" sx={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>ĐƠN GIÁ</TableCell>
                <TableCell align="center" sx={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>ĐÃ MUA</TableCell>
                <TableCell align="center" sx={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>CÒN ĐƯỢC TRẢ</TableCell>
                <TableCell align="center" sx={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>SL TRẢ</TableCell>
                <TableCell align="right" sx={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>TẠM TÍNH</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {normalizedItems.map((item) => {
                const itemState = selectedItems[item.orderItemId] || { checked: false, quantity: 1 };
                const canReturn = (item.quantityReturnable || 0) > 0;
                const subTotal = Number(item.unitPrice || 0) * (itemState.quantity || 1);

                return (
                  <TableRow key={item.orderItemId} hover sx={{ opacity: canReturn ? 1 : 0.5 }}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={itemState.checked}
                        disabled={!canReturn || submitting}
                        onChange={(e) => handleItemCheck(item.orderItemId, e.target.checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography fontSize={13} fontWeight={600} color={COLORS.text}>
                        {item.productName}
                      </Typography>
                      <Typography fontSize={11} color={COLORS.muted}>
                        Phân loại: Size {item.size} • Màu {item.color}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
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
                      <Typography fontSize={12} fontWeight={700} color={canReturn ? COLORS.green : COLORS.red}>
                        {item.quantityReturnable}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ width: 80 }}>
                      <TextField
                        size="small"
                        type="number"
                        disabled={!itemState.checked || submitting}
                        value={itemState.quantity}
                        slotProps={{
                          htmlInput: {
                            min: 1,
                            max: item.quantityReturnable,
                            style: { textAlign: 'center', fontSize: 12, padding: '4px 6px' }
                          }
                        }}
                        onChange={(e) =>
                          handleItemQtyChange(item.orderItemId, e.target.value, item.quantityReturnable)
                        }
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontSize={13} fontWeight={600} color={itemState.checked ? COLORS.primary : COLORS.muted}>
                        {itemState.checked ? formatPrice(subTotal) : '—'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        {/* STEP 2: REASON SELECTION */}
        <Typography fontSize={13} fontWeight={700} color={COLORS.text} sx={{ mb: 1 }}>
          2. Lý do hoàn trả:
        </Typography>

        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          <Grid item xs={12} sm={8}>
            <FormControl fullWidth size="small">
              <InputLabel id="reason-label">Chọn lý do</InputLabel>
              <Select
                labelId="reason-label"
                label="Chọn lý do"
                value={selectedReasonKey}
                disabled={submitting}
                onChange={(e) => setSelectedReasonKey(e.target.value)}
              >
                {RETURN_REASONS.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Paper
              elevation={0}
              sx={{
                p: 1,
                bgcolor: activeReason.payer === 'SHOP' ? '#E6F7FF' : '#F6FFED',
                border: `1px solid ${activeReason.payer === 'SHOP' ? '#91D5FF' : '#B7EB8F'}`,
                borderRadius: 1,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center'
              }}
            >
              <Typography fontSize={11} fontWeight={600} color={activeReason.payer === 'SHOP' ? '#0050B3' : '#389E0D'}>
                {activeReason.badgeText}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12}>
            <TextField
              size="small"
              fullWidth
              multiline
              rows={2}
              placeholder="Mô tả cụ thể tình trạng hàng hoặc yêu cầu thêm (tùy chọn)..."
              value={customReasonNote}
              disabled={submitting}
              onChange={(e) => setCustomReasonNote(e.target.value)}
            />
          </Grid>
        </Grid>

        {/* STEP 3: REFUND BANK INFORMATION & DIRECT FILE UPLOAD */}
        <Typography fontSize={13} fontWeight={700} color={COLORS.text} sx={{ mb: 1 }}>
          3. Tài khoản ngân hàng nhận tiền hoàn & Tải lên Bằng chứng:
        </Typography>

        <Paper elevation={0} sx={{ p: 2, mb: 2.5, bgcolor: '#FAFAFA', border: `1px solid ${COLORS.border}`, borderRadius: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel id="bank-select-label">Ngân hàng</InputLabel>
                <Select
                  labelId="bank-select-label"
                  label="Ngân hàng"
                  value={bankCode}
                  disabled={submitting}
                  onChange={(e) => setBankCode(e.target.value)}
                >
                  {VIETNAMESE_BANKS.map((b) => (
                    <MenuItem key={b.code} value={b.code}>
                      {b.shortName} - {b.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                size="small"
                fullWidth
                label="Số tài khoản ngân hàng"
                placeholder="Ví dụ: 0386868686"
                value={bankAccountNumber}
                disabled={submitting}
                onChange={(e) => setBankAccountNumber(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                size="small"
                fullWidth
                label="Tên chủ tài khoản (In hoa)"
                placeholder="NGUYEN VAN A"
                value={bankAccountName}
                disabled={submitting}
                onChange={(e) => setBankAccountName(e.target.value.toUpperCase())}
              />
            </Grid>

            {/* VERIFY PHONE FOR PUBLIC / GUEST USERS IF NOT ALREADY VERIFIED */}
            {isPublic && !orderData?.verified && (
              <Grid item xs={12}>
                <TextField
                  size="small"
                  fullWidth
                  label="Số điện thoại nhận hàng (Bảo mật xác minh)"
                  placeholder="Nhập đầy đủ hoặc 4 số cuối SĐT"
                  value={phoneConfirm}
                  disabled={submitting}
                  onChange={(e) => setPhoneConfirm(e.target.value)}
                  helperText="Dùng để xác thực bạn đúng là người nhận đơn hàng này."
                />
              </Grid>
            )}

            {/* DIRECT FILE UPLOAD ZONE (PHOTOS / VIDEOS) */}
            <Grid item xs={12}>
              <Box sx={{ mt: 1 }}>
                <Typography fontSize={13} fontWeight={600} color={COLORS.text} sx={{ mb: 0.5 }}>
                  {activeReason.requireEvidence
                    ? 'Ảnh / Video minh chứng lỗi sản phẩm & tem mác (* Bắt buộc đối với lỗi do Shop):'
                    : 'Ảnh / Video sản phẩm (Tùy chọn):'}
                </Typography>
                <Typography fontSize={11} color={COLORS.muted} sx={{ mb: 1.5 }}>
                  Quý khách có thể chụp ảnh trực tiếp từ điện thoại hoặc tải ảnh/video từ máy tính (Tối đa 5 tệp, dung lượng &lt; 25MB mỗi tệp).
                </Typography>

                <input
                  type="file"
                  id="return-evidence-file-input"
                  accept="image/*,video/*"
                  multiple
                  hidden
                  onChange={handleFileUpload}
                  disabled={uploading || submitting || evidenceFiles.length >= 5}
                />
                <label htmlFor="return-evidence-file-input" style={{ width: '100%', display: 'block' }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2.5,
                      textAlign: 'center',
                      cursor: uploading || evidenceFiles.length >= 5 ? 'not-allowed' : 'pointer',
                      border: `1.5px dashed ${
                        activeReason.requireEvidence && evidenceFiles.length === 0 ? COLORS.warning : COLORS.border
                      }`,
                      bgcolor: '#F8FAFC',
                      borderRadius: 2,
                      transition: 'all 0.2s',
                      '&:hover': {
                        bgcolor: '#F0F9FF',
                        borderColor: COLORS.primary
                      }
                    }}
                  >
                    {uploading ? (
                      <Stack direction="row" spacing={1} justifyContent="center" alignItems="center">
                        <CircularProgress size={20} />
                        <Typography fontSize={13} color={COLORS.primary} fontWeight={600}>
                          Đang tải ảnh/video lên hệ thống... Vui lòng chờ...
                        </Typography>
                      </Stack>
                    ) : (
                      <Stack spacing={0.5} alignItems="center">
                        <CloudUploadOutlined style={{ fontSize: 32, color: COLORS.primary }} />
                        <Typography fontSize={13} fontWeight={600} color={COLORS.text}>
                          Bấm vào đây để chọn ảnh/video từ máy ({evidenceFiles.length}/5)
                        </Typography>
                        <Typography fontSize={11} color={COLORS.muted}>
                          Hỗ trợ ảnh chụp JPG, PNG, WebP hoặc video ngắn MP4, MOV quay trực tiếp
                        </Typography>
                      </Stack>
                    )}
                  </Paper>
                </label>

                {uploadError && (
                  <Typography fontSize={12} color={COLORS.red} sx={{ mt: 1 }}>
                    {uploadError}
                  </Typography>
                )}

                {/* THUMBNAILS PREVIEW */}
                {evidenceFiles.length > 0 && (
                  <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
                    {evidenceFiles.map((file, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          position: 'relative',
                          width: 85,
                          height: 85,
                          borderRadius: 2,
                          overflow: 'hidden',
                          border: `1px solid ${COLORS.border}`,
                          bgcolor: '#000'
                        }}
                      >
                        {file.resourceType === 'video' ? (
                          <Box
                            sx={{
                              width: '100%',
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              bgcolor: '#1E293B'
                            }}
                          >
                            <VideoCameraOutlined style={{ fontSize: 26, color: '#FFF' }} />
                          </Box>
                        ) : (
                          <img
                            src={file.url}
                            alt="Minh chứng"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        )}
                        <IconButton
                          size="small"
                          onClick={() => handleRemoveFile(idx)}
                          sx={{
                            position: 'absolute',
                            top: 2,
                            right: 2,
                            bgcolor: 'rgba(0,0,0,0.65)',
                            color: '#FFF',
                            p: '3px',
                            '&:hover': { bgcolor: 'rgba(208, 77, 77, 0.95)' }
                          }}
                        >
                          <CloseOutlined style={{ fontSize: 11 }} />
                        </IconButton>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>
            </Grid>
          </Grid>
        </Paper>

        {/* STEP 4: REFUND CALCULATION PREVIEW */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            bgcolor: '#F0F5FF',
            border: '1px solid #ADC6FF',
            borderRadius: 2
          }}
        >
          <Stack spacing={1}>
            <Stack direction="row" justifyContent="space-between">
              <Typography fontSize={13} color={COLORS.muted}>
                Tổng giá trị hàng hoàn lại:
              </Typography>
              <Typography fontSize={13} fontWeight={600} color={COLORS.text}>
                {formatPrice(totalItemRefund)}
              </Typography>
            </Stack>

            <Stack direction="row" justifyContent="space-between">
              <Typography fontSize={13} color={COLORS.muted}>
                Cước phí gửi hàng về kho shop:
              </Typography>
              <Typography fontSize={13} fontWeight={600} color={COLORS.text}>
                Khách tự thanh toán cho bên vận chuyển theo cước thực tế
              </Typography>
            </Stack>

            <Divider />

            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography fontSize={14} fontWeight={700} color={COLORS.text}>
                Tiền hàng Shop chuyển khoản hoàn lại:
              </Typography>
              <Typography fontSize={18} fontWeight={700} color={COLORS.primary}>
                {formatPrice(totalItemRefund)}
              </Typography>
            </Stack>
            <Typography fontSize={11} color={COLORS.muted} sx={{ fontStyle: 'italic' }}>
              * Nếu xác nhận lỗi do Shop, cửa hàng sẽ chuyển khoản hoàn 100% tiền hàng + bồi hoàn tiền cước gửi bưu cục cho quý khách.
            </Typography>
          </Stack>
        </Paper>

        {submitError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {submitError}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={submitting} color="inherit">
          Hủy bỏ
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || totalItemRefund === 0}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlined />}
          sx={{
            bgcolor: COLORS.primary,
            fontWeight: 600,
            textTransform: 'none',
            px: 3
          }}
        >
          {submitting ? 'Đang gửi...' : 'Gửi yêu cầu hoàn hàng'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
