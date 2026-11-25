import { useEffect, useState } from 'react';
import { Box, Card, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { getPromotionSales } from 'services/promotionService';
import { formatDateTime, money, openInNewTab } from './promotionFormat';
import { C, cardSx, tableSx } from './promotionDetailStyles';
import PromotionStat from './PromotionStat';

const CHANNEL = {
  'In-Store': { label: 'Tại quầy', path: (id) => `/in-store-sales/history/${id}`, bg: '#E0F2FE', color: '#0369A1' },
  Online: { label: 'Online', path: (id) => `/orders/${id}`, bg: '#F1F5F9', color: '#475569' }
};

const FILTERS = [
  ['', 'Tất cả'],
  ['In-Store', 'Tại quầy'],
  ['Online', 'Online']
];

const EMPTY = { orderCount: 0, quantity: 0, discountTotal: 0, revenue: 0, orders: [] };

// Khuyến mãi sản phẩm: tổng kết hiệu quả và các đơn có sản phẩm được giảm (mỗi đơn một dòng), lọc theo kênh bán
export default function PromotionSalesCard({ promotionId }) {
  const [report, setReport] = useState(null);
  const [channel, setChannel] = useState('');

  useEffect(() => {
    let mounted = true;
    getPromotionSales(promotionId, channel)
      .then((res) => mounted && setReport(res))
      .catch(() => mounted && setReport(EMPTY));
    return () => {
      mounted = false;
    };
  }, [promotionId, channel]);

  return (
    <Card sx={cardSx}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: 16, color: C.text }}>Hiệu quả khuyến mãi</Typography>
          <Typography sx={{ fontSize: 12.5, color: C.muted }}>Không tính đơn đã hủy, bị từ chối hoặc hết hạn thanh toán</Typography>
        </Box>
        <Box sx={{ display: 'inline-flex', p: 0.5, borderRadius: 2.5, bgcolor: C.borderLight }}>
          {FILTERS.map(([value, label]) => (
            <Box
              key={value}
              component="button"
              type="button"
              onClick={() => setChannel(value)}
              sx={{
                px: 1.75,
                py: 0.6,
                border: 0,
                borderRadius: 2,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 700,
                bgcolor: channel === value ? '#FFFFFF' : 'transparent',
                color: channel === value ? C.text : C.muted,
                boxShadow: channel === value ? '0 1px 3px rgba(15,23,42,0.1)' : 'none'
              }}
            >
              {label}
            </Box>
          ))}
        </Box>
      </Box>

      {report === null ? (
        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={30} sx={{ color: C.cyan }} />
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
            <PromotionStat label="Số đơn đã áp dụng" value={report.orderCount} />
            <PromotionStat label="Số sản phẩm được giảm" value={report.quantity} />
            <PromotionStat label="Tổng tiền đã giảm" value={money(report.discountTotal)} highlight />
            <PromotionStat label="Doanh thu sau giảm" value={money(report.revenue)} />
          </Box>

          {report.orders.length === 0 ? (
            <Typography sx={{ fontSize: 13.5, color: C.muted, py: 1 }}>Chưa có đơn hàng nào được áp dụng khuyến mãi này.</Typography>
          ) : (
            <TableContainer sx={{ border: `1px solid ${C.borderLight}`, borderRadius: 2.5, overflow: 'hidden' }}>
              <Table sx={tableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell align="center" sx={{ width: 64, pl: 3 }}>
                      STT
                    </TableCell>
                    <TableCell>Mã đơn</TableCell>
                    <TableCell>Ngày mua</TableCell>
                    <TableCell>Sản phẩm</TableCell>
                    <TableCell align="center">SL</TableCell>
                    <TableCell align="right">Tiền gốc</TableCell>
                    <TableCell align="right">Tiền giảm</TableCell>
                    <TableCell align="right" sx={{ pr: 3 }}>
                      Sau giảm
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.orders.map((order, index) => {
                    const channel = CHANNEL[order.orderType] || CHANNEL.Online;
                    return (
                      <TableRow
                        key={order.orderId}
                        hover
                        title="Mở chi tiết đơn ở tab mới"
                        onClick={() => openInNewTab(channel.path(order.orderId))}
                        sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#FAFCFE' } }}
                      >
                        <TableCell align="center" sx={{ pl: 3, color: `${C.muted} !important` }}>
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ fontWeight: 700 }}>{order.orderNumber}</Box>
                          <Box
                            component="span"
                            sx={{
                              display: 'inline-block',
                              mt: 0.5,
                              px: 1,
                              py: 0.2,
                              borderRadius: 99,
                              fontSize: 11.5,
                              fontWeight: 700,
                              bgcolor: channel.bg,
                              color: channel.color
                            }}
                          >
                            {channel.label}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ color: `${C.muted} !important` }}>{formatDateTime(order.orderDate)}</TableCell>
                        <TableCell>
                          {order.items.map((item, index) => (
                            <Box key={index} sx={{ '& + &': { mt: 1 } }}>
                              <Box sx={{ fontWeight: 600 }}>{item.productName}</Box>
                              <Box sx={{ fontSize: 12.5, color: C.muted }}>
                                {[item.size, item.color].filter(Boolean).join(' · ')} · x{item.quantity} · {money(item.unitPrice)}
                              </Box>
                            </Box>
                          ))}
                        </TableCell>
                        <TableCell align="center">{order.quantity}</TableCell>
                        <TableCell align="right">{money(order.originalAmount)}</TableCell>
                        <TableCell align="right" sx={{ color: '#B45309 !important', fontWeight: '700 !important' }}>
                          − {money(order.discountAmount)}
                        </TableCell>
                        <TableCell align="right" sx={{ pr: 3, fontWeight: '700 !important' }}>
                          {money(order.revenue)}
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
