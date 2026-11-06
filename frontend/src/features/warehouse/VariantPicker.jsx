import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { api } from 'services/http';
import { money, number, variantLabel, when } from './model';

/**
 * Multi-select of product variants for a purchase order. "Từng đặt" = variants on a CONFIRMED or
 * CLOSED order of this supplier (document history, not a formal supply catalogue). Selection lives
 * in the parent so it survives search, filter and page changes.
 */
export default function VariantPicker({ supplier, excludeOrderId, categories, selected, onToggle, onAdd, existingIds, onQuickCreate }) {
  const [scope, setScope] = useState('history');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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
  const pickable = rows.filter((r) => !existingIds.has(r.detail_id));
  const allOnPage = pickable.length > 0 && pickable.every((r) => selected.has(r.detail_id));

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} sx={{ justifyContent: 'space-between', gap: 1, mb: 1 }}>
        <Stack direction="row" spacing={1}>
          {[
            ['history', 'Hàng từng đặt từ nhà cung cấp này'],
            ['all', 'Thêm sản phẩm khác']
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
          : 'Toàn bộ catalog. Dùng để đặt hàng lần đầu từ nhà cung cấp này.'}
        {' '}Tồn hiện tại là tổng tồn toàn cửa hàng, không phải tồn theo nhà cung cấp.
      </Typography>
      {scope === 'history' && result && !result.supplier_has_history && (
        <Alert severity="info" sx={{ mb: 1 }}>
          Nhà cung cấp này chưa có phiếu đặt đã xác nhận. Chọn “Thêm sản phẩm khác” hoặc tạo nhanh hàng mới.
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
                  disabled={!pickable.length}
                  onChange={() => pickable.forEach((r) => (allOnPage ? selected.has(r.detail_id) : !selected.has(r.detail_id)) && onToggle(r))}
                  slotProps={{ input: { 'aria-label': 'Chọn cả trang' } }}
                />
              </TableCell>
              <TableCell>Sản phẩm · màu · size</TableCell>
              <TableCell>Danh mục</TableCell>
              <TableCell align="right">Tồn hiện tại</TableCell>
              <TableCell align="right">Đang đặt từ NCC này</TableCell>
              <TableCell align="right">Đang đặt NCC khác</TableCell>
              <TableCell align="right">Giá đặt gần nhất</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => {
              const onForm = existingIds.has(r.detail_id);
              return (
                <TableRow key={r.detail_id} hover selected={selected.has(r.detail_id)}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={onForm || selected.has(r.detail_id)}
                      disabled={onForm}
                      onChange={() => onToggle(r)}
                      slotProps={{ input: { 'aria-label': `Chọn ${variantLabel(r)}` } }}
                    />
                  </TableCell>
                  <TableCell>
                    {variantLabel(r)}{' '}
                    {onForm && <Chip size="small" label="Đã có trên phiếu" />}
                    {(r.product_status !== 'ACTIVE' || r.variant_status !== 'ACTIVE') && (
                      <Chip size="small" color="warning" variant="outlined" label="Ngừng kinh doanh" />
                    )}
                  </TableCell>
                  <TableCell>{r.category_name || '—'}</TableCell>
                  <TableCell align="right">{number(r.stock_quantity)}</TableCell>
                  <TableCell align="right">{number(r.on_order_supplier)}</TableCell>
                  <TableCell align="right">
                    {r.on_order_other > 0 ? (
                      <Tooltip title={(r.other_suppliers || []).join(', ')}>
                        <span>{number(r.on_order_other)}</span>
                      </Tooltip>
                    ) : (
                      0
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {r.last_order_price != null ? (
                      <Tooltip title={`Phiếu ${r.last_order_id ? `PD${String(r.last_order_id).padStart(5, '0')}` : ''} · ${when(r.last_order_date)}`}>
                        <span>{money(r.last_order_price)}</span>
                      </Tooltip>
                    ) : (
                      '—'
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
        <Button variant="contained" disabled={!selected.size} onClick={onAdd}>
          Thêm {selected.size} biến thể đã chọn vào phiếu
        </Button>
        <TablePagination
          component="div"
          count={result?.total || 0}
          page={Math.min(page, Math.max(0, Math.ceil((result?.total || 0) / size) - 1))}
          rowsPerPage={size}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => {
            setSize(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 20, 50]}
          labelRowsPerPage="Số dòng"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
        />
      </Stack>
    </Box>
  );
}
