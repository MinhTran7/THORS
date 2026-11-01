import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography } from '@mui/material';
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
  headCellSx,
  PageHeader,
  Pager,
  SearchField,
  Toolbar
} from 'features/account/components/Blocks';
import { ordersApi } from './api';
import { CARRIERS, CUSTOMER_ACTIONS, OWNER_ACTIONS } from './orderActions';
import { formatVnd, orderStatusMeta, paymentMethodLabel, paymentStatusMeta, preparationMeta } from './constants';

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

// Tổng số đơn của một tab (tab "Đã hủy" gồm nhiều trạng thái)
const statusCount = (counts, value) =>
  value === 'all' ? Object.values(counts).reduce((sum, n) => sum + n, 0) : value.split(',').reduce((sum, st) => sum + (counts[st] ?? 0), 0);

function TabLabel({ label, count, alert }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      {label}
      {count > 0 && (
        <Box
          component="span"
          sx={{
            minWidth: 20,
            px: 0.75,
            borderRadius: '10px',
            fontSize: 12,
            lineHeight: '20px',
            fontWeight: 600,
            textAlign: 'center',
            color: alert ? '#fff' : brand.muted,
            bgcolor: alert ? 'error.main' : brand.neutralBg
          }}
        >
          {count}
        </Box>
      )}
    </Box>
  );
}

const TONE_COLOR = { success: 'success.main', danger: 'error.main', warning: 'warning.dark', neutral: 'text.secondary' };

