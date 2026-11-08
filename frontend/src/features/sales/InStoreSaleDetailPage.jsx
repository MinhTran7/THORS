import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
import {
  Box,
  Button,
  Card,
  CircularProgress,
  Divider,
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
  CreditCardOutlined,
  DollarOutlined,
  PictureOutlined,
  PrinterOutlined
} from '@ant-design/icons';
import { api } from '../../services/http';
import { useCrumbs } from '../../layouts/crumbs';
import ReceiptDialog from './ReceiptDialog';

const C = {
  text: '#0F172A',
  muted: '#64748B',
  subtle: '#94A3B8',
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

function isCashMethod(method) {
  if (!method) return true;
  const m = String(method).toUpperCase();
  return m === 'CASH' || m.includes('TIEN_MAT') || m.includes('TIỀN MẶT');
}

const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

function formatDetailDate(dateStr) {
  if (!dateStr) return { date: '—', time: '' };
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}

export default function InStoreSaleDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [receiptOpen, setReceiptOpen] = useState(false);

  useCrumbs(['Bán hàng tại quầy', 'Danh sách hóa đơn', 'Chi tiết hóa đơn']);

  const { data, error, isLoading } = useSWR(
    orderId ? `/sales/in-store/${orderId}` : null,
    () => api(`/sales/in-store/${orderId}`)
  );

  // Lấy danh mục sản phẩm từ hệ thống để làm fallback hình ảnh nếu đơn cũ chưa lưu image_url
  const { data: productsData } = useSWR('/products', () => api('/products'), {
    revalidateOnFocus: false
  });
  const productList = productsData?.data || (Array.isArray(productsData) ? productsData : []);

  const isCash = isCashMethod(data?.paymentMethod);
  const { date, time } = formatDetailDate(data?.orderDate);

  const items = data?.items || [];

  const cartItems = items.map((item) => ({
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
      <Box sx={{ maxWidth: 1400, mx: 'auto', py: 10, textAlign: 'center' }}>
        <CircularProgress size={38} sx={{ color: C.cyan }} />
        <Typography sx={{ mt: 2, color: C.muted, fontSize: 13.5 }}>
          Đang tải thông tin chi tiết hóa đơn...
        </Typography>
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box sx={{ maxWidth: 1400, mx: 'auto', py: 8 }}>
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
    <Box sx={{ maxWidth: 1400, mx: 'auto', color: C.text, pb: 6 }}>
      {/* ─── TIÊU ĐỀ & NÚT IN HÓA ĐƠN SANG HẲN BÊN PHẢI ─── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          mb: 3
        }}
      >
        <Typography variant="h3" sx={{ fontWeight: 800, color: C.text, fontSize: { xs: 22, sm: 28 } }}>
          Chi tiết hóa đơn
        </Typography>

        <Button
          variant="contained"
          startIcon={<PrinterOutlined style={{ fontSize: 15 }} />}
          onClick={() => setReceiptOpen(true)}
          sx={{
            textTransform: 'none',
            borderRadius: 2.5,
            bgcolor: C.cyan,
            color: C.text,
            fontWeight: 700,
            fontSize: 13.5,
            px: 2.5,
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
      </Box>

      {/* ─── CARD 1: THÔNG TIN TỔNG QUAN ─── */}
      <Card
        sx={{
          borderRadius: 3.5,
          border: `1px solid ${C.border}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          p: 3,
          mb: 3
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              lg: 'repeat(4, minmax(0, 1fr))'
            },
            gap: 3
          }}
        >
          {/* Mã hóa đơn */}
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: C.muted, mb: 0.75 }}>
              Mã hóa đơn
            </Typography>
            <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>
              {data.invoiceNumber || data.orderNumber}
            </Typography>
          </Box>

          {/* Thời gian */}
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: C.muted, mb: 0.75 }}>
              Thời gian
            </Typography>
            <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>
              {date} · {time}
            </Typography>
          </Box>

          {/* Thu ngân */}
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: C.muted, mb: 0.75 }}>
              Thu ngân
            </Typography>
            <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>
              {data.sellerName || '—'}
            </Typography>
            <Typography sx={{ fontSize: 12, color: C.subtle, mt: 0.25 }}>
              Nhân viên bán hàng
            </Typography>
          </Box>

          {/* Phương thức - Trả về màu cũ chuẩn */}
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: C.muted, mb: 0.75 }}>
              Phương thức
            </Typography>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.5,
                py: 0.5,
                borderRadius: 4,
                bgcolor: isCash ? C.cream : C.cyan,
                color: isCash ? C.creamText : C.cyanText,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.01em'
              }}
            >
              {isCash ? (
                <DollarOutlined style={{ fontSize: 12 }} />
              ) : (
                <CreditCardOutlined style={{ fontSize: 12 }} />
              )}
              <span>{isCash ? 'Tiền mặt' : 'Chuyển khoản'}</span>
            </Box>
          </Box>
        </Box>
      </Card>

      {/* ─── CARD 2: SẢN PHẨM ĐÃ MUA ─── */}
      <Card
        sx={{
          borderRadius: 3.5,
          border: `1px solid ${C.border}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          overflow: 'hidden',
          mb: 3
        }}
      >
        <Box sx={{ p: 3, pb: 2 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: C.text }}>
            Sản phẩm đã mua
          </Typography>
        </Box>

        <Box sx={{ overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ '& th': { borderBottom: `1px solid ${C.borderLight}`, py: 1.5 } }}>
                <TableCell sx={{ color: C.muted, fontSize: 12.5, fontWeight: 500, pl: 3 }}>
                  Sản phẩm
                </TableCell>
                <TableCell sx={{ color: C.muted, fontSize: 12.5, fontWeight: 500 }} align="center">
                  Số lượng
                </TableCell>
                <TableCell sx={{ color: C.muted, fontSize: 12.5, fontWeight: 500 }} align="right">
                  Đơn giá
                </TableCell>
                <TableCell sx={{ color: C.muted, fontSize: 12.5, fontWeight: 500, pr: 3 }} align="right">
                  Thành tiền
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {items.map((item) => {
                const variantParts = [];
                if (item.color) variantParts.push(item.color);
                if (item.size) variantParts.push(`Size ${item.size}`);
                const variantText = variantParts.length > 0 ? variantParts.join(' · ') : 'Mặc định';

                // Tìm hình ảnh sản phẩm từ item hoặc từ danh mục products
                const foundProduct = productList.find(
                  (p) =>
                    p.productName === item.productName ||
                    (item.detailId && p.variants?.some((v) => v.detailId === item.detailId))
                );
                const resolvedImage =
                  item.imageUrl ||
                  foundProduct?.primaryImageUrl ||
                  foundProduct?.imageUrl ||
                  foundProduct?.thumbnailUrl ||
                  foundProduct?.images?.[0]?.imageUrl ||
                  '';

                return (
                  <TableRow
                    key={item.orderItemId}
                    hover
                    sx={{
                      '&:hover': { bgcolor: '#FAFCFE' },
                      '& td': { borderBottom: `1px solid ${C.borderLight}`, py: 2 }
                    }}
                  >
                    {/* Sản phẩm */}
                    <TableCell sx={{ pl: 3 }}>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Box
                          sx={{
                            width: 48,
                            height: 48,
                            borderRadius: 2,
                            bgcolor: '#F1F5F9',
                            overflow: 'hidden',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: `1px solid ${C.borderLight}`
                          }}
                        >
                          {resolvedImage ? (
                            <Box
                              component="img"
                              src={resolvedImage}
                              alt={item.productName}
                              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <PictureOutlined style={{ fontSize: 20, color: '#94A3B8' }} />
                          )}
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                            {item.productName || 'Sản phẩm'}
                          </Typography>
                          <Typography sx={{ fontSize: 12.5, color: C.muted, mt: 0.25 }}>
                            {variantText}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>

                    {/* Số lượng */}
                    <TableCell align="center">
                      <Typography sx={{ fontSize: 14, color: C.text, fontWeight: 500 }}>
                        {item.quantity}
                      </Typography>
                    </TableCell>

                    {/* Đơn giá */}
                    <TableCell align="right">
                      <Typography sx={{ fontSize: 14, color: C.text }}>
                        {money(item.unitPrice)}
                      </Typography>
                    </TableCell>

                    {/* Thành tiền */}
                    <TableCell align="right" sx={{ pr: 3 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                        {money(item.totalPrice)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </Card>

      {/* ─── CARD 3: TỔNG KẾT HÓA ĐƠN ─── */}
      <Card
        sx={{
          borderRadius: 3.5,
          border: `1px solid ${C.border}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          p: 3
        }}
      >
        <Typography sx={{ fontSize: 16, fontWeight: 700, color: C.text, mb: 2.5 }}>
          Tổng kết hóa đơn
        </Typography>

        <Stack spacing={1.5}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: 14, color: C.muted }}>
              Tổng tiền hàng
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: C.text }}>
              {money(data.subtotal)}
            </Typography>
          </Box>

          {Number(data.discountAmount || 0) > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography sx={{ fontSize: 14, color: C.muted }}>
                Giảm giá hóa đơn
              </Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                -{money(data.discountAmount)}
              </Typography>
            </Box>
          )}

          <Divider sx={{ borderColor: C.borderLight, my: 1 }} />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: 16, fontWeight: 700, color: C.text }}>
              Tổng thanh toán
            </Typography>

            <Typography sx={{ fontSize: 24, fontWeight: 900, color: C.text }}>
              {money(data.totalAmount)}
            </Typography>
          </Box>
        </Stack>
      </Card>

      {/* Dialog in hóa đơn nhiệt chuẩn */}
      <ReceiptDialog
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        saleData={saleData}
        cartItems={cartItems}
        customerName={data?.customerName || ''}
        sellerName={data?.sellerName || ''}
        completedAt={data?.orderDate}
        closeText="Đóng"
      />
    </Box>
  );
}
