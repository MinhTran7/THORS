import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { Box, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, Typography } from '@mui/material';
import { Stack } from 'features/account/components/Flex';
import { useCrumbs } from 'layouts/crumbs';
import { useAuth } from 'features/auth/AuthProvider';
import { PAGE_SIZE } from 'features/account/constants';
import { useDebounced } from 'features/account/hooks';
import { formatLogDate, formatTime } from 'features/account/format';
import { brand, cardSx } from 'features/account/tokens';
import { OutlineButton } from 'features/account/components/Brand';
import { StatusPill } from 'features/account/components/Chips';
import {
  bodyCellSx,
  EmptyRow,
  FilterSelect,
  headCellSx,
  PageHeader,
  Pager,
  SearchField,
  Toolbar
} from 'features/account/components/Blocks';
import { ordersApi } from './api';
import { formatVnd, ORDER_STATUS_OPTIONS, orderStatusMeta, paymentMethodLabel, paymentStatusMeta, preparationMeta } from './constants';

// Các tab của khách (kiểu "Đơn mua"): mỗi tab là một hoặc nhiều trạng thái
const CUSTOMER_TABS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'AWAITING_PAYMENT', label: 'Chờ thanh toán' },
  { value: 'PENDING_CONFIRMATION', label: 'Chờ xác nhận' },
  { value: 'AWAITING_PICKUP', label: 'Chờ lấy hàng' },
  { value: 'SHIPPING', label: 'Đang giao' },
  { value: 'DELIVERED', label: 'Đã giao' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'CANCELLED,REJECTED,EXPIRED', label: 'Đã hủy' }
];

const TONE_COLOR = { success: 'success.main', danger: 'error.main', warning: 'warning.dark', neutral: 'text.secondary' };

function CustomerOrderCard({ order, onOpen }) {
  const meta = orderStatusMeta(order.orderStatus);
  const pay = paymentStatusMeta(order.paymentStatus);
  const lines = order.lines ?? [];

  return (
    <Box sx={{ ...cardSx, mb: 1.5, overflow: 'hidden' }}>
      {/* Đầu thẻ: cửa hàng và trạng thái */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, px: 2.5, py: 1.5, borderBottom: `1px solid ${brand.line}` }}>
        <Typography variant="body2" sx={{ fontWeight: 700, color: brand.ink }}>
          THORS Studio
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Typography variant="caption" sx={{ color: brand.muted }}>
            {order.orderNumber}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, letterSpacing: 0.3, color: TONE_COLOR[meta.tone] ?? 'text.secondary' }}>
            {meta.label.toUpperCase()}
          </Typography>
        </Box>
      </Box>

      {/* Các sản phẩm trong đơn: bấm vào để xem chi tiết */}
      <Box onClick={onOpen} sx={{ cursor: 'pointer' }}>
        {lines.map((line, index) => (
          <Box
            key={`${order.id}-${index}`}
            sx={{ display: 'flex', gap: 2, px: 2.5, py: 1.5, borderBottom: index < lines.length - 1 ? `1px solid ${brand.line}` : 'none' }}
          >
            <Box
              component={line.imageUrl ? 'img' : 'div'}
              src={line.imageUrl || undefined}
              alt={line.productName}
              sx={{ width: 84, height: 84, borderRadius: '6px', objectFit: 'cover', bgcolor: brand.neutralBg, border: `1px solid ${brand.line}`, flexShrink: 0 }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="body1"
                sx={{ fontWeight: 500, color: brand.ink, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {line.productName}
              </Typography>
              <Typography variant="body2" sx={{ color: brand.muted, mt: 0.25 }}>
                Phân loại: {[line.size, line.color].filter(Boolean).join(', ') || '—'}
              </Typography>
              <Typography variant="body2" sx={{ color: brand.ink, mt: 0.25 }}>
                x{line.quantity}
              </Typography>
            </Box>
            <Typography variant="body1" sx={{ color: brand.ink, alignSelf: 'center', whiteSpace: 'nowrap' }}>
              {formatVnd(line.unitPrice)}
            </Typography>
          </Box>
        ))}
        {lines.length === 0 && (
          <Typography variant="body2" sx={{ color: brand.muted, px: 2.5, py: 2 }}>
            {order.firstItemName || '—'} · {order.itemCount} sản phẩm
          </Typography>
        )}
      </Box>

      {/* Chân thẻ: thành tiền và nút xem */}
      <Box sx={{ px: 2.5, py: 2, borderTop: `1px solid ${brand.line}` }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 1, mb: 1.5 }}>
          <Typography variant="body2" sx={{ color: brand.muted }}>
            Thành tiền:
          </Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: brand.ink }}>{formatVnd(order.totalAmount)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ color: brand.muted }}>
            {formatLogDate(order.orderDate)} · {formatTime(order.orderDate)} · {paymentMethodLabel(order.paymentMethod)} · {pay.label}
          </Typography>
          <OutlineButton size="small" component={RouterLink} to={`/orders/${order.id}`}>
            Xem chi tiết
          </OutlineButton>
        </Box>
      </Box>
    </Box>
  );
}

