import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import useSWR from 'swr';
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
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

export default function OrderListPage() {
  useCrumbs(['Đơn hàng']);
  const { account } = useAuth();
  const isCustomer = account.role === 'CUSTOMER';

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const search = useDebounced(q.trim());

  const filter = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  const params = { status: status === 'all' ? undefined : status, q: search || undefined, page, size: PAGE_SIZE };
  const list = useSWR(['orders', params], () => ordersApi.list(params), { keepPreviousData: true, revalidateOnFocus: false });

  const items = list.data?.items ?? [];
  const columns = isCustomer
    ? ['Đơn hàng', 'Sản phẩm', 'Tổng tiền', 'Thanh toán', 'Trạng thái', '']
    : ['Đơn hàng', 'Người nhận', 'Sản phẩm', 'Tổng tiền', 'Thanh toán', 'Trạng thái', ''];

  return (
    <Box>
      <PageHeader
        title={isCustomer ? 'Đơn hàng của tôi' : 'Đơn hàng online'}
        subtitle={isCustomer ? 'Theo dõi các đơn bạn đã đặt trên website.' : 'Xem và xử lý các đơn khách đặt trên website.'}
      />

      <Toolbar>
        <Box sx={{ flex: 1 }}>
          <SearchField
            placeholder={isCustomer ? 'Tìm theo mã đơn hàng' : 'Tìm theo mã đơn, người nhận hoặc số điện thoại'}
            value={q}
            onChange={filter(setQ)}
          />
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
                    {!isCustomer && (
                      <TableCell sx={bodyCellSx}>
                        <Typography variant="body2">{order.deliveryName}</Typography>
                        <Typography variant="caption" sx={{ color: brand.muted }}>
                          {order.deliveryPhone || '—'}
                        </Typography>
                      </TableCell>
                    )}
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
                        {prep && !isCustomer && (
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
                  {search || status !== 'all' ? 'Không có đơn hàng nào phù hợp.' : isCustomer ? 'Bạn chưa có đơn hàng nào.' : 'Chưa có đơn hàng online nào.'}
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