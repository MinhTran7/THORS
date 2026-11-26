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
import { ArrowLeftOutlined, PictureOutlined, PrinterOutlined } from '@ant-design/icons';
import { useCrumbs } from 'layouts/crumbs';
import { getSale } from 'services/salesService';
import PaymentBadge from '../components/PaymentBadge';
import ReceiptDialog from '../components/ReceiptDialog';
import { C, cardSx, primaryButtonSx } from '../theme';
import { money, splitDateTime } from '../utils';

function SummaryRow({ label, value }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography sx={{ fontSize: 14, color: C.muted }}>{label}</Typography>
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: C.text }}>{value}</Typography>
    </Box>
  );
}

export default function InStoreSaleDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [receiptOpen, setReceiptOpen] = useState(false);

  useCrumbs(['Bán hàng tại quầy', 'Danh sách hóa đơn', 'Chi tiết hóa đơn']);

  const { data, error, isLoading } = useSWR(orderId ? ['in-store-sale', orderId] : null, () => getSale(orderId));

  const { date, time } = splitDateTime(data?.orderDate);

  if (isLoading) {
    return (
      <Box sx={{ py: 10, textAlign: 'center' }}>
        <CircularProgress size={38} sx={{ color: C.cyan }} />
        <Typography sx={{ mt: 2, color: C.muted, fontSize: 13.5 }}>Đang tải thông tin chi tiết hóa đơn...</Typography>
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box sx={{ py: 8 }}>
        <Card sx={{ p: 4, textAlign: 'center', borderRadius: 3.5, border: `1px solid ${C.border}` }}>
          <Typography color="error" sx={{ fontWeight: 700, fontSize: 15 }}>
            {error?.message || 'Không tìm thấy thông tin hóa đơn.'}
          </Typography>
          <Button
            startIcon={<ArrowLeftOutlined />}
            onClick={() => navigate('/in-store-sales/history')}
            sx={{ ...primaryButtonSx, mt: 2, px: 2.5 }}
          >
            Quay lại danh sách
          </Button>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ color: C.text, pb: 6 }}>
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
          sx={{ ...primaryButtonSx, fontSize: 13.5, px: 2.5, py: 1 }}
        >
          In hóa đơn
        </Button>
      </Box>

      {/* ─── CARD 1: THÔNG TIN TỔNG QUAN ─── */}
      <Card
        sx={{
          ...cardSx,
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
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: C.muted, mb: 0.75 }}>Mã hóa đơn</Typography>
            <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>{data.invoiceNumber || data.orderNumber}</Typography>
          </Box>

          {/* Thời gian */}
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: C.muted, mb: 0.75 }}>Thời gian</Typography>
            <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>
              {date} · {time}
            </Typography>
          </Box>

          {/* Người bán */}
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: C.muted, mb: 0.75 }}>Người bán</Typography>
            <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>{data.sellerName || '—'}</Typography>
          </Box>

          {/* Phương thức - Trả về màu cũ chuẩn */}
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: C.muted, mb: 0.75 }}>Phương thức</Typography>
            <PaymentBadge method={data.paymentMethod} />
          </Box>
        </Box>
      </Card>

      {/* ─── CARD 2: SẢN PHẨM ĐÃ MUA ─── */}
      <Card
        sx={{
          ...cardSx,
          overflow: 'hidden',
          mb: 3
        }}
      >
        <Box sx={{ p: 3, pb: 2 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: C.text }}>Sản phẩm đã mua</Typography>
        </Box>

        <Box sx={{ overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ '& th': { borderBottom: `1px solid ${C.borderLight}`, py: 1.5 } }}>
                <TableCell sx={{ color: C.muted, fontSize: 12.5, fontWeight: 500, pl: 3 }}>Sản phẩm</TableCell>
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
              {data.items.map((item) => {
                const variantText = [item.color, item.size && `Size ${item.size}`].filter(Boolean).join(' · ') || 'Mặc định';

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
                      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                        <Box
                          sx={{
                            width: 48,
                            height: 48,
                            borderRadius: 2,
                            bgcolor: C.borderLight,
                            overflow: 'hidden',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: `1px solid ${C.borderLight}`
                          }}
                        >
                          {item.imageUrl ? (
                            <Box
                              component="img"
                              src={item.imageUrl}
                              alt={item.productName}
                              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <PictureOutlined style={{ fontSize: 20, color: C.subtle }} />
                          )}
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item.productName || 'Sản phẩm'}</Typography>
                          <Typography sx={{ fontSize: 12.5, color: C.muted, mt: 0.25 }}>{variantText}</Typography>
                        </Box>
                      </Stack>
                    </TableCell>

                    {/* Số lượng */}
                    <TableCell align="center">
                      <Typography sx={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{item.quantity}</Typography>
                    </TableCell>

                    {/* Đơn giá */}
                    <TableCell align="right">
                      {item.originalPrice > item.unitPrice && (
                        <Typography sx={{ fontSize: 12.5, color: C.muted, textDecoration: 'line-through' }}>
                          {money(item.originalPrice)}
                        </Typography>
                      )}
                      <Typography sx={{ fontSize: 14, color: C.text }}>{money(item.unitPrice)}</Typography>
                    </TableCell>

                    {/* Thành tiền */}
                    <TableCell align="right" sx={{ pr: 3 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 600, color: C.text }}>{money(item.totalPrice)}</Typography>
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
          ...cardSx,
          p: 3
        }}
      >
        <Typography sx={{ fontSize: 16, fontWeight: 700, color: C.text, mb: 2.5 }}>Tổng kết hóa đơn</Typography>

        <Stack spacing={1.5}>
          <SummaryRow label="Tổng tiền hàng" value={money(data.subtotal)} />
          {data.manualDiscount > 0 && <SummaryRow label="Giảm giá thêm" value={`-${money(data.manualDiscount)}`} />}

          <Divider sx={{ borderColor: C.borderLight, my: 1 }} />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: 16, fontWeight: 700, color: C.text }}>Tổng thanh toán</Typography>

            <Typography sx={{ fontSize: 24, fontWeight: 900, color: C.text }}>{money(data.totalAmount)}</Typography>
          </Box>
          <Typography sx={{ fontSize: 12.5, color: C.muted, textAlign: 'right' }}>Giá bán đã bao gồm thuế</Typography>
        </Stack>
      </Card>

      {/* Dialog in hóa đơn nhiệt chuẩn */}
      <ReceiptDialog open={receiptOpen} onClose={() => setReceiptOpen(false)} sale={data} closeText="Đóng" />
    </Box>
  );
}