function CustomerOrderCard({ order, onOpen, actions, onAction, busy }) {
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
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <OutlineButton size="small" component={RouterLink} to={`/orders/${order.id}`}>
              Xem chi tiết
            </OutlineButton>
            {actions.map((action) =>
              action.primary ? (
                <Button key={action.to} size="small" variant="contained" disableElevation disabled={busy} onClick={() => onAction(action)}>
                  {action.label}
                </Button>
              ) : (
                <OutlineButton key={action.to} size="small" disabled={busy} onClick={() => onAction(action)}>
                  {action.label}
                </OutlineButton>
              )
            )}
          </Box>
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
  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState('');
  const [dialog, setDialog] = useState(null); // { order, action } đang chờ nhập lý do hoặc chọn hình thức giao
  const [reason, setReason] = useState('');
  const [carrier, setCarrier] = useState('SELF');
  const isOwner = account.role === 'OWNER';
  const search = useDebounced(q.trim());

  const filter = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  const params = { status: status === 'all' ? undefined : status, q: search || undefined, page, size: PAGE_SIZE };
  const list = useSWR(['orders', params], () => ordersApi.list(params), { keepPreviousData: true, revalidateOnFocus: false });
  // Số đơn theo trạng thái cho các tab của chủ shop
  const counts = useSWR(isOwner ? ['order-counts'] : null, () => ordersApi.counts(), { revalidateOnFocus: false });
  const countData = counts.data ?? {};
  const refresh = () => Promise.all([list.mutate(), isOwner ? counts.mutate() : null]);

  // Chỉ dành cho chủ shop, để test thông báo: tạo đơn online mẫu rồi tải lại danh sách
  const createSample = async () => {
    setCreating(true);
    setCreateError('');
    try {
      await ordersApi.createSample();
      setPage(0);
      await refresh();
    } catch (e) {
      setCreateError(e.message || 'Không tạo được đơn mẫu.');
    } finally {
      setCreating(false);
    }
  };

  // Chủ shop xử lý đơn ngay trên danh sách, không cần vào trang chi tiết
  const runAction = async (order, action, why, carrierValue) => {
    setBusyId(order.id);
    setRowError('');
    try {
      await ordersApi.changeStatus(order.id, action.to, why, carrierValue);
      setDialog(null);
      await refresh();
    } catch (e) {
      setRowError(e.message || 'Không đổi được trạng thái đơn.');
    } finally {
      setBusyId(null);
    }
  };

  const startAction = (order, action) => {
    setRowError('');
    if (action.askReason || action.askCarrier) {
      setReason('');
      setCarrier('SELF');
      setDialog({ order, action });
    } else {
      runAction(order, action);
    }
  };

  const items = list.data?.items ?? [];

  // Hộp thoại nhập lý do (từ chối, hủy) hoặc chọn hình thức giao; dùng chung cho khách và chủ shop
  const actionDialog = (
    <Dialog open={Boolean(dialog)} onClose={() => busyId === null && setDialog(null)} fullWidth maxWidth="xs">
      <DialogTitle>{dialog?.action.label}</DialogTitle>
      <DialogContent>
        {dialog && (
          <Typography variant="body2" sx={{ color: brand.muted, mb: 1.5 }}>
            Đơn {dialog.order.orderNumber} · {dialog.order.deliveryName}
            {dialog.action.askCarrier && (
              <>
                <br />
                Địa chỉ giao:{' '}
                <Typography component="span" variant="body2" sx={{ color: brand.ink, fontWeight: 600 }}>
                  {dialog.order.deliveryAddress || '—'}
                </Typography>
              </>
            )}
          </Typography>
        )}
        {dialog?.action.askCarrier ? (
          <TextField
            select
            autoFocus
            fullWidth
            margin="dense"
            label="Hình thức giao hàng"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            helperText={carrier === 'SELF' ? 'Dùng khi địa chỉ gần: cửa hàng tự giao, không cần mã vận đơn.' : 'Dùng khi địa chỉ xa: giao qua đơn vị vận chuyển.'}
          >
            {CARRIERS.map((item) => (
              <MenuItem key={item.value} value={item.value}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            margin="dense"
            label="Lý do (không bắt buộc)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            inputProps={{ maxLength: 255 }}
          />
        )}
        {rowError && (
          <Typography color="error" variant="body2" sx={{ mt: 1 }}>
            {rowError}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button disabled={busyId !== null} onClick={() => setDialog(null)}>
          Quay lại
        </Button>
        <Button
          variant="contained"
          color={dialog?.action.askCarrier ? 'primary' : 'error'}
          disableElevation
          disabled={busyId !== null}
          onClick={() => runAction(dialog.order, dialog.action, reason, carrier)}
        >
          {busyId !== null ? 'Đang xử lý...' : 'Xác nhận'}
        </Button>
      </DialogActions>
    </Dialog>
  );

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

        {rowError && (
          <Typography color="error" sx={{ mb: 1.5 }}>
            {rowError}
          </Typography>
        )}
        {list.error && (
          <Typography color="error" sx={{ mb: 1.5 }}>
            {list.error.message}
          </Typography>
        )}

        {items.map((order) => (
          <CustomerOrderCard
            key={order.id}
            order={order}
            busy={busyId === order.id}
            onOpen={() => navigate(`/orders/${order.id}`)}
            actions={CUSTOMER_ACTIONS[order.orderStatus] ?? []}
            onAction={(action) => startAction(order, action)}
          />
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
        {actionDialog}
      </Box>
    );
  }

  // ---------------------------------------------------------------- Chủ shop / người xử lý đơn (bảng)
  const columns = ['Đơn hàng', 'Người nhận', 'Sản phẩm', 'Tổng tiền', 'Thanh toán', 'Trạng thái', 'Thao tác'];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 260 }}>
          <PageHeader title="Đơn hàng online" subtitle="Xem và xử lý các đơn khách đặt trên website." />
        </Box>
        {isOwner && (
          <OutlineButton onClick={createSample} disabled={creating}>
            {creating ? 'Đang tạo...' : 'Tạo đơn mẫu (Test)'}
          </OutlineButton>
        )}
      </Box>
      {createError && (
        <Typography color="error" sx={{ mb: 1 }}>
          {createError}
        </Typography>
      )}
      {rowError && !dialog && (
        <Typography color="error" sx={{ mb: 1 }}>
          {rowError}
        </Typography>
      )}

      <Box sx={{ ...cardSx, mb: 1.5 }}>
        <Tabs value={status} onChange={(_, value) => filter(setStatus)(value)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
          {CUSTOMER_TABS.map((tab) => (
            <Tab
              key={tab.value}
              value={tab.value}
              label={<TabLabel label={tab.label} count={statusCount(countData, tab.value)} alert={tab.value === 'PENDING_CONFIRMATION'} />}
              sx={{ textTransform: 'none', fontWeight: 500, minWidth: 120 }}
            />
          ))}
        </Tabs>
      </Box>

      <Toolbar>
        <Box sx={{ flex: 1 }}>
          <SearchField placeholder="Tìm theo mã đơn, người nhận hoặc số điện thoại" value={q} onChange={filter(setQ)} />
        </Box>
      </Toolbar>

      <Box sx={{ ...cardSx, overflow: 'hidden' }}>
        {list.error && (
          <Typography color="error" sx={{ p: 2 }}>
            {list.error.message}
          </Typography>
        )}
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 980 }}>
            <TableHead>
              <TableRow>
                {columns.map((label, index) => (
                  <TableCell key={`${label}-${index}`} sx={label === 'Thao tác' ? { ...headCellSx, width: 360 } : headCellSx}>
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
                    <TableCell sx={bodyCellSx}>
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-start" sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                        <OutlineButton size="small" component={RouterLink} to={`/orders/${order.id}`}>
                          Xem
                        </OutlineButton>
                        {(isOwner ? OWNER_ACTIONS[order.orderStatus] ?? [] : []).map((action) =>
                          action.primary ? (
                            <Button key={action.to} size="small" variant="contained" disableElevation disabled={busyId === order.id} onClick={() => startAction(order, action)}>
                              {action.label}
                            </Button>
                          ) : (
                            <OutlineButton key={action.to} size="small" disabled={busyId === order.id} onClick={() => startAction(order, action)}>
                              {action.label}
                            </OutlineButton>
                          )
                        )}
                      </Stack>
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

      {actionDialog}
    </Box>
  );
}