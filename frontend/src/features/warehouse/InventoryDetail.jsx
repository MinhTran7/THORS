import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import useSWR from 'swr';
import { api } from 'services/http';
import { useWarehouse } from './WarehouseContext';
import { DataTable } from './components';
import { docLink, money, movementLabel, number, orderCode, skuLabel, stockStateColor, stockStateLabel, when } from './model';

function Figure({ label, value, hint }) {
  return (
    <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5">{value}</Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Box>
  );
}

function DocLink({ row }) {
  const to = docLink(row);
  if (!row.doc_code) return <Typography color="text.secondary">—</Typography>;
  return to ? (
    <Button component={Link} to={to} size="small" sx={{ p: 0, minWidth: 0 }}>
      {row.doc_code}
    </Button>
  ) : (
    row.doc_code
  );
}

function Threshold({ variant, onSaved }) {
  const { owner, run, busy } = useWarehouse();
  const [value, setValue] = useState(variant.min_stock_quantity ?? '');
  if (!owner)
    return (
      <Typography>
        Ngưỡng tối thiểu: {variant.min_stock_quantity == null ? 'Chưa thiết lập' : number(variant.min_stock_quantity)}
      </Typography>
    );
  const save = (min) =>
    run(() => api(`/warehouse/inventory/${variant.detail_id}/threshold`, { method: 'PUT', body: { min } }), 'Đã lưu ngưỡng tồn tối thiểu.')
      .then(onSaved)
      .catch(() => {});
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
      <TextField
        size="small"
        type="number"
        label="Ngưỡng tồn tối thiểu"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        slotProps={{ htmlInput: { min: 0, step: 1 } }}
        helperText="So với số có thể bán. Để trống = chưa thiết lập; 0 là một ngưỡng."
      />
      <Button
        variant="contained"
        disabled={busy || value === '' || Number(value) < 0 || !Number.isInteger(Number(value))}
        onClick={() => save(Number(value))}
      >
        Lưu ngưỡng
      </Button>
      <Button disabled={busy || variant.min_stock_quantity == null} onClick={() => (setValue(''), save(null))}>
        Bỏ ngưỡng
      </Button>
    </Stack>
  );
}

