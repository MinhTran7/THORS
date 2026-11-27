import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import useSWR from 'swr';
import MainCard from 'components/MainCard';
import CategoryTreeSelect from 'components/CategoryTreeSelect';
import { api } from 'services/http';
import { useWarehouse } from './WarehouseContext';
import { FilterResetButton } from 'features/account/components/Blocks';
import { ActionDialog, DataTable, Metrics, Title } from './components';
import { money, number, stockStateColor, stockStateLabel, tierName, variantLabel, warehouseCategories } from './model';
import { exportSheet } from './excelWorkbook';
import BarcodePrintDialog from './BarcodePrintDialog';
import BarcodeScannerDialog from './BarcodeScannerDialog';
import useBarcodeScanner from './useBarcodeScanner';
import InventoryDetail from './InventoryDetail';

// Every filter, the page and the opened variant live in the URL, so opening a detail (or another
// page) and coming back keeps the list exactly where it was.
const FILTERS = ['q', 'color', 'size', 'categoryId', 'shelfId', 'state', 'slowDays', 'sort', 'page', 'pageSize'];

const stateOptions = [
  ['', 'Tất cả trạng thái'],
  ['in', 'Còn hàng'],
  ['out', 'Hết hàng'],
  ['low', 'Sắp hết (chạm ngưỡng)'],
  ['unassigned', 'Có hàng chưa xếp'],
  ['noThreshold', 'Chưa thiết lập ngưỡng'],
  ['slow', 'Không bán trong N ngày']
];

function exportColumns(owner) {
  return [
    { header: 'Mã SP', key: 'product_code', width: 10 },
    { header: 'Mã biến thể', key: 'detail_id', width: 11 },
    { header: 'Sản phẩm', key: 'product_name', width: 32 },
    { header: 'Danh mục', key: 'category_name', width: 16 },
    { header: 'Màu', key: 'color', width: 14 },
    { header: 'Size', key: 'size', width: 8 },
    { header: 'Mã vạch', key: 'barcode', width: 14 },
    { header: 'Tổng tồn', key: 'stock_quantity', width: 10 },
    { header: 'Đã xếp', key: 'assigned_quantity', width: 9 },
    { header: 'Chưa xếp', key: 'unassigned_quantity', width: 9 },
    { header: 'Đang giữ cho đơn', key: 'held_quantity', width: 12 },
    { header: 'Có thể bán', key: 'available_quantity', width: 11 },
    { header: 'Đang đặt chưa nhận', key: 'incoming_quantity', width: 13 },
    { header: 'Ngưỡng tối thiểu', key: 'threshold', width: 13 },
    { header: 'Trạng thái', key: 'state', width: 12 },
    { header: 'Vị trí', key: 'places', width: 26 },
    ...(owner
      ? [
          { header: 'Giá vốn BQ liên hoàn', key: 'unit_cost', width: 16 },
          { header: 'Giá trị tồn', key: 'stock_value', width: 14 },
          { header: 'SL chưa rõ giá nhập', key: 'unvalued_quantity', width: 16 },
          { header: 'Lý do', key: 'cost_note', width: 40 }
        ]
      : [])
  ];
}

