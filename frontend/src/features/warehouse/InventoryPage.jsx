import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import useSWR from 'swr';
import MainCard from 'components/MainCard';
import { api } from 'services/http';
import { useWarehouse } from './WarehouseContext';
import { DataTable, Metrics, Title } from './components';
import { money, number, skuLabel, stockStateColor, stockStateLabel, variantLabel } from './model';
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
          { header: 'SL chưa đủ cơ sở giá vốn', key: 'unvalued_quantity', width: 16 },
          { header: 'Lý do', key: 'cost_note', width: 40 }
        ]
      : [])
  ];
}

export default function InventoryPage() {
  const { owner, busy, run, data: snapshot } = useWarehouse();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [selected, setSelected] = useState({});
  // Variants open in the print dialog: the selected rows, or the one row whose "In tem" was clicked.
  const [printing, setPrinting] = useState(null);
  const [scanning, setScanning] = useState(false);
  // A code read by a USB/Bluetooth scanner anywhere on this page: opens the lookup with that code.
  const [scanRequest, setScanRequest] = useState(null);
  const [notice, setNotice] = useState('');
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
  const { data, error, isLoading, mutate } = useSWR(`/warehouse/inventory?${qs}`, api, { keepPreviousData: true });
  const rows = data?.items || [];
  const m = data?.metrics || {};
  const state = value('state');
  const slowDays = Number(value('slowDays')) || 30;
  const filtered = FILTERS.some((k) => !['page', 'pageSize', 'sort'].includes(k) && value(k));
  const detail = Number(value('detail')) || null;
  useBarcodeScanner(
    (code) => {
      setScanRequest({ code, n: Date.now() });
      setScanning(true);
    },
    !printing && !detail
  );
  const selectedRows = Object.values(selected);
  const toggleState = (s) => update({ state: state === s ? '' : s });
  const shelves = snapshot.tiers
    .map((t) => ({
      id: t.shelf_level_id,
      label: `${snapshot.racks.find((r) => r.rack_id === t.rack_id)?.rack_code || '?'}${t.level_number}`
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'));

  const generate = async () => {
    const missing = selectedRows.filter((r) => !r.barcode).map((r) => r.detail_id);
    try {
      const result = await run(() =>
        api('/warehouse/barcodes/generate', { method: 'POST', body: missing.length ? { detailIds: missing } : {} })
      );
      setNotice(
        result.generated
          ? `Đã tạo ${number(result.generated)} mã vạch mới: ${result.codes.join(', ')}.`
          : 'Không có biến thể nào cần tạo mã.'
      );
      const fresh = await api('/warehouse/inventory?all=true');
      setSelected((prev) =>
        Object.fromEntries(Object.keys(prev).map((id) => [id, fresh.items.find((r) => String(r.detail_id) === id) || prev[id]]))
      );
      mutate();
    } catch {
      /* WarehouseContext shows the API error. */
    }
  };

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
          unit_cost: owner ? (r.stock_value == null ? 'Chưa đủ cơ sở' : r.unit_cost == null ? '' : Number(r.unit_cost)) : undefined,
          stock_value: owner ? (r.stock_value == null ? 'Chưa đủ cơ sở' : Number(r.stock_value)) : undefined
        })),
        notes: [
          `Xuất lúc ${new Date().toLocaleString('vi-VN')}, ${result.total} biến thể theo bộ lọc hiện tại (toàn bộ kết quả, không chỉ trang đang xem).`,
          'Có thể bán = Tổng tồn − Đang giữ cho đơn. Hàng đang đặt không cộng vào tồn.',
          ...(owner
            ? [
                'Giá vốn = bình quân gia quyền liên hoàn: tính lại sau mỗi lần nhập theo đúng thứ tự thời gian của thẻ kho; xuất bán/kiểm kê giảm theo giá bình quân tại thời điểm đó; trả NCC theo đơn giá dòng nhập được trả; khách trả nhập lại theo giá vốn lúc bán. Tồn không có chứng từ giá ghi "Chưa đủ cơ sở", không tính bằng 0, giá bán hay giá nhập gần nhất.'
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
        subtitle="Tổng tồn = Đã xếp vị trí + Chưa xếp vị trí. Có thể bán = Tổng tồn − Đang giữ cho đơn. Hàng đang đặt chưa tính vào tồn."
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
        columns={owner ? 5 : 4}
        items={[
          ['Tổng tồn thực tế', m.stock, 'Bấm để bỏ lọc trạng thái', () => update({ state: '' }), !state],
          ['Đã xếp vị trí', m.assigned, 'Tại kệ / tầng'],
          [
            'Chưa xếp vị trí',
            m.unassigned,
            `${number(m.count_unassigned)} biến thể cần xếp · bấm để lọc`,
            () => toggleState('unassigned'),
            state === 'unassigned'
          ],
          ['Đang giữ cho đơn', m.held, `Có thể bán: ${number(m.available)}`],
          ['Hàng đang đặt', m.incoming, 'Còn chờ nhận từ phiếu đặt đã xác nhận'],
          ['Còn hàng', m.count_in, 'Biến thể có tồn > 0', () => toggleState('in'), state === 'in'],
          ['Hết hàng', m.count_out, 'Biến thể tồn = 0', () => toggleState('out'), state === 'out'],
          ['Sắp hết', m.count_low, 'Có thể bán ≤ ngưỡng tối thiểu', () => toggleState('low'), state === 'low'],
          ['Biến thể', m.variants, filtered ? 'Theo tìm kiếm / bộ lọc' : 'Toàn bộ kho cửa hàng'],
          ...(owner
            ? [
                [
                  'Giá trị tồn kho',
                  0,
                  m.unvalued_quantity
                    ? `${number(m.unvalued_quantity)} sản phẩm (${number(m.unvalued_variants)} biến thể) chưa đủ cơ sở giá vốn — không tính`
                    : 'Giá vốn bình quân gia quyền liên hoàn',
                  null,
                  false,
                  money(m.stock_value)
                ]
              ]
            : [])
        ]}
      />
      <MainCard title="Cảnh báo" sx={{ mb: 2 }}>
        <Stack spacing={1}>
          {m.count_out > 0 && (
            <Alert severity="error" action={<Button onClick={() => update({ state: 'out' })}>Xem</Button>}>
              {number(m.count_out)} biến thể hết hàng (căn cứ: tổng tồn = 0).
            </Alert>
          )}
          {m.count_low > 0 && (
            <Alert severity="warning" action={<Button onClick={() => update({ state: 'low' })}>Xem</Button>}>
              {number(m.count_low)} biến thể dưới / chạm ngưỡng tối thiểu (căn cứ: số có thể bán = tồn − đang giữ).
            </Alert>
          )}
          {m.count_noThreshold > 0 && (
            <Alert severity="info" action={<Button onClick={() => update({ state: 'noThreshold' })}>Xem</Button>}>
              {number(m.count_noThreshold)} biến thể chưa thiết lập ngưỡng tối thiểu — chưa đánh giá sắp hết.
              {owner ? ' Đặt ngưỡng trong chi tiết biến thể.' : ''}
            </Alert>
          )}
          {m.unassigned > 0 && (
            <Alert severity="warning" action={<Button onClick={() => update({ state: 'unassigned' })}>Lọc hàng cần xếp</Button>}>
              {number(m.unassigned)} sản phẩm ({number(m.count_unassigned)} biến thể) chưa xếp vị trí.
            </Alert>
          )}
          {m.hold_shortage > 0 && (
            <Alert severity="error">
              {number(m.hold_shortage)} biến thể có số đang giữ cho đơn lớn hơn tổng tồn — cần xử lý các đơn này.
            </Alert>
          )}
          <Alert
            severity={m.count_slow ? 'warning' : 'success'}
            icon={false}
            action={
              <Button disabled={!m.count_slow} onClick={() => update({ state: 'slow' })}>
                Xem
              </Button>
            }
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
              <span>Tồn lâu — không phát sinh xuất bán từ</span>
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
              <span>: {number(m.count_slow)} biến thể.</span>
            </Stack>
            {m.slow_unknown > 0 && (
              <Typography variant="caption" sx={{ display: 'block' }}>
                {number(m.slow_unknown)} biến thể còn hàng nhưng chưa có lịch sử nhập/bán — chưa đủ dữ liệu để đánh giá, không tính vào tồn
                lâu.
              </Typography>
            )}
          </Alert>
          {m.ledger_gaps > 0 && (
            <Alert severity="info">
              {number(m.ledger_gaps)} biến thể có lịch sử kho cũ không đầy đủ (tồn hiện tại khác tổng các biến động đã ghi). Hệ thống không
              tạo lịch sử giả để bù; báo cáo kỳ của các biến thể này được đánh dấu.
            </Alert>
          )}
        </Stack>
      </MainCard>
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
          {owner && (
            <Button
              variant="outlined"
              disabled={busy || (selectedRows.length ? selectedRows.every((r) => r.barcode) : !m.missing_barcode)}
              onClick={generate}
            >
              {selectedRows.length
                ? `Tạo mã cho mục đã chọn (${number(selectedRows.filter((r) => !r.barcode).length)})`
                : `Tạo mã còn thiếu (${number(m.missing_barcode)})`}
            </Button>
          )}
          {selectedRows.length > 0 && <Button onClick={() => setSelected({})}>Bỏ chọn</Button>}
          <Box sx={{ flex: 1 }} />
          <Button variant="outlined" disabled={exporting || !data} onClick={exportExcel}>
            {exporting ? 'Đang xuất…' : 'Xuất Excel'}
          </Button>
        </Stack>
        {notice && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>
            {notice}
          </Alert>
        )}
        {exportError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setExportError('')}>
            {exportError}
          </Alert>
        )}
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
          <TextField
            size="small"
            placeholder="Tìm tên sản phẩm, mã SP, mã biến thể hoặc mã vạch"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{ flex: 1, minWidth: 240 }}
            slotProps={{ htmlInput: { 'aria-label': 'Tìm tồn kho' } }}
          />
          {[
            ['color', 'Màu', (data?.colors || []).map((c) => [c, c])],
            ['size', 'Size', (data?.sizes || []).map((c) => [c, c])],
            ['categoryId', 'Danh mục', (data?.categories || []).map((c) => [String(c.category_id), c.category_name])],
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
          <Button
            disabled={!filtered && !value('sort')}
            onClick={() => {
              setQuery('');
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            Xóa bộ lọc
          </Button>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
          <Typography color="text.secondary">{data ? `${number(data.total)} kết quả` : ''}</Typography>
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
            rows={rows}
            empty={filtered ? 'Không có biến thể nào khớp bộ lọc.' : 'Chưa có biến thể sản phẩm nào.'}
            onRow={(r) => update({ detail: r.detail_id, page: value('page') })}
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
                render: (r) => (
                  <Checkbox
                    checked={Boolean(selected[r.detail_id])}
                    onClick={(e) => e.stopPropagation()}
                    slotProps={{ input: { 'aria-label': `Chọn ${variantLabel(r)}` } }}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = { ...prev };
                        if (e.target.checked) next[r.detail_id] = r;
                        else delete next[r.detail_id];
                        return next;
                      })
                    }
                  />
                )
              },
              {
                key: 'name',
                label: 'Sản phẩm',
                render: (r) => (
                  <>
                    <Typography variant="subtitle2">{r.product_name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {skuLabel(r)} · {r.barcode || 'Chưa có mã vạch'}
                    </Typography>
                  </>
                )
              },
              { key: 'variant', label: 'Màu / Size', render: (r) => `${r.color} / ${r.size}` },
              { key: 'stock_quantity', label: 'Tổng tồn', align: 'right', render: (r) => <b>{number(r.stock_quantity)}</b> },
              {
                key: 'placed',
                label: 'Đã xếp / Chưa xếp',
                align: 'right',
                render: (r) => (
                  <>
                    {number(r.assigned_quantity)} /{' '}
                    <Typography
                      component="span"
                      color={r.unassigned_quantity > 0 ? 'warning.main' : 'inherit'}
                    >
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
                render: (r) => (
                  <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                    <Chip size="small" variant="outlined" color={stockStateColor[r.stock_state]} label={stockStateLabel[r.stock_state]} />
                    <Typography variant="caption" color="text.secondary">
                      {r.min_stock_quantity == null ? 'Chưa đặt ngưỡng' : `Ngưỡng ${number(r.min_stock_quantity)}`}
                    </Typography>
                  </Stack>
                )
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
                render: (r) => (
                  <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                    <Tooltip title={r.barcode ? `In tem ${r.barcode}` : 'Chưa có mã vạch — chủ cửa hàng bấm “Tạo mã” trước'}>
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
                    <Button size="small" onClick={(e) => (e.stopPropagation(), update({ detail: r.detail_id, page: value('page') }))}>
                      Chi tiết
                    </Button>
                  </Stack>
                )
              }
            ]}
          />
        )}
      </MainCard>
      {detail && <InventoryDetail id={detail} onClose={() => update({ detail: '', page: value('page') })} onChanged={() => mutate()} />}
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
