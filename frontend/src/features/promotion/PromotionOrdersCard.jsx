import { useEffect, useState } from 'react';
import { Box, Card, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { getPromotionOrders } from 'services/promotionService';
import { orderStatusMeta } from 'features/order/constants';
import { formatDateTime, money, openInNewTab } from './promotionFormat';
import { C, cardSx, tableSx } from './promotionDetailStyles';
import PromotionStat from './PromotionStat';

// Màu nhãn trạng thái đơn theo tone của features/order/constants
const TONE = {
  success: { bg: '#DCFCE7', color: '#166534' },
  warning: { bg: '#FEF9C3', color: '#854D0E' },
  danger: { bg: '#FEE2E2', color: '#B91C1C' },
  neutral: { bg: '#F1F5F9', color: '#475569' }
};

// Mã giảm giá online: số liệu tổng và các đơn đã dùng mã
export default function PromotionOrdersCard({ promotionId }) {
  const [report, setReport] = useState(null);

  useEffect(() => {
    let mounted = true;
    getPromotionOrders(promotionId)
      .then((res) => mounted && setReport(res))
      .catch(() => mounted && setReport({ orderCount: 0, discountTotal: 0, revenue: 0, remaining: null, orders: [] }));
    return () => {
      mounted = false;
    };
  }, [promotionId]);

  return (
    <Card sx={cardSx}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 16, color: C.text }}>Đơn đã dùng mã</Typography>
        <Typography sx={{ fontSize: 12.5, color: C.muted }}>
          Số liệu tổng không tính đơn đã hủy, bị từ chối hoặc hết hạn thanh toán
        </Typography>
      </Box>

      {report === null ? (
        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={30} sx={{ color: C.cyan }} />
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
            <PromotionStat label="Số đơn đã dùng" value={report.orderCount} />
            <PromotionStat label="Tổng tiền đã giảm" value={money(report.discountTotal)} highlight />
            <PromotionStat label="Doanh thu sau giảm" value={money(report.revenue)} />
            <PromotionStat label="Lượt còn lại" value={report.remaining ?? 'Không giới hạn'} />
          </Box>

          {report.orders.length === 0 ? (
            <Typography sx={{ fontSize: 13.5, color: C.muted, py: 1 }}>Chưa có đơn hàng nào dùng mã này.</Typography>
          ) : (
            <TableContainer sx={{ border: `1px solid ${C.borderLight}`, borderRadius: 2.5, overflow: 'hidden' }}>
              <Table sx={tableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell align="center" sx={{ width: 64, pl: 3 }}>
                      STT
                    </TableCell>
                    <TableCell>Mã đơn</TableCell>
                    <TableCell>Khách hàng</TableCell>
                    <TableCell>Ngày đặt</TableCell>
                    <TableCell align="right">Tiền hàng</TableCell>
                    <TableCell align="right">Được giảm</TableCell>
                    <TableCell align="right">Tổng tiền</TableCell>
                    <TableCell align="center" sx={{ pr: 3 }}>
                      Trạng thái
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.orders.map((order, index) => {
                    const status = orderStatusMeta(order.orderStatus);
                    const tone = TONE[status.tone] || TONE.neutral;
                    return (
                      <TableRow
                        key={order.orderId}
                        hover
                        title="Mở chi tiết đơn ở tab mới"
                        onClick={() => openInNewTab(`/orders/${order.orderId}`)}
                        sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#FAFCFE' } }}
                      >
                        <TableCell align="center" sx={{ pl: 3, color: `${C.muted} !important` }}>
                          {index + 1}
                        </TableCell>
                        <TableCell sx={{ fontWeight: '700 !important' }}>{order.orderNumber}</TableCell>
                        <TableCell>{order.customerName || '—'}</TableCell>
                        <TableCell sx={{ color: `${C.muted} !important` }}>{formatDateTime(order.orderDate)}</TableCell>
                        <TableCell align="right">{money(order.itemsAmount)}</TableCell>
                        <TableCell align="right" sx={{ color: '#B45309 !important', fontWeight: '700 !important' }}>
                          − {money(order.discountAmount)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: '700 !important' }}>
                          {money(order.totalAmount)}
                        </TableCell>
                        <TableCell align="center" sx={{ pr: 3 }}>
                          <Box
                            component="span"
                            sx={{
                              px: 1.25,
                              py: 0.4,
                              borderRadius: 99,
                              fontSize: 12,
                              fontWeight: 700,
                              bgcolor: tone.bg,
                              color: tone.color,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {status.label}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Card>
  );
}
