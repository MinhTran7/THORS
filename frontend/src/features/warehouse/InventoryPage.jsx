import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import useSWR from 'swr';
import MainCard from 'components/MainCard';
import { api } from 'services/http';
import { useWarehouse } from './WarehouseContext';
import { DataTable, Metrics, Title } from './components';
import { locationLabel, number, variantLabel, when } from './model';
function History({ variant, onClose }) {
  const { data, error, isLoading } = useSWR(`/warehouse/history/${variant.detail_id}`, api);
  const names = {
    MOVE: 'Chuyển vị trí',
    RECEIPT: 'Nhập hàng',
    SUPPLIER_RETURN: 'Trả NCC',
    ADJUSTMENT: 'Điều chỉnh',
    RESTOCK: 'Hoàn hàng',
    ORDER_OUT: 'Xuất bán'
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Lịch sử kho · {variantLabel(variant)}</DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error">{error.message}</Alert>
        ) : isLoading ? (
          <Typography>Đang tải…</Typography>
        ) : (
          <>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Tối đa 200 biến động gần nhất. Chuyển vị trí có mức thay đổi tổng tồn bằng 0.
            </Typography>
            <DataTable
              rows={(data || []).map((m) => ({ ...m, _key: m.adjustment_id }))}
              columns={[
                { key: 'adjusted_at', label: 'Thời điểm', render: (m) => when(m.adjusted_at) },
                { key: 'movement_type', label: 'Thao tác', render: (m) => names[m.movement_type] || m.movement_type },
                {
                  key: 'quantity_change',
                  label: 'Thay đổi tổng tồn',
                  align: 'right',
                  render: (m) => `${m.quantity_change > 0 ? '+' : ''}${number(m.quantity_change)}`
                },
                {
                  key: 'movement_quantity',
                  label: 'Số lượng thao tác',
                  align: 'right',
                  render: (m) => number(m.movement_quantity ?? Math.abs(m.quantity_change))
                },
                { key: 'actor_name', label: 'Người thực hiện' },
                { key: 'reason', label: 'Lý do' }
              ]}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
      </DialogActions>
    </Dialog>
  );
}
export default function InventoryPage() {
  const { data } = useWarehouse();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [history, setHistory] = useState(null);
  const variants = data.variants.filter(
    (v) =>
      variantLabel(v).toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')) &&
      (!color || v.color === color) &&
      (!size || v.size === size) &&
      (!filter || (filter === 'unassigned' ? v.unassigned_quantity > 0 : filter === 'out' ? v.stock_quantity === 0 : v.stock_quantity > 0))
  );
  return (
    <>
      <Title title="Tồn kho" subtitle="Tổng tồn bao gồm hàng đã xếp vị trí và hàng chưa xếp vị trí, theo từng màu/size." />
      <Metrics
        items={[
          ['Tổng tồn', data.variants.reduce((n, v) => n + v.stock_quantity, 0), 'Toàn bộ hàng thực tế trong kho'],
          ['Đã xếp vị trí', data.variants.reduce((n, v) => n + Number(v.assigned_quantity), 0), 'Tổng số lượng tại kệ / tầng'],
          ['Chưa xếp vị trí', data.variants.reduce((n, v) => n + Number(v.unassigned_quantity), 0), 'Đã nhập, chờ gán vào kệ / tầng'],
          ['Biến thể sản phẩm', data.variants.length, 'Mỗi tổ hợp màu + size']
        ]}
      />
      {data.variants.some((v) => v.unassigned_quantity < 0) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Có biến thể có tồn vị trí lớn hơn tổng tồn. Cần đối soát dữ liệu trước khi tiếp tục xếp/trả hàng.
        </Alert>
      )}
      <MainCard>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
          <TextField
            size="small"
            placeholder="Tìm tên, màu hoặc size"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1 }}
            slotProps={{ htmlInput: { 'aria-label': 'Tìm tồn kho' } }}
          />
          {[
            ['Màu', color, setColor, [...new Set(data.variants.map((v) => v.color))]],
            ['Size', size, setSize, [...new Set(data.variants.map((v) => v.size))]]
          ].map(([label, value, setter, options]) => (
            <TextField
              key={label}
              select
              size="small"
              value={value}
              onChange={(e) => setter(e.target.value)}
              sx={{ minWidth: 120 }}
              slotProps={{ select: { displayEmpty: true, inputProps: { 'aria-label': label } } }}
            >
              <MenuItem value="">Tất cả {label.toLowerCase()}</MenuItem>
              {options.map((x) => (
                <MenuItem key={x} value={x}>
                  {x}
                </MenuItem>
              ))}
            </TextField>
          ))}
          <TextField
            size="small"
            select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            sx={{ minWidth: 180 }}
            slotProps={{ select: { displayEmpty: true, inputProps: { 'aria-label': 'Lọc tồn kho' } } }}
          >
            <MenuItem value="">Tất cả tồn kho</MenuItem>
            <MenuItem value="unassigned">Còn hàng chưa xếp</MenuItem>
            <MenuItem value="out">Hết hàng</MenuItem>
            <MenuItem value="in">Còn hàng</MenuItem>
          </TextField>
        </Stack>
        <DataTable
          rows={variants}
          columns={[
            {
              key: 'name',
              label: 'Sản phẩm',
              render: (v) => (
                <>
                  <Typography variant="subtitle2">{v.product_name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    #{v.detail_id}
                  </Typography>
                </>
              )
            },
            { key: 'color', label: 'Màu' },
            { key: 'size', label: 'Size' },
            { key: 'stock_quantity', label: 'Tổng tồn', align: 'right', render: (v) => number(v.stock_quantity) },
            { key: 'assigned_quantity', label: 'Đã xếp', align: 'right', render: (v) => number(v.assigned_quantity) },
            {
              key: 'unassigned_quantity',
              label: 'Chưa xếp',
              align: 'right',
              render: (v) => (
                <Typography color={v.unassigned_quantity < 0 ? 'error' : v.unassigned_quantity > 0 ? 'warning.main' : 'text.secondary'}>
                  {number(v.unassigned_quantity)}
                </Typography>
              )
            },
            {
              key: 'locations',
              label: 'Vị trí lưu kho',
              render: (v) => (
                <Button component={Link} to={`/warehouse/locations?variant=${v.detail_id}`} size="small">
                  {data.locations
                    .filter((l) => l.detail_id === v.detail_id && l.quantity > 0)
                    .map((l) => `${locationLabel(data, l.shelf_level_id)} (${number(l.quantity)})`)
                    .join(', ') || 'Xem sơ đồ'}
                </Button>
              )
            },
            {
              key: 'history',
              label: '',
              render: (v) => (
                <Button size="small" onClick={() => setHistory(v)}>
                  Lịch sử
                </Button>
              )
            }
          ]}
        />
      </MainCard>
      {history && <History variant={history} onClose={() => setHistory(null)} />}
    </>
  );
}
