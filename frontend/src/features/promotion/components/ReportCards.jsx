import { useCallback, useState } from 'react';
import { Box, Card, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { getPromotionOrders, getPromotionSales } from 'services/promotionService';
import { useReport } from '../hooks';
import { C, cardSx, tableSx } from '../theme';
import { formatDateTime, money } from '../utils';
import OrderDialog, { ChannelPill, StatusPill } from './OrderDialog';

const FILTERS = [
  ['', 'Tất cả'],
  ['In-Store', 'Tại quầy'],
  ['Online', 'Online']
];

const EMPTY_ORDERS = { orderCount: 0, discountTotal: 0, revenue: 0, remaining: null, orders: [] };
const EMPTY_SALES = { orderCount: 0, quantity: 0, discountTotal: 0, revenue: 0, orders: [] };
const NOTE = 'Số liệu tổng không tính đơn đã hủy, bị từ chối hoặc hết hạn thanh toán';

const discountSx = { color: `${C.discount} !important`, fontWeight: '700 !important' };
const boldSx = { fontWeight: '700 !important' };

function Stat({ label, value, highlight }) {
  return (
    <Box sx={{ flex: '1 1 160px', p: 2, borderRadius: 2.5, border: `1px solid ${C.borderLight}`, bgcolor: C.bg }}>
      <Typography sx={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>{label}</Typography>
      <Typography sx={{ mt: 0.5, fontSize: 20, fontWeight: 800, color: highlight ? C.discount : C.text }}>{value}</Typography>
    </Box>
  );
}

// Khung chung: tiêu đề, các ô số liệu, bảng đơn (mỗi đơn một dòng, bấm để mở đơn)
function ReportCard({ promotionId, title, action, report, stats, empty, columns, renderRow }) {
  const [openOrderId, setOpenOrderId] = useState(null);
  return (
    <Card sx={cardSx}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: 16, color: C.text }}>{title}</Typography>
          <Typography sx={{ fontSize: 12.5, color: C.muted }}>{NOTE}</Typography>
        </Box>
        {action}
      </Box>
      {!report ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <CircularProgress size={30} sx={{ color: C.cyan }} />
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
            {stats.map(([label, value, highlight]) => (
              <Stat key={label} label={label} value={value} highlight={highlight} />
            ))}
          </Box>
          {report.orders.length === 0 ? (
            <Typography sx={{ fontSize: 13.5, color: C.muted, py: 1 }}>{empty}</Typography>
          ) : (
            <TableContainer sx={{ border: `1px solid ${C.borderLight}`, borderRadius: 2.5, overflow: 'hidden' }}>
              <Table sx={tableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell align="center" sx={{ width: 64, pl: 3 }}>
                      STT
                    </TableCell>
                    {columns.map(([label, align]) => (
                      <TableCell key={label} align={align}>
                        {label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.orders.map((order, index) => (
                    <TableRow
                      key={order.orderId}
                      hover
                      title="Xem chi tiết đơn"
                      onClick={() => setOpenOrderId(order.orderId)}
                      sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#FAFCFE' } }}
                    >
                      <TableCell align="center" sx={{ pl: 3, color: `${C.muted} !important` }}>
                        {index + 1}
                      </TableCell>
                      {renderRow(order)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
      {openOrderId && <OrderDialog promotionId={promotionId} orderId={openOrderId} onClose={() => setOpenOrderId(null)} />}
    </Card>
  );
}

// Mã giảm giá online: các đơn đã dùng mã
export function OrdersReport({ promotionId }) {
  const report = useReport(useCallback(() => getPromotionOrders(promotionId).catch(() => EMPTY_ORDERS), [promotionId]));
  return (
    <ReportCard
      promotionId={promotionId}
      title="Đơn đã dùng mã"
      report={report}
      stats={
        report && [
          ['Số đơn đã dùng', report.orderCount],
          ['Tổng tiền đã giảm', money(report.discountTotal), true],
          ['Doanh thu sau giảm', money(report.revenue)],
          ['Lượt còn lại', report.remaining ?? 'Không giới hạn']
        ]
      }
      empty="Chưa có đơn hàng nào dùng mã này."
      columns={[
        ['Mã đơn'],
        ['Khách hàng'],
        ['Ngày đặt'],
        ['Tiền hàng', 'right'],
        ['Được giảm', 'right'],
        ['Tổng tiền', 'right'],
        ['Trạng thái', 'center']
      ]}
      renderRow={(order) => (
        <>
          <TableCell sx={boldSx}>{order.orderNumber}</TableCell>
          <TableCell>{order.customerName || '—'}</TableCell>
          <TableCell sx={{ color: `${C.muted} !important` }}>{formatDateTime(order.orderDate)}</TableCell>
          <TableCell align="right">{money(order.itemsAmount)}</TableCell>
          <TableCell align="right" sx={discountSx}>
            − {money(order.discountAmount)}
          </TableCell>
          <TableCell align="right" sx={boldSx}>
            {money(order.totalAmount)}
          </TableCell>
          <TableCell align="center" sx={{ pr: 3 }}>
            <StatusPill status={order.orderStatus} />
          </TableCell>
        </>
      )}
    />
  );
}

function ChannelFilter({ value, onChange }) {
  return (
    <Box sx={{ display: 'inline-flex', p: 0.5, borderRadius: 2.5, bgcolor: C.borderLight }}>
      {FILTERS.map(([key, label]) => (
        <Box
          key={key}
          component="button"
          type="button"
          onClick={() => onChange(key)}
          sx={{
            px: 1.75,
            py: 0.6,
            border: 0,
            borderRadius: 2,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 700,
            bgcolor: value === key ? C.surface : 'transparent',
            color: value === key ? C.text : C.muted,
            boxShadow: value === key ? '0 1px 3px rgba(15,23,42,0.1)' : 'none'
          }}
        >
          {label}
        </Box>
      ))}
    </Box>
  );
}

// Khuyến mãi sản phẩm: các đơn có sản phẩm được giảm, lọc theo kênh bán
export function SalesReport({ promotionId }) {
  const [channel, setChannel] = useState('');
  const report = useReport(useCallback(() => getPromotionSales(promotionId, channel).catch(() => EMPTY_SALES), [promotionId, channel]));
  return (
    <ReportCard
      promotionId={promotionId}
      title="Hiệu quả khuyến mãi"
      action={<ChannelFilter value={channel} onChange={setChannel} />}
      report={report}
      stats={
        report && [
          ['Số đơn đã áp dụng', report.orderCount],
          ['Số sản phẩm được giảm', report.quantity],
          ['Tổng tiền đã giảm', money(report.discountTotal), true],
          ['Doanh thu sau giảm', money(report.revenue)]
        ]
      }
      empty="Chưa có đơn hàng nào được áp dụng khuyến mãi này."
      columns={[
        ['Mã đơn'],
        ['Ngày mua'],
        ['Sản phẩm'],
        ['SL', 'center'],
        ['Tiền gốc', 'right'],
        ['Tiền giảm', 'right'],
        ['Sau giảm', 'right']
      ]}
      renderRow={(order) => (
        <>
          <TableCell>
            <Box sx={{ fontWeight: 700 }}>{order.orderNumber}</Box>
            <ChannelPill type={order.orderType} sx={{ mt: 0.5, px: 1, fontSize: 11.5 }} />
          </TableCell>
          <TableCell sx={{ color: `${C.muted} !important` }}>{formatDateTime(order.orderDate)}</TableCell>
          <TableCell>
            {order.items.map((item, i) => (
              <Box key={i} sx={{ '& + &': { mt: 1 } }}>
                <Box sx={{ fontWeight: 600 }}>{item.productName}</Box>
                <Box sx={{ fontSize: 12.5, color: C.muted }}>
                  {[item.size, item.color].filter(Boolean).join(' · ')} · x{item.quantity} · {money(item.unitPrice)}
                </Box>
              </Box>
            ))}
          </TableCell>
          <TableCell align="center">{order.quantity}</TableCell>
          <TableCell align="right">{money(order.originalAmount)}</TableCell>
          <TableCell align="right" sx={discountSx}>
            − {money(order.discountAmount)}
          </TableCell>
          <TableCell align="right" sx={{ ...boldSx, pr: 3 }}>
            {money(order.revenue)}
          </TableCell>
        </>
      )}
    />
  );
}
