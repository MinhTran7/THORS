import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { CloseOutlined } from '@ant-design/icons';
import { api } from 'services/http';
import { getCategories } from 'services/categoryService';
import { useWarehouse } from './WarehouseContext';
import { Field } from './components';
import { docCode, money, number, supplierKey, variantLabel } from './model';
import VariantPicker from './VariantPicker';
import QuickCreateDialog from './QuickCreateDialog';
import ExcelImportDialog from './ExcelImportDialog';
import { downloadImportTemplate } from './excelWorkbook';
import { MAX_DOCUMENT_LINES } from './excelImport';

// Quick-created rows carry order_quantity / order_unit_price (purchase price for the order line).
const lineFrom = (v) => ({
  detailId: v.detail_id,
  quantity: v.order_quantity ?? 1,
  unitPrice: v.order_unit_price ?? (v.last_order_price != null ? Number(v.last_order_price) : ''),
  info: v
});

/**
 * Purchase order form: supplier first, then goods (picker, Excel, quick create) in one table.
 * Nothing is written until "Lưu phiếu nháp"; quick-created catalogue items are kept in state so a
 * failed save can be retried without creating them again.
 */
export default function PurchaseOrderForm({ document, onClose }) {
  const { data, run, reload, owner } = useWarehouse();
  // Owner reviewing an order a family member sent: edits keep it waiting for confirmation.
  const reviewing = document?.status === 'PENDING_CONFIRMATION';
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [supplierInput, setSupplierInput] = useState(document?.manufacturer_name || '');
  const [supplier, setSupplier] = useState(document?.manufacturer_name || '');
  const [pendingSupplier, setPendingSupplier] = useState(null);
  const [note, setNote] = useState(document?.note || '');
  const [items, setItems] = useState(
    document
      ? document.items.map((i) => ({ detailId: i.detail_id, quantity: i.quantity, unitPrice: Number(i.unit_price), info: i }))
      : []
  );
  const [selected, setSelected] = useState(new Map());
  const [created, setCreated] = useState([]);
  const [quick, setQuick] = useState(null);
  const [excelOpen, setExcelOpen] = useState(false);
  const [excelBusy, setExcelBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    api('/warehouse/suppliers')
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
    getCategories()
      .then((list) => setCategories(list || []))
      .catch(() => setCategories([]));
  }, []);

  // Variants known to the form: snapshot + quick-created ones not yet in the snapshot.
  const variants = useMemo(() => {
    const known = new Map(data.variants.map((v) => [v.detail_id, v]));
    created.forEach((v) => !known.has(v.detail_id) && known.set(v.detail_id, v));
    return [...known.values()];
  }, [data.variants, created]);
  const variantById = useMemo(() => new Map(variants.map((v) => [v.detail_id, v])), [variants]);
  const products = useMemo(() => {
    const map = new Map();
    variants.forEach((v) => map.set(v.product_id, { product_id: v.product_id, product_name: v.product_name }));
    return [...map.values()].sort((a, b) => a.product_name.localeCompare(b.product_name, 'vi'));
  }, [variants]);
  const existingIds = useMemo(() => new Set(items.map((i) => i.detailId)), [items]);

  // Returns an error message, or '' when the rows were added.
  const addLines = (rows) => {
    const fresh = rows.filter((r) => !existingIds.has(r.detail_id));
    if (items.length + fresh.length > MAX_DOCUMENT_LINES)
      return `Một phiếu tối đa ${MAX_DOCUMENT_LINES} biến thể. Hãy tách thành nhiều phiếu.`;
    setItems((old) => [...old, ...fresh.filter((r) => !old.some((o) => o.detailId === r.detail_id)).map(lineFrom)]);
    return '';
  };

  const chooseSupplier = (value) => {
    const name = String(value || '').trim();
    if (!name || supplierKey(name) === supplierKey(supplier)) return;
    if (items.length) setPendingSupplier(name);
    else {
      setSupplier(name);
      setSelected(new Map());
    }
  };

  const update = (idx, patch) => setItems(items.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  const amount = items.reduce((n, i) => n + Number(i.quantity || 0) * Number(i.unitPrice || 0), 0);

  const save = async () => {
    if (savingRef.current) return; // double-click guard
    setError('');
    if (!supplier.trim()) return setError('Chọn nhà cung cấp trước.');
    if (!items.length) return setError('Phiếu chưa có hàng.');
    const bad = items.find(
      (i) =>
        !/^\d+$/.test(String(i.quantity)) ||
        Number(i.quantity) < 1 ||
        Number(i.quantity) > 1000000 ||
        !/^\d{1,12}$/.test(String(i.unitPrice))
    );
    if (bad) {
      const v = variantById.get(bad.detailId) || bad.info;
      return setError(`Kiểm tra dòng ${v ? variantLabel(v) : `#${bad.detailId}`}: số lượng 1–1.000.000, đơn giá nhập là số nguyên VNĐ.`);
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await run(
        () =>
          api(`/warehouse/documents${document ? `/${document.receipt_id}` : ''}`, {
            method: document ? 'PUT' : 'POST',
            body: {
              type: 'PURCHASE_ORDER',
              sourceId: null,
              manufacturer: supplier.trim(),
              note: note.trim(),
              items: items.map((i) => ({ detailId: i.detailId, sourceItemId: null, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) }))
            }
          }),
        reviewing ? 'Đã lưu thay đổi. Phiếu vẫn chờ xác nhận.' : 'Đã lưu phiếu đặt nháp.'
      );
      onClose();
    } catch (e) {
      setError(
        `${e.message}${created.length ? ' Hàng vừa tạo nhanh vẫn được giữ trên phiếu; bấm lưu lại sẽ không tạo lại sản phẩm.' : ''}`
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const tryClose = () => {
    if (saving) return;
    if (created.length) setLeaving(true);
    else onClose();
  };

  // Called by QuickCreateDialog after the catalogue call succeeded; returns '' or an error message.
  const onQuickCreated = (rows, assign, initial = {}) => {
    const fresh = rows.filter((r) => !r.already_existed);
    // Record created items first so "bỏ phiếu" can warn even if adding to the form fails.
    setCreated((old) => [...old, ...fresh.filter((r) => !old.some((o) => o.detail_id === r.detail_id))]);
    reload().catch(() => {});
    if (assign) {
      const same = (a, b) => supplierKey(a) === supplierKey(b);
      const match = rows.find((r) => same(r.color, initial.color) && same(r.size, initial.size)) || rows[0];
      assign(match?.detail_id);
    } else {
      const problem = addLines(rows);
      if (problem) return problem;
    }
    setQuick(null);
    const label = (list) => list.map((r) => `${r.product_name} · ${r.color} · ${r.size}`).join('; ');
    const existed = rows.filter((r) => r.already_existed);
    setMessage(
      `${fresh.length ? `Đã tạo trong catalog: ${label(fresh)} (tồn 0, chưa bán online).` : ''}${
        existed.length ? ` Đã có sẵn trong catalog, không tạo mới: ${label(existed)}.` : ''
      } ${assign ? 'Đã gán cho dòng Excel.' : 'Đã thêm vào phiếu với số lượng và đơn giá nhập vừa khai báo; phiếu chưa được lưu.'}`.trim()
    );
    return '';
  };

  return (
    <>
      <Dialog open onClose={tryClose} fullWidth maxWidth="xl">
        <DialogTitle>{document ? `Sửa ${docCode(document)}` : 'Tạo phiếu đặt hàng nhập'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Alert severity="info">
              Chọn nhà cung cấp trước, sau đó thêm hàng theo từng màu/size. Lưu hoặc xác nhận phiếu đặt chưa làm tăng tồn kho.
            </Alert>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'flex-end' } }}>
              <Box sx={{ flex: 1 }}>
                <Typography component="label" variant="subtitle2" htmlFor="po-supplier">
                  1. Nhà cung cấp
                </Typography>
                <Autocomplete
                  freeSolo
                  options={suppliers}
                  getOptionLabel={(o) => (typeof o === 'string' ? o : o.name)}
                  renderOption={(props, o) => (
                    <li {...props} key={o.name}>
                      {o.name}
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        {o.confirmed_orders ? `${o.confirmed_orders} phiếu đặt đã xác nhận` : 'chưa có phiếu đã xác nhận'}
                      </Typography>
                    </li>
                  )}
                  inputValue={supplierInput}
                  onInputChange={(_, v) => setSupplierInput(v)}
                  onChange={(_, v) => {
                    const name = typeof v === 'string' ? v : v?.name;
                    if (name) {
                      setSupplierInput(name);
                      chooseSupplier(name);
                    }
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      id="po-supplier"
                      size="small"
                      placeholder="Chọn hoặc nhập tên nhà cung cấp"
                      slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps?.htmlInput, maxLength: 200 } }}
                    />
                  )}
                />
              </Box>
              <Button
                variant="outlined"
                disabled={!supplierInput.trim() || supplierKey(supplierInput) === supplierKey(supplier)}
                onClick={() => chooseSupplier(supplierInput)}
              >
                {supplier ? 'Đổi nhà cung cấp' : 'Dùng nhà cung cấp này'}
              </Button>
            </Stack>
            {supplier && (
              <Typography>
                Nhà cung cấp trên phiếu: <b>{supplier}</b>
                {!suppliers.some((s) => supplierKey(s.name) === supplierKey(supplier)) && ' (mới, chưa có lịch sử)'}
              </Typography>
            )}

            {supplier ? (
              <>
                <Typography variant="subtitle2">2. Chọn hàng</Typography>
                <VariantPicker
                  supplier={supplier}
                  excludeOrderId={document?.receipt_id}
                  categories={categories}
                  selected={selected}
                  existingIds={existingIds}
                  onToggle={(r) =>
                    // Functional update: "select whole page" toggles many rows in one event.
                    setSelected((old) => {
                      const next = new Map(old);
                      if (next.has(r.detail_id)) next.delete(r.detail_id);
                      else next.set(r.detail_id, r);
                      return next;
                    })
                  }
                  onAdd={() => {
                    const problem = addLines([...selected.values()]);
                    if (problem) setError(problem);
                    else setSelected(new Map());
                  }}
                  // Only the owner creates new products; a family member asks in the note.
                  onQuickCreate={owner ? () => setQuick({}) : undefined}
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                  <Button variant="outlined" disabled={saving || excelBusy} onClick={() => setExcelOpen(true)}>
                    Nhập từ Excel
                  </Button>
                  <Button
                    disabled={saving || excelBusy}
                    onClick={async () => {
                      setExcelBusy(true);
                      try {
                        await downloadImportTemplate({ type: 'PURCHASE_ORDER', variants, sourceItems: [], manufacturer: supplier });
                      } catch (e) {
                        setError(e.message || 'Không tạo được file mẫu Excel.');
                      } finally {
                        setExcelBusy(false);
                      }
                    }}
                  >
                    {excelBusy ? 'Đang tạo mẫu…' : 'Tải mẫu Excel'}
                  </Button>
                  <Typography variant="body2" color="text.secondary">
                    Có thể kết hợp Excel với chọn trực tiếp. Xem trước Excel không lưu phiếu và không tạo sản phẩm.
                  </Typography>
                </Stack>
              </>
            ) : (
              <Alert severity="warning">Chọn nhà cung cấp để bắt đầu thêm hàng.</Alert>
            )}

            {message && (
              <Alert severity="success" onClose={() => setMessage('')}>
                {message}
              </Alert>
            )}

            <Typography variant="subtitle2">3. Hàng trên phiếu ({items.length}/{MAX_DOCUMENT_LINES} biến thể)</Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Sản phẩm · màu · size</TableCell>
                    <TableCell align="right">Tồn hiện tại</TableCell>
                    <TableCell align="right">Đang đặt từ NCC này</TableCell>
                    <TableCell sx={{ minWidth: 110 }}>Số lượng đặt</TableCell>
                    <TableCell sx={{ minWidth: 150 }}>Đơn giá nhập</TableCell>
                    <TableCell align="right">Thành tiền</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item, idx) => {
                    const v = variantById.get(item.detailId) || item.info;
                    const label = v ? variantLabel(v) : `Biến thể #${item.detailId}`;
                    const isNew = created.some((c) => c.detail_id === item.detailId);
                    return (
                      <TableRow key={item.detailId}>
                        <TableCell>
                          {label}
                          {isNew && (
                            <Typography variant="caption" color="success.main" component="div">
                              Mới tạo trong catalog
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">{v?.stock_quantity != null ? number(v.stock_quantity) : '—'}</TableCell>
                        <TableCell align="right">{item.info?.on_order_supplier != null ? number(item.info.on_order_supplier) : '—'}</TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            value={item.quantity}
                            onChange={(e) => update(idx, { quantity: e.target.value.replace(/[^\d]/g, '') })}
                            slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': `Số lượng ${label}` } }}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            value={item.unitPrice}
                            placeholder="Nhập giá"
                            onChange={(e) => update(idx, { unitPrice: e.target.value.replace(/[^\d]/g, '') })}
                            slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': `Đơn giá nhập ${label}` } }}
                          />
                        </TableCell>
                        <TableCell align="right">{money(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</TableCell>
                        <TableCell>
                          <IconButton aria-label={`Xóa dòng ${label}`} onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                            <CloseOutlined />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!items.length && (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ py: 3, color: 'text.secondary' }}>
                        {owner
                          ? 'Chưa có hàng. Chọn ở bảng trên, nhập Excel hoặc tạo nhanh hàng mới.'
                          : 'Chưa có hàng. Chọn ở bảng trên hoặc nhập Excel. Hàng chưa có trong hệ thống: ghi vào ghi chú.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
            <Stack direction="row" sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="h5">Tổng số lượng: {number(items.reduce((n, i) => n + Number(i.quantity || 0), 0))}</Typography>
              <Typography variant="h5">Tổng tiền đặt: {money(amount)}</Typography>
            </Stack>
            <Field
              id="po-note"
              label="Ghi chú"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              multiline
              minRows={2}
              slotProps={{ htmlInput: { maxLength: 255 } }}
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={tryClose} disabled={saving}>
            Quay lại
          </Button>
          <Button variant="contained" onClick={save} disabled={saving || !supplier || !items.length}>
            {saving ? 'Đang lưu…' : reviewing ? 'Lưu thay đổi' : 'Lưu phiếu nháp'}
          </Button>
        </DialogActions>
      </Dialog>

      {pendingSupplier && (
        <Dialog open maxWidth="sm" fullWidth onClose={() => setPendingSupplier(null)}>
          <DialogTitle>Đổi nhà cung cấp?</DialogTitle>
          <DialogContent>
            <Typography>
              Phiếu đang có {items.length} dòng hàng chọn cho <b>{supplier}</b>. Đổi sang <b>{pendingSupplier}</b>: đơn giá và lượng
              “đang đặt” đang hiển thị là theo nhà cung cấp cũ. Chọn cách xử lý các dòng hàng.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button
              onClick={() => {
                setSupplierInput(supplier);
                setPendingSupplier(null);
              }}
            >
              Giữ nhà cung cấp cũ
            </Button>
            <Button
              color="error"
              onClick={() => {
                setSupplier(pendingSupplier);
                setItems([]);
                setSelected(new Map());
                setPendingSupplier(null);
              }}
            >
              Đổi và xóa các dòng
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                setSupplier(pendingSupplier);
                setItems(items.map((i) => ({ ...i, info: { ...i.info, on_order_supplier: undefined } })));
                setSelected(new Map());
                setPendingSupplier(null);
              }}
            >
              Đổi và giữ các dòng
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {leaving && (
        <Dialog open maxWidth="sm" fullWidth onClose={() => setLeaving(false)}>
          <DialogTitle>Bỏ phiếu đặt?</DialogTitle>
          <DialogContent>
            <Alert severity="warning">
              Các hàng sau đã được tạo trong catalog và sẽ vẫn còn đó dù bạn bỏ phiếu (tồn 0, chưa bán online):
              <ul>
                {created.map((c) => (
                  <li key={c.detail_id}>
                    #{c.detail_id} · {c.product_name} · {c.color} · {c.size}
                  </li>
                ))}
              </ul>
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setLeaving(false)}>Ở lại phiếu</Button>
            <Button color="warning" variant="contained" onClick={onClose}>
              Bỏ phiếu
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {quick && (
        <QuickCreateDialog
          initial={quick.initial}
          products={products}
          variants={variants}
          withOrderFields={!quick.assign}
          onClose={() => setQuick(null)}
          onCreated={(rows) => onQuickCreated(rows, quick.assign, quick.initial)}
        />
      )}

      {excelOpen && (
        <ExcelImportDialog
          type="PURCHASE_ORDER"
          variants={variants}
          sourceItems={[]}
          currentItems={items}
          manufacturer={supplier}
          onClose={() => setExcelOpen(false)}
          onQuickCreate={owner ? (initial, assign) => setQuick({ initial, assign }) : undefined}
          onApply={(report) => {
            setItems(report.items.map((i) => ({ ...i, info: i.info || variantById.get(i.detailId) })));
            setMessage(`Đã điền ${report.imports.length} biến thể từ Excel. Kiểm tra rồi lưu phiếu nháp.`);
            setExcelOpen(false);
          }}
        />
      )}
    </>
  );
}
