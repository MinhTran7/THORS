import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
import {
  Box,
  Button,
  Card,
  CircularProgress,
  Divider,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CreditCardOutlined,
  DollarOutlined,
  FileTextOutlined,
  PrinterOutlined
} from '@ant-design/icons';
import { api } from '../../services/http';
import { useCrumbs } from '../../layouts/crumbs';
import { formatLogDate, formatTime } from '../account/format';
import ReceiptDialog from './ReceiptDialog';

// Bảng màu chuẩn: Cyan #8EECF5 và Cream #FFF7AE kết hợp nền/viền trung tính
const C = {
  text: '#1E293B',
  muted: '#64748B',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  cyan: '#8EECF5',
  cyanHover: '#76E5EF',
  cyanText: '#0E7490',
  cream: '#FFF7AE',
  creamHover: '#FFF294',
  creamText: '#713F12'
};

const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

export default function InStoreSaleDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [receiptOpen, setReceiptOpen] = useState(false);

  useCrumbs(['Bán hàng tại quầy', 'Danh sách hóa đơn', 'Chi tiết hóa đơn']);

  const { data, error, isLoading } = useSWR(
    orderId ? `/sales/in-store/${orderId}` : null,
    () => api(`/sales/in-store/${orderId}`)
  );

  const isCash = data?.paymentMethod === 'CASH';

  const cartItems = (data?.items || []).map((item) => ({
    key: item.orderItemId,
    name: item.productName || 'Sản phẩm',
    size: item.size,
    color: item.color,
    price: Number(item.unitPrice || 0),
    quantity: item.quantity
  }));

  const saleData = data
    ? {
        invoiceNumber: data.invoiceNumber,
        orderNumber: data.orderNumber,
        itemsAmount: data.subtotal,
        discountAmount: data.discountAmount,
        totalAmount: data.totalAmount,
        paymentMethod: data.paymentMethod,
        paymentStatus: data.paymentStatus
      }
    : null;

  if (isLoading) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto', py: 10, textAlign: 'center' }}>
        <CircularProgress size={38} sx={{ color: C.cyan }} />
        <Typography sx={{ mt: 2, color: C.muted, fontSize: 13.5 }}>
          Đang tải thông tin chi tiết hóa đơn...
        </Typography>
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto', py: 8 }}>
        <Card sx={{ p: 4, textAlign: 'center', borderRadius: 3.5, border: `1px solid ${C.border}` }}>
          <Typography color="error" sx={{ fontWeight: 700, fontSize: 15 }}>
            {error?.message || 'Không tìm thấy thông tin hóa đơn.'}
          </Typography>
          <Button
            startIcon={<ArrowLeftOutlined />}
            onClick={() => navigate('/in-store-sales/history')}
            sx={{
              mt: 2,
              textTransform: 'none',
              bgcolor: C.cyan,
              color: C.text,
              fontWeight: 700,
              borderRadius: 2.5,
              px: 2.5,
              '&:hover': { bgcolor: C.cyanHover }
            }}
          >
            Quay lại danh sách
          </Button>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', color: C.text, pb: 6 }}>
      {/* Thanh điều hướng quay lại & Thao tác */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Button
          startIcon={<ArrowLeftOutlined />}
          onClick={() => navigate('/in-store-sales/history')}
          sx={{
            textTransform: 'none',
            color: C.text,
            fontWeight: 700,
            fontSize: 13.5,
            width: 'fit-content',
            px: 2.5,
            py: 1,
            borderRadius: 2.5,
            bgcolor: C.surface,
            border: `1px solid ${C.border}`,
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            '&:hover': {
              bgcolor: C.bg,
              borderColor: C.cyan
            }
          }}
        >
          Quay lại danh sách
        </Button>

        <Button
          variant="contained"
          startIcon={<PrinterOutlined />}
          onClick={() => setReceiptOpen(true)}
          sx={{
            textTransform: 'none',
            borderRadius: 2.5,
            bgcolor: C.cyan,
            color: C.text,
            fontWeight: 700,
            fontSize: 13.5,
            px: 3,
            py: 1,
            boxShadow: 'none',
            '&:hover': {
              bgcolor: C.cyanHover,
              boxShadow: 'none'
            }
          }}
        >
          In hóa đơn
        </Button>
      </Stack>

      {/* ─── THẺ TỔNG QUAN HÓA ĐƠN ─── */}
      <Card
        sx={{
          borderRadius: 3.5,
          border: `1px solid ${C.border}`,
          p: 3,
          mb: 3,
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', md: 'center' }}
          spacing={2}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2.5,
                bgcolor: C.cyan,
                color: C.text,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22
              }}
            >
              <FileTextOutlined />
            </Box>
            <Box>
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                <Typography variant="h5" sx={{ fontWeight: 800, color: C.text }}>
                  {data.invoiceNumber ? `Hóa đơn: ${data.invoiceNumber}` : `Mã đơn: ${data.orderNumber}`}
                </Typography>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 1.5,
                    py: 0.35,
                    borderRadius: 3,
                    bgcolor: C.cyan,
                    color: C.cyanText,
                    fontSize: 12,
                    fontWeight: 700
                  }}
                >
                  <CheckCircleOutlined style={{ fontSize: 13 }} />
                  <span>Đã thanh toán</span>
                </Box>
              </Stack>
              <Typography sx={{ fontSize: 12.5, color: C.muted, mt: 0.5 }}>
                Mã đơn hàng: <strong>{data.orderNumber}</strong>
              </Typography>
            </Box>
          </Stack>

          <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
            <Typography sx={{ fontSize: 12, color: C.muted, textTransform: 'uppercase', fontWeight: 600 }}>
              Tổng thanh toán
            </Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 900, color: C.text, mt: 0.5 }}>
              {money(data.totalAmount)}
            </Typography>
          </Box>
        </Stack>

        <Divider sx={{ my: 2.5, borderColor: C.borderLight }} />

        {/* Grid thông tin chi tiết */}
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} md={3}>
            <Typography sx={{ fontSize: 11.5, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }}>
              Thời gian
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text, mt: 0.5 }}>
              {formatLogDate(data.orderDate)}
            </Typography>
            <Typography sx={{ fontSize: 12, color: C.muted }}>
              {formatTime(data.orderDate)}
            </Typography>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Typography sx={{ fontSize: 11.5, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }}>
              Thu ngân
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text, mt: 0.5 }}>
              {data.sellerName || '—'}
            </Typography>
            <Typography sx={{ fontSize: 12, color: C.muted }}>
              Bán tại quầy THORS
            </Typography>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Typography sx={{ fontSize: 11.5, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }}>
              Phương thức
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1.5,
                  py: 0.4,
                  borderRadius: 3,
                  bgcolor: isCash ? C.cream : C.cyan,
                  color: isCash ? C.creamText : C.cyanText,
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                {isCash ? <DollarOutlined /> : <CreditCardOutlined />}
                <span>{isCash ? 'Tiền mặt' : 'Chuyển khoản'}</span>
              </Box>
            </Box>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Typography sx={{ fontSize: 11.5, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }}>
              Khách hàng
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text, mt: 0.5 }}>
              {data.customerName || 'Khách mua tại quầy'}
            </Typography>
            <Typography sx={{ fontSize: 12, color: C.muted }}>
              Giao dịch tại quầy
            </Typography>
          </Grid>
        </Grid>
      </Card>

      {/* ─── THẺ DANH SÁCH SẢN PHẨM ─── */}
      <Card
        sx={{
          borderRadius: 3.5,
          border: `1px solid ${C.border}`,
          p: 3,
          mb: 3,
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 800, color: C.text, mb: 2 }}>
          Danh sách sản phẩm ({data.items?.length || 0})
        </Typography>

        <Box sx={{ border: `1px solid ${C.border}`, borderRadius: 2.5, overflow: 'hidden' }}>
          <Table>
            <TableHead sx={{ bgcolor: C.bg }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, fontSize: 12, color: C.muted }}>SẢN PHẨM</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: 12, color: C.muted }}>PHÂN LOẠI</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: 12, color: C.muted }} align="right">
                  ĐƠN GIÁ
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: 12, color: C.muted }} align="center">
                  SỐ LƯỢNG
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: 12, color: C.muted }} align="right">
                  THÀNH TIỀN
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {data.items?.map((item) => (
                <TableRow key={item.orderItemId} hover sx={{ '&:hover': { bgcolor: '#FAFCFE' } }}>
                  <TableCell sx={{ py: 1.75 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>
                      {item.productName || 'Sản phẩm'}
                    </Typography>
                  </TableCell>

                  <TableCell sx={{ py: 1.75 }}>
                    <Stack direction="row" spacing={1}>
                      {item.size && (
                        <Box
                          sx={{
                            px: 1,
                            py: 0.25,
                            borderRadius: 1.5,
                            bgcolor: C.bg,
                            border: `1px solid ${C.border}`,
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: C.text
                          }}
                        >
                          Size: {item.size}
                        </Box>
                      )}
                      {item.color && (
                        <Box
                          sx={{
                            px: 1,
                            py: 0.25,
                            borderRadius: 1.5,
                            bgcolor: C.bg,
                            border: `1px solid ${C.border}`,
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: C.text
                          }}
                        >
                          Màu: {item.color}
                        </Box>
                      )}
                      {!item.size && !item.color && (
                        <Typography sx={{ fontSize: 12.5, color: C.muted, fontStyle: 'italic' }}>
                          Mặc định
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>

                  <TableCell sx={{ py: 1.75 }} align="right">
                    <Typography sx={{ fontSize: 13, color: C.text }}>
                      {money(item.unitPrice)}
                    </Typography>
                  </TableCell>

                  <TableCell sx={{ py: 1.75 }} align="center">
                    <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>
                      {item.quantity}
                    </Typography>
                  </TableCell>

                  <TableCell sx={{ py: 1.75 }} align="right">
                    <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>
                      {money(item.totalPrice)}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>

        {/* Tổng tiền & Chi tiết hóa đơn */}
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
          <Box sx={{ width: { xs: '100%', sm: 340 } }}>
            <Stack spacing={1.25}>
              <Stack direction="row" justifyContent="space-between">
                <Typography sx={{ fontSize: 13, color: C.muted }}>Tạm tính:</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                  {money(data.subtotal)}
                </Typography>
              </Stack>

              {Number(data.discountAmount || 0) > 0 && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography sx={{ fontSize: 13, color: C.muted }}>Giảm giá:</Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>
                    -{money(data.discountAmount)}
                  </Typography>
                </Stack>
              )}

              <Divider sx={{ borderColor: C.borderLight, my: 0.5 }} />

              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
                  Tổng thanh toán:
                </Typography>
                <Typography sx={{ fontSize: 18, fontWeight: 900, color: C.text }}>
                  {money(data.totalAmount)}
                </Typography>
              </Stack>
            </Stack>
          </Box>
        </Box>
      </Card>

      {/* Mẫu hóa đơn in nhiệt ReceiptDialog chuẩn của quầy THORS */}
      <ReceiptDialog
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        saleData={saleData}
        cartItems={cartItems}
        customerName={data?.customerName || ''}
        sellerName={data?.sellerName || ''}
        amountReceived={data?.totalAmount || 0}
        changeDue={0}
        completedAt={data?.orderDate}
        closeText="Đóng"
      />
    </Box>
  );
}