export default function InventoryPage() {
  const { owner, data: snapshot, reload: reloadWarehouse } = useWarehouse();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [selected, setSelected] = useState({});
  // Variants open in the print dialog: the selected rows, or the one row whose "In tem" was clicked.
  const [printing, setPrinting] = useState(null);
  const [deleting, setDeleting] = useState(null); // variant row waiting for "Xóa" confirmation
  const [scanning, setScanning] = useState(false);
  // A code read by a USB/Bluetooth scanner anywhere on this page: opens the lookup with that code.
  const [scanRequest, setScanRequest] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const value = (key) => params.get(key) || '';
  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === '' || v == null ? next.delete(k) : next.set(k, String(v))));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim() !== (params.get('q') || '')) update({ q: query.trim() });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const qs = new URLSearchParams();
  FILTERS.forEach((k) => value(k) && qs.set(k, value(k)));
  // Tầng 1: mỗi sản phẩm một dòng (server gom và phân trang theo sản phẩm); tầng 2: bấm để xổ các biến thể;
  // tầng 3: bấm một biến thể để mở chi tiết.
  const { data, error, isLoading, mutate } = useSWR(`/warehouse/inventory?${qs}&group=true`, api, { keepPreviousData: true });
  const products = data?.items || [];
  const rows = products.flatMap((p) => p.variants || []);
  const m = data?.metrics || {};
  const state = value('state');
  const slowDays = Number(value('slowDays')) || 30;
  const filtered = FILTERS.some((k) => !['page', 'pageSize', 'sort'].includes(k) && value(k));
  // Đang lọc/tìm thì mở sẵn các sản phẩm để thấy ngay biến thể khớp; flip = các sản phẩm người dùng bấm đổi trạng thái.
  const [flip, setFlip] = useState(() => new Set());
  const filterKey = FILTERS.filter((k) => !['page', 'pageSize', 'sort'].includes(k))
    .map((k) => value(k))
    .join('|');
  useEffect(() => setFlip(new Set()), [filterKey]);
  const isOpen = (id) => filtered !== flip.has(id);
  const toggleOpen = (id) =>
    setFlip((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // Sản phẩm chỉ có 1 biến thể (khớp bộ lọc): hiện thẳng biến thể đó trên một dòng, không xổ xuống, bấm là mở chi tiết.
  const lines = products.flatMap((p) =>
    p.variants.length === 1
      ? [{ ...p.variants[0], _kind: 'single', _key: `p${p.product_id}` }]
      : [
          { ...p, _kind: 'product', _key: `p${p.product_id}`, _expanded: isOpen(p.product_id) },
          ...(isOpen(p.product_id)
            ? p.variants.map((v) => ({ ...v, _kind: 'variant', _key: `v${v.detail_id}`, _sx: { bgcolor: 'action.hover' }, _noIndex: true }))
            : [])
        ]
  );
  const setChecked = (variants, checked) =>
    setSelected((prev) => {
      const next = { ...prev };
      variants.forEach((r) => (checked ? (next[r.detail_id] = r) : delete next[r.detail_id]));
      return next;
    });
  const detail = Number(value('detail')) || null;
  useBarcodeScanner((code) => {
    setScanRequest({ code, n: Date.now() });
    setScanning(true);
  }, !printing && !detail);
  const selectedRows = Object.values(selected);
  const toggleState = (s) => update({ state: state === s ? '' : s });
  const shelves = snapshot.tiers
    .map((t) => ({
      id: t.shelf_level_id,
      label: tierName(snapshot.racks.find((r) => r.rack_id === t.rack_id), t)
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'));

  const exportExcel = async () => {
    setExportError('');
    setExporting(true);
    try {
      const all = new URLSearchParams(qs);
      all.delete('page');
      all.set('all', 'true');
      const result = await api(`/warehouse/inventory?${all}`);
      await exportSheet({
        fileName: `THORS_Ton_Kho_${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheetName: 'TonKho',
        columns: exportColumns(owner),
        rows: result.items.map((r) => ({
          ...r,
          barcode: r.barcode || '',
          threshold: r.min_stock_quantity ?? 'Chưa thiết lập',
          state: stockStateLabel[r.stock_state],
          places: r.locations.map((l) => `${l.label} (${l.quantity})`).join(', '),
          unit_cost: owner ? (r.stock_value == null ? 'Chưa rõ giá nhập' : r.unit_cost == null ? '' : Number(r.unit_cost)) : undefined,
          stock_value: owner ? (r.stock_value == null ? 'Chưa rõ giá nhập' : Number(r.stock_value)) : undefined
        })),
        notes: [
          `Xuất lúc ${new Date().toLocaleString('vi-VN')}, ${result.total} biến thể theo bộ lọc hiện tại (toàn bộ kết quả, không chỉ trang đang xem).`,
          'Có thể bán = Tổng tồn − Đang giữ cho đơn. Hàng đang đặt không cộng vào tồn.',
          ...(owner
            ? [
                'Giá vốn = giá nhập trung bình, tính lại sau mỗi lần nhập hàng. Hàng không rõ giá nhập ghi "Chưa rõ giá nhập" và không tính vào giá trị tồn.'
              ]
            : [])
        ]
      });
    } catch (e) {
      setExportError(e.message);
    } finally {
      setExporting(false);
    }
  };

  const allOnPage = rows.length > 0 && rows.every((r) => selected[r.detail_id]);
  return (
    <>
      <Title
        title="Tồn kho"
        subtitle="Số lượng hàng đang có trong kho cửa hàng."
        action={
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button component={Link} to="/warehouse/counts">
              Kiểm kê
            </Button>
            <Button component={Link} to="/warehouse/report">
              Báo cáo tồn kho
            </Button>
          </Stack>
        }
      />
      <Metrics
        loading={!data}
        columns={owner ? 3 : 2}
        items={[
          ['Tổng tồn thực tế', m.stock, 'Tổng số sản phẩm trong kho', () => update({ state: '' }), !state],
          ['Còn hàng', m.count_in, 'Số mẫu (màu/size) còn hàng · bấm để lọc', () => toggleState('in'), state === 'in'],
          ...(owner
            ? [
                [
                  'Tổng tiền hàng trong kho',
                  0,
                  m.unvalued_quantity ? `Chưa tính ${number(m.unvalued_quantity)} sản phẩm chưa có giá nhập` : 'Tính theo giá nhập',
                  null,
                  false,
                  money(m.stock_value)
                ]
              ]
            : [])
        ]}
      />
      <MainCard>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1, alignItems: { sm: 'center' } }}>
          <Tooltip describeChild title="Có máy quét USB/Bluetooth: không cần bấm, cứ bóp cò quét tem trên trang này là ra kết quả.">
            <Button variant="contained" onClick={() => setScanning(true)}>
              Quét mã tìm hàng
            </Button>
          </Tooltip>
          <Tooltip title={selectedRows.length ? '' : 'Tick chọn các dòng cần in, hoặc bấm “In tem” trên từng dòng'}>
            <span>
              <Button variant="outlined" disabled={!selectedRows.length} onClick={() => setPrinting(selectedRows)}>
                In tem các dòng đã chọn ({number(selectedRows.length)})
              </Button>
            </span>
          </Tooltip>
          {selectedRows.length > 0 && <Button onClick={() => setSelected({})}>Bỏ chọn</Button>}
          <Box sx={{ flex: 1 }} />
          <Button variant="outlined" disabled={exporting || !data} onClick={exportExcel}>
            {exporting ? 'Đang xuất…' : 'Xuất Excel'}
          </Button>
        </Stack>
        {exportError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setExportError('')}>
            {exportError}
          </Alert>
        )}
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} useFlexGap sx={{ mb: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Tìm tên sản phẩm, mã SP, mã biến thể hoặc mã vạch"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{ flex: 1, minWidth: 240 }}
            slotProps={{ htmlInput: { 'aria-label': 'Tìm tồn kho' } }}
          />
          <CategoryTreeSelect
            categories={warehouseCategories(data?.categories)}
            value={value('categoryId')}
            onChange={(id) => update({ categoryId: id })}
            sx={{ minWidth: 170 }}
          />
          {[
            ['color', 'Màu', (data?.colors || []).map((c) => [c, c])],
            ['size', 'Size', (data?.sizes || []).map((c) => [c, c])],
            ['shelfId', 'Vị trí', shelves.map((t) => [String(t.id), t.label])]
          ].map(([key, label, options]) => (
            <TextField
              key={key}
              select
              size="small"
              value={value(key)}
              onChange={(e) => update({ [key]: e.target.value })}
              sx={{ minWidth: 130 }}
              slotProps={{ select: { displayEmpty: true, inputProps: { 'aria-label': label } } }}
            >
              <MenuItem value="">{`Tất cả ${label.toLowerCase()}`}</MenuItem>
              {options.map(([v, l]) => (
                <MenuItem key={v} value={v}>
                  {l}
                </MenuItem>
              ))}
            </TextField>
          ))}
          <TextField
            select
            size="small"
            value={state}
            onChange={(e) => update({ state: e.target.value })}
            sx={{ minWidth: 190 }}
            slotProps={{ select: { displayEmpty: true, inputProps: { 'aria-label': 'Trạng thái tồn' } } }}
          >
            {stateOptions.map(([v, l]) => (
              <MenuItem key={v} value={v}>
                {v === 'slow' ? `Không bán ≥ ${slowDays} ngày` : l}
              </MenuItem>
            ))}
          </TextField>
          {state === 'slow' && (
            <TextField
              select
              size="small"
              value={slowDays}
              onChange={(e) => update({ slowDays: e.target.value })}
              slotProps={{ select: { inputProps: { 'aria-label': 'Số ngày không bán' } } }}
            >
              {[30, 60, 90, 180, 365].map((d) => (
                <MenuItem key={d} value={d}>
                  {d} ngày
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            select
            size="small"
            value={value('sort')}
            onChange={(e) => update({ sort: e.target.value })}
            sx={{ minWidth: 170 }}
            slotProps={{ select: { displayEmpty: true, inputProps: { 'aria-label': 'Sắp xếp' } } }}
          >
            <MenuItem value="">Tên A → Z</MenuItem>
            <MenuItem value="name_desc">Tên Z → A</MenuItem>
            <MenuItem value="stock_asc">Tồn tăng dần</MenuItem>
            <MenuItem value="stock_desc">Tồn giảm dần</MenuItem>
          </TextField>
          <FilterResetButton
            height={40}
            disabled={!filtered && !value('sort')}
            onClick={() => {
              setQuery('');
              setParams(new URLSearchParams(), { replace: true });
            }}
          />
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
          <Typography color="text.secondary">
            {data ? `${number(data.total)} sản phẩm · ${number(data.total_variants ?? rows.length)} biến thể (màu/size)` : ''}
          </Typography>
          {isLoading && <CircularProgress size={16} aria-label="Đang tải tồn kho" />}
        </Stack>
        {error ? (
          <Alert severity="error" action={<Button onClick={() => mutate()}>Thử lại</Button>}>
            Không tải được tồn kho: {error.message}
          </Alert>
        ) : !data ? (
          <Stack sx={{ p: 6, alignItems: 'center' }}>
            <CircularProgress aria-label="Đang tải tồn kho" />
          </Stack>
        ) : (
          <DataTable
            rows={lines}
            empty={filtered ? 'Không có sản phẩm nào khớp bộ lọc.' : 'Chưa có sản phẩm nào.'}
            onRow={(r) => (r._kind === 'product' ? toggleOpen(r.product_id) : update({ detail: r.detail_id, page: value('page') }))}
            server={{
              total: data.total,
              page: data.page,
              size: data.size,
              onPage: (p) => update({ page: p || '' }),
              onSize: (s) => update({ pageSize: s, page: '' })
            }}
            columns={[
              {
                key: 'select',
                label: (
                  <Checkbox
                    checked={allOnPage}
                    indeterminate={!allOnPage && rows.some((r) => selected[r.detail_id])}
                    disabled={!rows.length}
                    slotProps={{ input: { 'aria-label': 'Chọn tất cả dòng trên trang' } }}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = { ...prev };
                        rows.forEach((r) => (e.target.checked ? (next[r.detail_id] = r) : delete next[r.detail_id]));
                        return next;
                      })
                    }
                  />
                ),
                render: (r) => {
                  if (r._kind === 'product') {
                    const all = r.variants.every((v) => selected[v.detail_id]);
                    return (
                      <Checkbox
                        checked={all}
                        indeterminate={!all && r.variants.some((v) => selected[v.detail_id])}
                        onClick={(e) => e.stopPropagation()}
                        slotProps={{ input: { 'aria-label': `Chọn mọi biến thể của ${r.product_name}` } }}
                        onChange={(e) => setChecked(r.variants, e.target.checked)}
                      />
                    );
                  }
                  return (
                    <Checkbox
                      checked={Boolean(selected[r.detail_id])}
                      onClick={(e) => e.stopPropagation()}
                      slotProps={{ input: { 'aria-label': `Chọn ${variantLabel(r)}` } }}
                      onChange={(e) => setChecked([r], e.target.checked)}
                    />
                  );
                }
              },
              {
                key: 'name',
                label: 'Sản phẩm',
                render: (r) =>
                  r._kind === 'product' ? (
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Box component="span" sx={{ color: 'text.secondary', fontSize: 12, width: 12 }} aria-hidden>
                        {r._expanded ? <DownOutlined /> : <RightOutlined />}
                      </Box>
                      <Box>
                        <Typography variant="subtitle2">{r.product_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {r.product_code}
                          {r.category_name ? ` · ${r.category_name}` : ''}
                        </Typography>
                      </Box>
                    </Stack>
                  ) : r._kind === 'single' ? (
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Box component="span" sx={{ width: 12 }} aria-hidden />
                      <Box>
                        <Typography variant="subtitle2">{r.product_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {r.product_code} · {r.barcode || 'Chưa có mã vạch'}
                        </Typography>
                      </Box>
                    </Stack>
                  ) : (
                    <Box sx={{ pl: 3.5 }}>
                      <Typography variant="body2">{r.barcode || 'Chưa có mã vạch'}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Bấm để xem chi tiết
                      </Typography>
                    </Box>
                  )
              },
              {
                key: 'variant',
                label: 'Màu / Size',
                render: (r) =>
                  r._kind === 'product' ? (
                    <Typography variant="body2" color="text.secondary">
                      {number(r.variant_count)} biến thể
                    </Typography>
                  ) : (
                    <Typography variant="body2">
                      {r.color} / {r.size}
                    </Typography>
                  )
              },
              { key: 'stock_quantity', label: 'Tổng tồn', align: 'right', render: (r) => <b>{number(r.stock_quantity)}</b> },
              {
                key: 'placed',
                label: 'Đã xếp / Chưa xếp',
                align: 'right',
                render: (r) => (
                  <>
                    {number(r.assigned_quantity)} /{' '}
                    <Typography component="span" color={r.unassigned_quantity > 0 ? 'warning.main' : 'inherit'}>
                      {number(Math.max(0, Number(r.unassigned_quantity)))}
                    </Typography>
                  </>
                )
              },
              { key: 'held_quantity', label: 'Đang giữ', align: 'right', render: (r) => number(r.held_quantity) },
              { key: 'available_quantity', label: 'Có thể bán', align: 'right', render: (r) => number(r.available_quantity) },
              { key: 'incoming_quantity', label: 'Đang đặt', align: 'right', render: (r) => number(r.incoming_quantity) },
              {
                key: 'state',
                label: 'Trạng thái',
                // Luôn một chip trên một dòng để các dòng cao bằng nhau; ngưỡng tồn xem khi rê chuột hoặc trong chi tiết.
                render: (r) => {
                  if (r._kind === 'product') {
                    const all = r.count_out === r.variant_count;
                    const parts = [
                      r.count_out > 0 && `${number(r.count_out)} hết hàng`,
                      r.count_low > 0 && `${number(r.count_low)} sắp hết`
                    ].filter(Boolean);
                    const color = all || r.count_out > 0 ? stockStateColor.OUT : r.count_low > 0 ? stockStateColor.LOW : stockStateColor.IN;
                    const label = all ? stockStateLabel.OUT : parts.length ? parts.join(' · ') : stockStateLabel.IN;
                    return <Chip size="small" variant="outlined" color={color} label={label} />;
                  }
                  return (
                    <Tooltip
                      title={
                        r.min_stock_quantity == null
                          ? 'Chưa đặt ngưỡng tồn tối thiểu'
                          : `Ngưỡng tồn tối thiểu: ${number(r.min_stock_quantity)}`
                      }
                    >
                      <Chip size="small" variant="outlined" color={stockStateColor[r.stock_state]} label={stockStateLabel[r.stock_state]} />
                    </Tooltip>
                  );
                }
              },
              {
                key: 'locations',
                label: 'Vị trí',
                render: (r) =>
                  r.locations.length
                    ? `${r.locations
                        .slice(0, 2)
                        .map((l) => `${l.label} (${number(l.quantity)})`)
                        .join(', ')}${r.locations.length > 2 ? ` +${r.locations.length - 2}` : ''}`
                    : '—'
              },
              {
                key: 'open',
                label: '',
                render: (r) => {
                  if (r._kind === 'product') {
                    // Mỗi biến thể một mã chung: in N tem giống nhau cho N chiếc.
                    const printable = r.variants.filter((v) => v.barcode);
                    return (
                      <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                        <Tooltip
                          title={
                            printable.length
                              ? `In tem ${number(printable.length)} biến thể của sản phẩm này`
                              : 'Chưa biến thể nào có mã vạch'
                          }
                        >
                          <span>
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={!printable.length}
                              onClick={(e) => (e.stopPropagation(), setPrinting(printable))}
                              sx={{ whiteSpace: 'nowrap' }}
                            >
                              In tem
                            </Button>
                          </span>
                        </Tooltip>
                        {/* Giữ chỗ nút Xóa (ẩn) để nút In tem thẳng cột với các dòng biến thể */}
                        {owner && (
                          <Button size="small" tabIndex={-1} aria-hidden sx={{ visibility: 'hidden' }}>
                            Xóa
                          </Button>
                        )}
                      </Stack>
                    );
                  }
                  return (
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                      <Tooltip
                        title={r.barcode ? `In tem ${r.barcode}` : 'Chưa có mã vạch — mở Sửa sản phẩm và lưu lại để hệ thống tự gán mã'}
                      >
                        <span>
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={!r.barcode}
                            onClick={(e) => (e.stopPropagation(), setPrinting([r]))}
                            sx={{ whiteSpace: 'nowrap' }}
                          >
                            In tem
                          </Button>
                        </span>
                      </Tooltip>
                      {owner && (
                        <Button size="small" color="error" onClick={(e) => (e.stopPropagation(), setDeleting(r))}>
                          Xóa
                        </Button>
                      )}
                    </Stack>
                  );
                }
              }
            ]}
          />
        )}
      </MainCard>
      {detail && <InventoryDetail id={detail} onClose={() => update({ detail: '', page: value('page') })} onChanged={() => mutate()} />}
      {deleting && (
        <ActionDialog
          title={`Xóa ${variantLabel(deleting)}?`}
          text={
            Number(deleting.stock_quantity) > 0
              ? `Màu/size này còn ${number(deleting.stock_quantity)} sản phẩm trong kho nên chưa xóa được.`
              : 'Màu/size này sẽ bị ẩn khỏi tồn kho và danh sách chọn hàng. Các phiếu cũ vẫn giữ nguyên. Thêm lại đúng màu/size này thì sẽ hiện lại.'
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api(`/warehouse/inventory/${deleting.detail_id}/delete`, { method: 'POST' });
            await mutate();
            reloadWarehouse();
          }}
        />
      )}
      {printing && <BarcodePrintDialog variants={printing} onClose={() => setPrinting(null)} />}
      {scanning && (
        <BarcodeScannerDialog
          scanRequest={scanRequest}
          onClose={() => {
            setScanning(false);
            setScanRequest(null);
          }}
        />
      )}
    </>
  );
}
