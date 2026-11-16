import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { CloseOutlined } from '@ant-design/icons';
import { Pager } from 'features/account/components/Blocks';
import { api } from 'services/http';
import { money, number, variantLabel, when } from './model';

/** Open orders of other suppliers that make up a variant's "Đang đặt NCC khác" number. */
function OtherOrdersDialog({ row, onClose }) {
  const orders = row.other_orders || [];
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pr: 7 }}>
        Đang đặt ở nhà cung cấp khác · {variantLabel(row)}
        <IconButton aria-label="Đóng" onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }}>
          <CloseOutlined />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Mã phiếu</TableCell>
              <TableCell>Nhà cung cấp</TableCell>
              <TableCell>Ngày đặt</TableCell>
              <TableCell align="right">Đơn giá đặt</TableCell>
              <TableCell align="right">Đặt</TableCell>
              <TableCell align="right">Đã nhập</TableCell>
              <TableCell align="right">Còn chờ nhận</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.order_id}>
                <TableCell>
                  <Link href={`/warehouse/orders?id=${o.order_id}`} target="_blank" rel="noopener" underline="hover">
                    {o.code}
                  </Link>
                </TableCell>
                <TableCell>{o.supplier}</TableCell>
                <TableCell>{when(o.order_date)}</TableCell>
                <TableCell align="right">{money(o.price)}</TableCell>
                <TableCell align="right">{number(o.ordered_quantity)}</TableCell>
                <TableCell align="right">{number(o.fulfilled_quantity)}</TableCell>
                <TableCell align="right">{number(o.remaining_quantity)}</TableCell>
              </TableRow>
            ))}
            {!orders.length && (
              <TableRow>
                <TableCell colSpan={7} sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
                  Chưa có chi tiết phiếu. Khởi động lại backend để tải dữ liệu mới.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
          Chỉ gồm phiếu đặt đã xác nhận còn hàng chưa nhận. Bấm mã phiếu để mở chi tiết ở tab mới.
        </Typography>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Multi-select of product variants for a purchase order. "Từng đặt" = variants on a CONFIRMED or
 * CLOSED order of this supplier (document history, not a formal supply catalogue). A ticked row is a
 * line on the order: onToggle(rows, add) adds or removes it right away, no separate "add" step.
 */
export default function VariantPicker({ supplier, excludeOrderId, categories, onToggle, existingIds, onQuickCreate }) {
  const [scope, setScope] = useState('history');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [othersOf, setOthersOf] = useState(null);
  const autoSwitched = useRef('');

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ supplier, scope, page, size });
    if (search) params.set('q', search);
    if (categoryId) params.set('categoryId', categoryId);
    if (excludeOrderId) params.set('excludeOrderId', excludeOrderId);
    setLoading(true);
    setError('');
    api(`/warehouse/order-variants?${params}`)
      .then((r) => {
        if (!alive) return;
        setResult(r);
        // A supplier without confirmed history starts on the full catalogue.
        if (scope === 'history' && !r.supplier_has_history && autoSwitched.current !== supplier) {
          autoSwitched.current = supplier;
          setScope('all');
        }
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [supplier, scope, search, categoryId, page, size, excludeOrderId]);

  const rows = result?.items || [];
  const allOnPage = rows.length > 0 && rows.every((r) => existingIds.has(r.detail_id));

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} sx={{ justifyContent: 'space-between', gap: 1, mb: 1 }}>
        <Stack direction="row" spacing={1}>
          {[
            ['history', 'Hàng từng đặt từ nhà cung cấp này'],
            ['all', 'Tất cả sản phẩm (mọi nhà cung cấp)']
          ].map(([value, label]) => (
            <Button
              key={value}
              variant={scope === value ? 'contained' : 'outlined'}
              onClick={() => {
                setScope(value);
                setPage(0);
              }}
            >
              {label}
            </Button>
          ))}
        </Stack>
        {onQuickCreate && (
          <Button variant="outlined" onClick={onQuickCreate}>
            Tạo nhanh hàng mới
          </Button>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
        {scope === 'history'
          ? 'Theo lịch sử phiếu đặt đã xác nhận/đã đóng của nhà cung cấp này (không tính nháp, chờ duyệt, hủy). Đây không phải danh mục cung ứng chính thức.'
          : 'Toàn bộ sản phẩm của cửa hàng, không lọc theo nhà cung cấp. Dùng khi đặt hàng lần đầu từ nhà cung cấp này.'}{' '}
        Tồn hiện tại là tổng tồn toàn cửa hàng, không phải tồn theo nhà cung cấp.
      </Typography>
      {scope === 'history' && result && !result.supplier_has_history && (
        <Alert severity="info" sx={{ mb: 1 }}>
          Nhà cung cấp này chưa có phiếu đặt đã xác nhận. Chọn “Tất cả sản phẩm (mọi nhà cung cấp)” hoặc tạo nhanh hàng mới.
        </Alert>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1 }}>
        <TextField
          size="small"
          placeholder="Tìm tên, màu, size, mã biến thể"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ flex: 1 }}
          slotProps={{ htmlInput: { 'aria-label': 'Tìm hàng để đặt' } }}
        />
        <TextField
          size="small"
          select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 180 }}
          slotProps={{ select: { displayEmpty: true, inputProps: { 'aria-label': 'Lọc danh mục' } } }}
        >
          <MenuItem value="">Tất cả danh mục</MenuItem>
          {categories.map((c) => (
            <MenuItem key={c.categoryId} value={c.categoryId}>
              {c.categoryName}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ overflowX: 'auto', opacity: loading ? 0.6 : 1 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={allOnPage}
                  indeterminate={!allOnPage && rows.some((r) => existingIds.has(r.detail_id))}
                  disabled={!rows.length}
                  onChange={() => onToggle(allOnPage ? rows : rows.filter((r) => !existingIds.has(r.detail_id)), !allOnPage)}
                  slotProps={{ input: { 'aria-label': 'Chọn cả trang' } }}
                />
              </TableCell>
              <TableCell>Sản phẩm · màu · size</TableCell>
              <TableCell>Danh mục</TableCell>
              <TableCell align="right">Tồn hiện tại</TableCell>
              <TableCell align="right">Đang đặt từ NCC này</TableCell>
              <TableCell align="right">Giá đặt gần nhất</TableCell>
              <TableCell align="right">Đang đặt NCC khác</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => {
              const onForm = existingIds.has(r.detail_id);
              return (
                <TableRow key={r.detail_id} hover selected={onForm}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={onForm}
                      onChange={() => onToggle([r], !onForm)}
                      slotProps={{ input: { 'aria-label': `Chọn ${variantLabel(r)}` } }}
                    />
                  </TableCell>
                  <TableCell>
                    {variantLabel(r)} {onForm && <Chip size="small" label="Đã có trên phiếu" />}
                    {(r.product_status !== 'ACTIVE' || r.variant_status !== 'ACTIVE') && (
                      <Chip size="small" color="warning" variant="outlined" label="Ngừng kinh doanh" />
                    )}
                  </TableCell>
                  <TableCell>{r.category_name || '—'}</TableCell>
                  <TableCell align="right">{number(r.stock_quantity)}</TableCell>
                  <TableCell align="right">{number(r.on_order_supplier)}</TableCell>
                  {/* Last price only from this supplier's own orders; blank when never ordered from them. */}
                  <TableCell align="right">
                    {r.last_order_price != null && (
                      <Tooltip
                        title={`Phiếu ${r.last_order_id ? `PD${String(r.last_order_id).padStart(5, '0')}` : ''} · ${when(r.last_order_date)}`}
                      >
                        <span>{money(r.last_order_price)}</span>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {r.on_order_other > 0 ? (
                      <Tooltip title={`${(r.other_suppliers || []).join(', ')} · bấm để xem các phiếu`}>
                        <Link component="button" type="button" underline="always" onClick={() => setOthersOf(r)}>
                          {number(r.on_order_other)}
                        </Link>
                      </Tooltip>
                    ) : (
                      0
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {!rows.length && !loading && (
              <TableRow>
                <TableCell colSpan={7} sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
                  Không có hàng phù hợp.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Typography variant="body2" color="text.secondary">
          Tích chọn là hàng được thêm ngay xuống phiếu bên dưới; bỏ tích để xóa khỏi phiếu.
        </Typography>
        <Pager
          page={Math.min(page, Math.max(0, Math.ceil((result?.total || 0) / size) - 1))}
          total={result?.total || 0}
          size={size}
          noun="biến thể"
          onPage={setPage}
          onSize={(value) => {
            setSize(value);
            setPage(0);
          }}
          sizeOptions={[10, 20, 50]}
        />
      </Stack>
      {othersOf && <OtherOrdersDialog row={othersOf} onClose={() => setOthersOf(null)} />}
    </Box>
  );
}