export default function OrderListPage() {
  useCrumbs(['Đơn hàng']);
  const { account } = useAuth();
  const navigate = useNavigate();
  const isCustomer = account.role === 'CUSTOMER';

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const search = useDebounced(q.trim());

  const filter = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  const params = { status: status === 'all' ? undefined : status, q: search || undefined, page, size: PAGE_SIZE };
  const list = useSWR(['orders', params], () => ordersApi.list(params), { keepPreviousData: true, revalidateOnFocus: false });

  // Chỉ dành cho chủ shop, để test thông báo: tạo đơn online mẫu rồi tải lại danh sách
  const createSample = async () => {
    setCreating(true);
    setCreateError('');
    try {
      await ordersApi.createSample();
      setPage(0);
      await list.mutate();
    } catch (e) {
      setCreateError(e.message || 'Không tạo được đơn mẫu.');
    } finally {
      setCreating(false);
    }
  };

  const items = list.data?.items ?? [];

  // ---------------------------------------------------------------- Khách hàng (kiểu Shopee)
  if (isCustomer) {
    return (
      <Box>
        <PageHeader title="Đơn hàng của tôi" subtitle="Theo dõi các đơn bạn đã đặt trên website." />

        <Box sx={{ ...cardSx, mb: 1.5 }}>
          <Tabs
            value={status}
            onChange={(_, value) => filter(setStatus)(value)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
          >
            {CUSTOMER_TABS.map((tab) => (
              <Tab key={tab.value} value={tab.value} label={tab.label} sx={{ textTransform: 'none', fontWeight: 500, minWidth: 120 }} />
            ))}
          </Tabs>
        </Box>

        <Box sx={{ mb: 1.5 }}>
          <SearchField placeholder="Tìm theo mã đơn hoặc tên sản phẩm" value={q} onChange={filter(setQ)} />
        </Box>

        {list.error && (
          <Typography color="error" sx={{ mb: 1.5 }}>
            {list.error.message}
          </Typography>
        )}

        {items.map((order) => (
          <CustomerOrderCard key={order.id} order={order} onOpen={() => navigate(`/orders/${order.id}`)} />
        ))}

        {!list.isLoading && items.length === 0 && (
          <Box sx={{ ...cardSx, py: 8, textAlign: 'center' }}>
            <Typography variant="body1" sx={{ color: brand.ink, fontWeight: 600 }}>
              {search || status !== 'all' ? 'Không tìm thấy đơn hàng nào' : 'Chưa có đơn hàng'}
            </Typography>
            <Typography variant="body2" sx={{ color: brand.muted, mt: 0.5 }}>
              {search || status !== 'all' ? 'Thử đổi từ khóa hoặc chọn tab khác.' : 'Các đơn bạn đặt trên website sẽ hiện ở đây.'}
            </Typography>
          </Box>
        )}

        {items.length > 0 && (
          <Box sx={{ ...cardSx, overflow: 'hidden' }}>
            <Pager page={page} totalPages={list.data?.totalPages ?? 0} total={list.data?.total ?? 0} size={PAGE_SIZE} noun="đơn hàng" onPage={setPage} />
          </Box>
        )}
      </Box>
    );
  }

  // ---------------------------------------------------------------- Chủ shop / người xử lý đơn (bảng)
  const columns = ['Đơn hàng', 'Người nhận', 'Sản phẩm', 'Tổng tiền', 'Thanh toán', 'Trạng thái', ''];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 260 }}>
          <PageHeader title="Đơn hàng online" subtitle="Xem và xử lý các đơn khách đặt trên website." />
        </Box>
        <OutlineButton onClick={createSample} disabled={creating}>
          {creating ? 'Đang tạo...' : 'Tạo đơn mẫu (Test)'}
        </OutlineButton>
      </Box>
      {createError && (
        <Typography color="error" sx={{ mb: 1 }}>
          {createError}
        </Typography>
      )}

      <Toolbar>
        <Box sx={{ flex: 1 }}>
          <SearchField placeholder="Tìm theo mã đơn, người nhận hoặc số điện thoại" value={q} onChange={filter(setQ)} />
        </Box>
        <FilterSelect label="Lọc theo trạng thái" value={status} onChange={filter(setStatus)} options={ORDER_STATUS_OPTIONS} minWidth={190} />
      </Toolbar>

      <Box sx={{ ...cardSx, overflow: 'hidden' }}>
        {list.error && (
          <Typography color="error" sx={{ p: 2 }}>
            {list.error.message}
          </Typography>
        )}
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 820 }}>
            <TableHead>
              <TableRow>
                {columns.map((label, index) => (
                  <TableCell key={`${label}-${index}`} sx={headCellSx}>
                    {label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((order) => {
                const statusMeta = orderStatusMeta(order.orderStatus);
                const payMeta = paymentStatusMeta(order.paymentStatus);
                const prep = order.preparationStatus && order.preparationStatus !== 'NOT_STARTED' ? preparationMeta(order.preparationStatus) : null;
                return (
                  <TableRow key={order.id} hover>
                    <TableCell sx={bodyCellSx}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: brand.ink }}>
                        {order.orderNumber}
                      </Typography>
                      <Typography variant="caption" sx={{ color: brand.muted }}>
                        {formatLogDate(order.orderDate)} · {formatTime(order.orderDate)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Typography variant="body2">{order.deliveryName}</Typography>
                      <Typography variant="caption" sx={{ color: brand.muted }}>
                        {order.deliveryPhone || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 220 }}>
                        {order.firstItemName || '—'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: brand.muted }}>
                        {order.itemCount} sản phẩm
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ ...bodyCellSx, whiteSpace: 'nowrap', fontWeight: 600 }}>{formatVnd(order.totalAmount)}</TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Stack spacing={0.5} alignItems="flex-start">
                        <StatusPill tone={payMeta.tone} label={payMeta.label} />
                        <Typography variant="caption" sx={{ color: brand.muted }}>
                          {paymentMethodLabel(order.paymentMethod)}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Stack spacing={0.5} alignItems="flex-start">
                        <StatusPill tone={statusMeta.tone} label={statusMeta.label} />
                        {prep && (
                          <Typography variant="caption" sx={{ color: brand.muted }}>
                            {prep.label}
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ ...bodyCellSx, textAlign: 'right' }}>
                      <OutlineButton size="small" component={RouterLink} to={`/orders/${order.id}`}>
                        Xem
                      </OutlineButton>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!list.isLoading && items.length === 0 && (
                <EmptyRow colSpan={columns.length}>
                  {search || status !== 'all' ? 'Không có đơn hàng nào phù hợp.' : 'Chưa có đơn hàng online nào.'}
                </EmptyRow>
              )}
            </TableBody>
          </Table>
        </Box>
        <Pager page={page} totalPages={list.data?.totalPages ?? 0} total={list.data?.total ?? 0} size={PAGE_SIZE} noun="đơn hàng" onPage={setPage} />
      </Box>
    </Box>
  );
}