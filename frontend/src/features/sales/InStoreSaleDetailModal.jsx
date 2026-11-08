import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import {
  CloseOutlined,
  CreditCardOutlined,
  DollarOutlined,
  FileTextOutlined,
  PrinterOutlined
} from '@ant-design/icons';
import { api } from '../../services/http';
import { formatLogDate, formatTime } from '../account/format';

const C = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  main: '#8DE9F2',
  mainHover: '#6BDCE7',
  bg: '#F8FAFC',
  cancelHover: '#FFFBE7',
  surface: '#FFFFFF',
  mintBg: '#E8F8F5',
  mintText: '#0F766E',
  mintBorder: '#C2EFE5'
};

const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;

export default function InStoreSaleDetailModal({ open, onClose, orderId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !orderId) {
      setData(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    api(`/sales/in-store/${orderId}`)
      .then((res) => {
        if (isMounted) setData(res);
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Không thể tải chi tiết hóa đơn.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, orderId]);

  const isCash = data?.paymentMethod === 'CASH';

  function handlePrint() {
    window.print();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          p: 1,
          border: `1px solid ${C.border}`,
          boxShadow: '0 8px 30px rgba(32, 45, 66, 0.12)'
        }
      }}
    >
      <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              bgcolor: C.mintBg,
              color: C.mintText,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18
            }}
          >
            <FileTextOutlined />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 17, color: C.text }}>
              Chi tiết hóa đơn
            </Typography>
            <Typography sx={{ fontSize: 12, color: C.muted }}>
              {data ? `Mã ĐH: ${data.orderNumber} ${data.invoiceNumber ? `• Hóa đơn: ${data.invoiceNumber}` : ''}` : 'Đang tải thông tin...'}
            </Typography>
          </Box>
        </Stack>
        <IconButton onClick={onClose} size="small" sx={{ color: C.muted }}>
          <CloseOutlined style={{ fontSize: 14 }} />
        </IconButton>
      </DialogTitle>

      <Divider sx={{ borderColor: C.border }} />

      <DialogContent sx={{ p: 2.5 }}>
        {loading ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <CircularProgress size={36} sx={{ color: C.main }} />
            <Typography sx={{ mt: 1.5, color: C.muted, fontSize: 13 }}>
              Đang tải thông tin chi tiết hóa đơn...
            </Typography>
          </Box>
        ) : error ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography color="error" sx={{ fontSize: 14, fontWeight: 600 }}>
              {error}
            </Typography>
          </Box>
        ) : data ? (
          <Box>
            {/* Thẻ tóm tắt thông tin */}
            <Box
              sx={{
                bgcolor: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 2.5,
                p: 2,
                mb: 3,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
                gap: 2
              }}
            >
              <Box>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase' }}>
                  Thời gian tạo
                </Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text, mt: 0.5 }}>
                  {formatLogDate(data.orderDate)}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: C.muted }}>
                  {formatTime(data.orderDate)}
                </Typography>
              </Box>

              <Box>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase' }}>
                  Thu ngân thực hiện
                </Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text, mt: 0.5 }}>
                  {data.sellerName || '—'}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: C.muted }}>
                  Bán tại quầy THORS
                </Typography>
              </Box>

              <Box>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase' }}>
                  Phương thức thanh toán
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.75,
                      px: 1.25,
                      py: 0.4,
                      borderRadius: 1.5,
                      bgcolor: isCash ? C.mintBg : '#F0F7FF',
                      color: isCash ? C.mintText : '#1D4ED8',
                      border: `1px solid ${isCash ? C.mintBorder : '#D0E1FD'}`,
                      fontSize: 12,
                      fontWeight: 700
                    }}
                  >
                    {isCash ? <DollarOutlined /> : <CreditCardOutlined />}
                    <span>{isCash ? 'Tiền mặt' : 'Chuyển khoản'}</span>
                  </Box>
                </Box>
              </Box>

              <Box>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase' }}>
                  Tổng tiền
                </Typography>
                <Typography sx={{ fontSize: 16, fontWeight: 800, color: C.text, mt: 0.5 }}>
                  {money(data.totalAmount)}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: C.mintText, fontWeight: 600 }}>
                  Đã thanh toán đủ
                </Typography>
              </Box>
            </Box>

            {/* Bảng danh sách sản phẩm */}
            <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.text, mb: 1.5 }}>
              Danh sách sản phẩm ({data.items?.length || 0})
            </Typography>

            <Box
              sx={{
                border: `1px solid ${C.border}`,
                borderRadius: 2,
                overflow: 'hidden',
                mb: 2.5
              }}
            >
              <Table size="small">
                <TableHead sx={{ bgcolor: C.bg }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11.5, color: C.muted, py: 1.25 }}>SẢN PHẨM</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11.5, color: C.muted, py: 1.25 }}>PHÂN LOẠI</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11.5, color: C.muted, py: 1.25 }} align="right">ĐƠN GIÁ</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11.5, color: C.muted, py: 1.25 }} align="center">SỐ LƯỢNG</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11.5, color: C.muted, py: 1.25 }} align="right">THÀNH TIỀN</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.orderItemId} hover sx={{ '&:hover': { bgcolor: '#F9FEFF' } }}>
                      <TableCell sx={{ py: 1.25 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                          {item.productName || 'Sản phẩm'}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1.25 }}>
                        <Stack direction="row" spacing={0.75}>
                          {item.size && (
                            <Box
                              sx={{
                                px: 0.8,
                                py: 0.2,
                                borderRadius: 1,
                                bgcolor: C.bg,
                                border: `1px solid ${C.border}`,
                                fontSize: 11,
                                fontWeight: 600,
                                color: C.text
                              }}
                            >
                              Size: {item.size}
                            </Box>
                          )}
                          {item.color && (
                            <Box
                              sx={{
                                px: 0.8,
                                py: 0.2,
                                borderRadius: 1,
                                bgcolor: C.bg,
                                border: `1px solid ${C.border}`,
                                fontSize: 11,
                                fontWeight: 600,
                                color: C.text
                              }}
                            >
                              Màu: {item.color}
                            </Box>
                          )}
                          {!item.size && !item.color && (
                            <Typography sx={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>
                              Mặc định
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ py: 1.25 }} align="right">
                        <Typography sx={{ fontSize: 12.5, color: C.text }}>
                          {money(item.unitPrice)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1.25 }} align="center">
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                          {item.quantity}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1.25 }} align="right">
                        <Typography sx={{ fontSize: 13, fontWeight: 800, color: C.text }}>
                          {money(item.totalPrice)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>

            {/* Chi tiết tổng tiền */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Box sx={{ width: { xs: '100%', sm: 300 } }}>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography sx={{ fontSize: 12.5, color: C.muted }}>Tạm tính:</Typography>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>
                      {money(data.subtotal)}
                    </Typography>
                  </Stack>
                  {Number(data.discountAmount || 0) > 0 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography sx={{ fontSize: 12.5, color: C.muted }}>Giảm giá:</Typography>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: '#DC2626' }}>
                        -{money(data.discountAmount)}
                      </Typography>
                    </Stack>
                  )}
                  <Divider sx={{ borderColor: C.border, my: 0.5 }} />
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.text }}>
                      Tổng thanh toán:
                    </Typography>
                    <Typography sx={{ fontSize: 16, fontWeight: 900, color: C.text }}>
                      {money(data.totalAmount)}
                    </Typography>
                  </Stack>
                </Stack>
              </Box>
            </Box>
          </Box>
        ) : null}
      </DialogContent>

      <Divider sx={{ borderColor: C.border }} />

      <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
        <Button
          variant="outlined"
          startIcon={<PrinterOutlined />}
          onClick={handlePrint}
          disabled={!data}
          sx={{
            textTransform: 'none',
            borderRadius: 2,
            borderColor: C.border,
            color: C.text,
            fontWeight: 600,
            '&:hover': {
              bgcolor: C.bg,
              borderColor: C.main
            }
          }}
        >
          In lại hóa đơn
        </Button>
        <Button
          variant="contained"
          onClick={onClose}
          sx={{
            textTransform: 'none',
            borderRadius: 2,
            bgcolor: C.main,
            color: C.text,
            fontWeight: 700,
            boxShadow: 'none',
            '&:hover': {
              bgcolor: C.mainHover,
              boxShadow: 'none'
            }
          }}
        >
          Đóng
        </Button>
      </DialogActions>
    </Dialog>
  );
}