function StockCard({ id, kind }) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const qs = new URLSearchParams({ kind, page, size });
  if (type) qs.set('type', type);
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const { data, error, isLoading } = useSWR(`/warehouse/history/${id}?${qs}`, api, { keepPreviousData: true });
  const moves = kind === 'move';
  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        {!moves && (
          <TextField
            select
            size="small"
            label="Nghiệp vụ"
            value={type}
            onChange={(e) => (setType(e.target.value), setPage(0))}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">Tất cả</MenuItem>
            {['RECEIPT', 'ORDER_OUT', 'SUPPLIER_RETURN', 'ADJUSTMENT', 'RESTOCK'].map((t) => (
              <MenuItem key={t} value={t}>
                {movementLabel[t]}
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          size="small"
          type="date"
          label="Từ ngày"
          value={from}
          onChange={(e) => (setFrom(e.target.value), setPage(0))}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          size="small"
          type="date"
          label="Đến ngày"
          value={to}
          onChange={(e) => (setTo(e.target.value), setPage(0))}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {moves
          ? 'Chuyển vị trí không làm thay đổi tổng tồn.'
          : 'Chỉ các nghiệp vụ làm thay đổi tổng tồn. “Tồn sau” tính ngược từ tồn hiện tại theo các biến động đã ghi.'}
      </Typography>
      {data?.ledger_gap ? (
        <Alert severity="info">
          Lịch sử của biến thể này chưa đầy đủ: trước biến động cũ nhất đã ghi còn {number(data.ledger_gap)} sản phẩm không có chứng từ. Hệ
          thống không tạo lịch sử giả để bù.
        </Alert>
      ) : null}
      {error ? (
        <Alert severity="error">{error.message}</Alert>
      ) : isLoading && !data ? (
        <CircularProgress size={24} aria-label="Đang tải lịch sử" />
      ) : (
        <DataTable
          rows={(data?.items || []).map((m) => ({ ...m, _key: m.adjustment_id }))}
          empty="Chưa có biến động trong phạm vi lọc."
          server={{ total: data?.total || 0, page, size, onPage: setPage, onSize: (s) => (setSize(s), setPage(0)) }}
          columns={
            moves
              ? [
                  { key: 'adjusted_at', label: 'Thời gian', render: (m) => when(m.adjusted_at) },
                  { key: 'from', label: 'Từ', render: (m) => m.source_label || 'Chưa xếp vị trí' },
                  { key: 'to', label: 'Đến', render: (m) => m.destination_label || 'Chưa xếp vị trí' },
                  { key: 'movement_quantity', label: 'Số lượng', align: 'right', render: (m) => number(m.movement_quantity) },
                  { key: 'actor_name', label: 'Người thực hiện' }
                ]
              : [
                  { key: 'adjusted_at', label: 'Thời gian', render: (m) => when(m.adjusted_at) },
                  { key: 'movement_type', label: 'Nghiệp vụ', render: (m) => movementLabel[m.movement_type] || m.movement_type },
                  { key: 'doc', label: 'Chứng từ', render: (m) => <DocLink row={m} /> },
                  {
                    key: 'quantity_change',
                    label: 'Tăng / giảm',
                    align: 'right',
                    render: (m) => (
                      <Typography color={m.quantity_change > 0 ? 'success.main' : 'error.main'}>
                        {m.quantity_change > 0 ? '+' : ''}
                        {number(m.quantity_change)}
                      </Typography>
                    )
                  },
                  { key: 'balance_after', label: 'Tồn sau', align: 'right', render: (m) => number(m.balance_after) },
                  { key: 'place', label: 'Vị trí', render: (m) => m.source_label || m.destination_label || 'Chưa xếp' },
                  { key: 'actor_name', label: 'Người thực hiện' },
                  { key: 'reason', label: 'Ghi chú' }
                ]
          }
        />
      )}
    </Stack>
  );
}

/** Variant detail (Tồn kho → Chi tiết): figures, locations, holds/orders, stock card and moves. */
export default function InventoryDetail({ id, onClose, onChanged }) {
  const { owner } = useWarehouse();
  const [tab, setTab] = useState(0);
  const { data: v, error, mutate } = useSWR(`/warehouse/inventory/${id}`, api);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>
        {v ? `${v.product_name} · ${v.color} · ${v.size}` : 'Chi tiết biến thể'}
        {v && (
          <Typography variant="body2" color="text.secondary">
            {skuLabel(v)} · Mã vạch {v.barcode || 'chưa có'} · {v.category_name || 'Chưa có danh mục'}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error">{error.message}</Alert>
        ) : !v ? (
          <CircularProgress aria-label="Đang tải chi tiết" />
        ) : (
          <>
            <Tabs value={tab} onChange={(_, t) => setTab(t)} variant="scrollable" sx={{ mb: 2 }}>
              <Tab label="Tổng quan" />
              <Tab label={`Vị trí (${v.location_rows.filter((l) => l.quantity > 0).length})`} />
              <Tab label={`Đơn giữ & đang đặt (${v.holds.length + v.incoming.length})`} />
              <Tab label="Lịch sử biến động tồn kho" />
              <Tab label="Lịch sử chuyển vị trí" />
            </Tabs>
            {tab === 0 && (
              <Stack spacing={2}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(6,1fr)' }, gap: 1 }}>
                  <Figure label="Tổng tồn" value={number(v.stock_quantity)} />
                  <Figure label="Đã xếp vị trí" value={number(v.assigned_quantity)} />
                  <Figure label="Chưa xếp vị trí" value={number(v.unassigned_quantity)} />
                  <Figure label="Đang giữ cho đơn" value={number(v.held_quantity)} />
                  <Figure label="Có thể bán" value={number(v.available_quantity)} hint="Tổng tồn − đang giữ" />
                  <Figure label="Đang đặt chưa nhận" value={number(v.incoming_quantity)} hint="Không cộng vào tồn" />
                </Box>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Chip color={stockStateColor[v.stock_state]} variant="outlined" label={stockStateLabel[v.stock_state]} />
                  <Typography variant="body2" color="text.secondary">
                    {v.stock_state === 'OUT'
                      ? 'Căn cứ: tổng tồn = 0.'
                      : v.min_stock_quantity == null
                        ? 'Chưa thiết lập ngưỡng — không đánh giá sắp hết.'
                        : `Căn cứ: có thể bán ${number(v.available_quantity)} so với ngưỡng ${number(v.min_stock_quantity)}.`}
                  </Typography>
                </Stack>
                <Threshold variant={v} onSaved={() => (mutate(), onChanged())} />
                {v.unassigned_quantity > 0 && (
                  <Alert severity="warning">Còn {number(v.unassigned_quantity)} sản phẩm chưa xếp vị trí.</Alert>
                )}
                {v.hold_shortage > 0 && <Alert severity="error">Đơn đang giữ nhiều hơn tồn {number(v.hold_shortage)} sản phẩm.</Alert>}
                <Typography variant="body2">
                  {v.days_without_sale == null
                    ? 'Tồn lâu: chưa đủ dữ liệu (chưa có lịch sử nhập/bán).'
                    : v.never_sold
                      ? `Chưa bán lần nào; ${number(v.days_without_sale)} ngày kể từ lần nhập đầu tiên được ghi.`
                      : `${number(v.days_without_sale)} ngày kể từ lần xuất bán gần nhất (${when(v.last_sale_at)}).`}
                </Typography>
                {owner && (
                  <Alert severity={v.stock_value == null ? 'warning' : 'info'} icon={false}>
                    {v.stock_value == null ? (
                      <>Chưa đủ cơ sở giá vốn: {v.cost_note}. Không tính giá trị tồn, không dùng giá bán hay giá nhập gần nhất thay thế.</>
                    ) : (
                      <>
                        Giá vốn bình quân gia quyền liên hoàn {v.unit_cost == null ? '—' : money(v.unit_cost)} · Giá trị tồn{' '}
                        {money(v.stock_value)}
                      </>
                    )}
                  </Alert>
                )}
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  {owner && (
                    <Button variant="contained" component={Link} to={`/warehouse/locations?variant=${v.detail_id}&move=1`}>
                      Xếp / chuyển vị trí
                    </Button>
                  )}
                  <Button variant="outlined" component={Link} to={`/warehouse/locations?variant=${v.detail_id}`}>
                    Xem trên sơ đồ kho
                  </Button>
                  <Button variant="outlined" component={Link} to={`/warehouse/counts?variant=${v.detail_id}&new=1`}>
                    Lập phiếu kiểm kê
                  </Button>
                </Stack>
              </Stack>
            )}
            {tab === 1 && (
              <DataTable
                rows={[
                  ...v.location_rows.map((l) => ({ ...l, _key: l.product_location_id })),
                  { _key: 'unplaced', label: 'Chưa xếp vị trí', quantity: v.unassigned_quantity }
                ]}
                columns={[
                  { key: 'label', label: 'Vị trí' },
                  { key: 'quantity', label: 'Số lượng', align: 'right', render: (l) => number(l.quantity) },
                  { key: 'description', label: 'Mô tả tại vị trí', render: (l) => l.description || '—' },
                  { key: 'updated_at', label: 'Cập nhật', render: (l) => (l.updated_at ? when(l.updated_at) : '—') }
                ]}
              />
            )}
            {tab === 2 && (
              <Stack spacing={2}>
                <Typography variant="subtitle1">Đơn đang giữ hàng</Typography>
                <DataTable
                  rows={v.holds.map((h) => ({ ...h, _key: h.order_item_id }))}
                  empty="Không có đơn nào đang giữ biến thể này."
                  columns={[
                    {
                      key: 'order_number',
                      label: 'Đơn',
                      render: (h) => (
                        <Button
                          component={Link}
                          to={h.order_type === 'Online' ? `/orders/${h.order_id}` : `/in-store-sales/history/${h.order_id}`}
                          size="small"
                        >
                          {h.order_number}
                        </Button>
                      )
                    },
                    { key: 'order_status', label: 'Trạng thái đơn' },
                    { key: 'reserved_quantity', label: 'Đang giữ', align: 'right', render: (h) => number(h.reserved_quantity) },
                    { key: 'since', label: 'Giữ từ', render: (h) => when(h.stock_hold_created_at || h.order_date) }
                  ]}
                />
                {v.unheld_pending.length > 0 && (
                  <Alert severity="info">
                    {v.unheld_pending.length} đơn online đặt trước khi có giữ hàng đang chờ xác nhận (
                    {v.unheld_pending.map((o) => o.order_number).join(', ')}): chưa giữ hàng, khi Owner xác nhận hệ thống vẫn kiểm tra số có
                    thể bán.
                  </Alert>
                )}
                <Typography variant="subtitle1">Đang đặt chưa nhận</Typography>
                <DataTable
                  rows={v.incoming.map((o) => ({ ...o, _key: `${o.order_id}-${o.ordered}` }))}
                  empty="Không có phiếu đặt đã xác nhận nào còn chờ nhận."
                  columns={[
                    {
                      key: 'order_code',
                      label: 'Phiếu đặt',
                      render: (o) => (
                        <Button component={Link} to={`/warehouse/orders?id=${o.order_id}`} size="small">
                          {orderCode(o.order_id)}
                        </Button>
                      )
                    },
                    { key: 'supplier', label: 'Nhà cung cấp' },
                    { key: 'order_date', label: 'Ngày đặt', render: (o) => when(o.order_date) },
                    { key: 'ordered', label: 'Đặt', align: 'right', render: (o) => number(o.ordered) },
                    { key: 'received', label: 'Đã nhận', align: 'right', render: (o) => number(o.received) },
                    { key: 'remaining', label: 'Còn chờ', align: 'right', render: (o) => number(o.remaining) }
                  ]}
                />
              </Stack>
            )}
            {tab === 3 && <StockCard id={id} kind="stock" />}
            {tab === 4 && <StockCard id={id} kind="move" />}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
      </DialogActions>
    </Dialog>
  );
}
