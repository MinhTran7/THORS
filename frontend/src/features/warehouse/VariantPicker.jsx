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

/** Hàng ngừng kinh doanh (sản phẩm hoặc biến thể đang tắt) không đặt được cho tới khi bật lại bên Sản phẩm. */
const stopped = (r) => r.product_status !== 'ACTIVE' || r.variant_status !== 'ACTIVE';

/**
 * Sản phẩm tắt → Danh sách sản phẩm, mở sẵn tab "Đã ẩn" và tìm đúng mã #ID (chỉ còn 1 dòng, có công tắc Trạng thái);
 * chỉ biến thể tắt → trang sửa đúng sản phẩm đó.
 */
const enableLink = (r) =>
  r.product_status !== 'ACTIVE'
    ? `/products?${new URLSearchParams({ tab: 'INACTIVE', q: `#${r.product_id}` })}`
    : `/products/${r.product_id}/edit`;

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
          Bấm mã phiếu để xem chi tiết.
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
  const [reload, setReload] = useState(0);
  const autoSwitched = useRef('');

  // Quay lại tab này sau khi bật sản phẩm bên trang Sản phẩm thì tải lại để chọn được ngay.
  useEffect(() => {
    const refresh = () => document.visibilityState === 'visible' && setReload((n) => n + 1);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

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
  }, [supplier, scope, search, categoryId, page, size, excludeOrderId, reload]);

  const rows = result?.items || [];
  const selectable = rows.filter((r) => !stopped(r));
  const allOnPage = selectable.length > 0 && selectable.every((r) => existingIds.has(r.detail_id));

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
      {scope === 'history' && result && !result.supplier_has_history && (
        <Alert severity="info" sx={{ mb: 1 }}>
          Chưa từng đặt hàng từ nhà cung cấp này. Bấm “Tất cả sản phẩm” để tìm hàng.
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
                  indeterminate={!allOnPage && selectable.some((r) => existingIds.has(r.detail_id))}
                  disabled={!selectable.length}
                  onChange={() => onToggle(allOnPage ? selectable : selectable.filter((r) => !existingIds.has(r.detail_id)), !allOnPage)}
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
              const off = stopped(r);
              return (
                <TableRow key={r.detail_id} hover={!off} selected={onForm} sx={off ? { '& > td': { color: 'text.disabled' } } : undefined}>
                  <TableCell padding="checkbox">
                    {/* Hàng đã lỡ có trên phiếu vẫn bỏ tích được; chưa có thì không tích được. */}
                    <Checkbox
                      checked={onForm}
                      disabled={off && !onForm}
                      onChange={() => onToggle([r], !onForm)}
                      slotProps={{ input: { 'aria-label': `Chọn ${variantLabel(r)}` } }}
                    />
                  </TableCell>
                  <TableCell>
                    {variantLabel(r)} {onForm && <Chip size="small" label="Đã có trên phiếu" />}
                    {off && (
                      <Tooltip
                        title={
                          r.product_status !== 'ACTIVE'
                            ? 'Sản phẩm đang ẩn. Bấm để mở Danh sách sản phẩm, bật Trạng thái sang Hoạt động rồi quay lại đây để chọn.'
                            : 'Biến thể này đang tắt. Bấm để mở trang sửa sản phẩm, bật lại biến thể rồi quay lại đây để chọn.'
                        }
                      >
                        <Chip
                          size="small"
                          color="warning"
                          variant="outlined"
                          label="Ngừng kinh doanh · bật lại"
                          component="a"
                          href={enableLink(r)}
                          target="_blank"
                          rel="noopener"
                          clickable
                        />
                      </Tooltip>
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
        <span />
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
