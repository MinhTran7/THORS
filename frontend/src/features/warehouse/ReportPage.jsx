import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Checkbox, CircularProgress, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import useSWR from 'swr';
import MainCard from 'components/MainCard';
import { api } from 'services/http';
import { DataTable, Metrics, Title } from './components';
import { money, number } from './model';
import { exportSheet } from './excelWorkbook';

const today = () => new Date().toLocaleDateString('sv-SE');
const monthStart = () => `${today().slice(0, 8)}01`;

/**
 * Nhập–xuất–tồn theo kỳ, computed by the backend from the same stock ledger as the stock card:
 * closing = opening + increase − decrease; location moves are not increases/decreases.
 */
export default function ReportPage() {
  const [params, setParams] = useSearchParams();
  const from = params.get('from') || monthStart();
  const to = params.get('to') || today();
  const [q, setQ] = useState(params.get('q') || '');
  const categoryId = params.get('categoryId') || '';
  const onlyMoving = params.get('all') !== '1';
  const set = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === '' || v == null ? next.delete(k) : next.set(k, v)));
    setParams(next, { replace: true });
  };
  const qs = new URLSearchParams({ from, to, onlyMoving });
  if (params.get('q')) qs.set('q', params.get('q'));
  if (categoryId) qs.set('categoryId', categoryId);
  const { data, error, isLoading } = useSWR(`/warehouse/inventory/report?${qs}`, api, { keepPreviousData: true });
  const { data: inv } = useSWR('/warehouse/inventory?pageSize=1', api);
  const [exportError, setExportError] = useState('');
  const t = data?.totals || {};
  const cost = data?.cost_visible;

  const exportExcel = async () => {
    setExportError('');
    try {
      await exportSheet({
        fileName: `THORS_Nhap_Xuat_Ton_${from}_${to}.xlsx`,
        sheetName: 'NhapXuatTon',
        columns: [
          { header: 'Mã SP', key: 'product_code', width: 10 },
          { header: 'Mã biến thể', key: 'detail_id', width: 11 },
          { header: 'Sản phẩm', key: 'product_name', width: 30 },
          { header: 'Màu', key: 'color', width: 12 },
          { header: 'Size', key: 'size', width: 8 },
          { header: 'Tồn đầu kỳ', key: 'opening', width: 11 },
          { header: 'Nhập mua', key: 'in_RECEIPT', width: 10 },
          { header: 'Khách trả nhập lại', key: 'in_RESTOCK', width: 12 },
          { header: 'Kiểm kê tăng', key: 'in_ADJUSTMENT', width: 11 },
          { header: 'Tổng tăng', key: 'increase', width: 10 },
          { header: 'Xuất bán', key: 'out_ORDER_OUT', width: 10 },
          { header: 'Trả NCC', key: 'out_SUPPLIER_RETURN', width: 10 },
          { header: 'Kiểm kê giảm', key: 'out_ADJUSTMENT', width: 11 },
          { header: 'Tổng giảm', key: 'decrease', width: 10 },
          { header: 'Tồn cuối kỳ', key: 'closing', width: 11 },
          { header: 'Lịch sử thiếu (SL)', key: 'ledger_gap', width: 13 },
          ...(cost
            ? [
                { header: 'Giá trị tồn đầu', key: 'opening_value', width: 15 },
                { header: 'Giá vốn BQ cuối kỳ', key: 'unit_cost', width: 15 },
                { header: 'Giá trị tồn cuối', key: 'closing_value', width: 15 },
                { header: 'Lý do chưa đủ cơ sở', key: 'cost_note', width: 40 }
              ]
            : [])
        ],
        rows: data.items.map((r) => ({
          ...r,
          ...(cost
            ? {
                opening_value: r.opening_value == null ? 'Chưa đủ cơ sở' : Number(r.opening_value),
                unit_cost: r.closing_value == null ? 'Chưa đủ cơ sở' : r.unit_cost == null ? '' : Number(r.unit_cost),
                closing_value: r.closing_value == null ? 'Chưa đủ cơ sở' : Number(r.closing_value)
              }
            : {})
        })),
        notes: [
          `Kỳ ${from} → ${to}; ${data.items.length} biến thể (toàn bộ kết quả lọc).`,
          'Tồn cuối = Tồn đầu + Tăng − Giảm, tính từ lịch sử biến động kho (thẻ kho). Chuyển vị trí trong kho không tính tăng/giảm.',
          'Biến thể có "Lịch sử thiếu" ≠ 0: dữ liệu cũ thay đổi tồn không được ghi lịch sử; tồn đầu kỳ có thể chưa chính xác.',
          ...(cost
            ? [
                'Giá vốn = bình quân gia quyền liên hoàn: tính lại sau mỗi lần nhập theo đúng thứ tự thời gian của thẻ kho; xuất bán/kiểm kê giảm theo giá bình quân tại thời điểm đó; trả NCC theo đơn giá dòng nhập được trả; khách trả nhập lại theo giá vốn lúc bán. Tồn không có chứng từ giá ghi "Chưa đủ cơ sở", không tính bằng 0, giá bán hay giá nhập gần nhất. Giá trị đầu/cuối kỳ là trạng thái bình quân tại đúng thời điểm đó.'
              ]
            : [])
        ]
      });
    } catch (e) {
      setExportError(e.message);
    }
  };

  return (
    <>
      <Title
        title="Báo cáo tồn kho"
        subtitle="Nhập – xuất – tồn theo kỳ, khớp với thẻ kho và số tồn hiện tại. Chuyển vị trí không làm tăng/giảm tổng tồn."
        action={
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" component={Link} to="/warehouse/inventory">
              Quay lại kho
            </Button>
            <Button variant="outlined" disabled={!data?.items?.length} onClick={exportExcel}>
              Xuất Excel
            </Button>
          </Stack>
        }
      />
      <MainCard sx={{ mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} useFlexGap flexWrap="wrap" sx={{ alignItems: { md: 'center' } }}>
          <TextField
            size="small"
            type="date"
            label="Từ ngày"
            value={from}
            onChange={(e) => set({ from: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            size="small"
            type="date"
            label="Đến ngày"
            value={to}
            onChange={(e) => set({ to: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            size="small"
            placeholder="Tìm tên, mã SP, mã vạch"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => set({ q: q.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && set({ q: q.trim() })}
            sx={{ flex: { xs: 1, md: '1 1 220px' } }}
            slotProps={{ htmlInput: { 'aria-label': 'Tìm trong báo cáo' } }}
          />
          <TextField
            select
            size="small"
            value={categoryId}
            onChange={(e) => set({ categoryId: e.target.value })}
            sx={{ minWidth: 160 }}
            slotProps={{ select: { displayEmpty: true, inputProps: { 'aria-label': 'Danh mục' } } }}
          >
            <MenuItem value="">Tất cả danh mục</MenuItem>
            {(inv?.categories || []).map((c) => (
              <MenuItem key={c.category_id} value={String(c.category_id)}>
                {c.category_name}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={<Checkbox checked={!onlyMoving} onChange={(e) => set({ all: e.target.checked ? '1' : '' })} />}
            label="Gồm biến thể không phát sinh"
          />
        </Stack>
      </MainCard>
      {error && <Alert severity="error">{error.message}</Alert>}
      {exportError && <Alert severity="error">{exportError}</Alert>}
      {!data && isLoading ? (
        <CircularProgress aria-label="Đang tải báo cáo" />
      ) : data ? (
        <>
          <Metrics
            items={[
              ['Tồn đầu kỳ', t.opening, `Đầu ngày ${new Date(from).toLocaleDateString('vi-VN')}`],
              ['Tăng trong kỳ', t.increase, 'Nhập mua, khách trả, kiểm kê tăng'],
              ['Giảm trong kỳ', t.decrease, 'Xuất bán, trả NCC, kiểm kê giảm'],
              ['Tồn cuối kỳ', t.closing, `Cuối ngày ${new Date(to).toLocaleDateString('vi-VN')}`],
              ...(cost
                ? [
                    [
                      'Giá trị tồn cuối kỳ',
                      0,
                      t.unvalued_quantity
                        ? `${number(t.unvalued_quantity)} sản phẩm chưa đủ cơ sở giá vốn — không tính · đầu kỳ ${money(t.opening_value)}`
                        : `Bình quân gia quyền liên hoàn · đầu kỳ ${money(t.opening_value)}`,
                      null,
                      false,
                      money(t.closing_value)
                    ]
                  ]
                : [])
            ]}
          />
          {t.ledger_gaps > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {number(t.ledger_gaps)} biến thể có lịch sử cũ không đầy đủ (cột “Lịch sử thiếu”): tồn đầu kỳ của chúng được suy ra từ lịch sử
              đã ghi nên có thể chưa chính xác. Hệ thống không tạo lịch sử giả để bù.
            </Alert>
          )}
          {!cost && (
            <Typography color="text.secondary" sx={{ mb: 1 }}>
              Giá vốn và giá trị tồn chỉ hiển thị cho chủ cửa hàng.
            </Typography>
          )}
          <MainCard>
            <DataTable
              rows={data.items.map((r) => ({ ...r, _key: r.detail_id }))}
              empty="Không có biến thể phát sinh trong kỳ."
              columns={[
                {
                  key: 'name',
                  label: 'Sản phẩm',
                  render: (r) => (
                    <>
                      <Typography variant="subtitle2">{r.product_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {r.product_code} · #{r.detail_id} · {r.color} / {r.size}
                      </Typography>
                    </>
                  )
                },
                { key: 'opening', label: 'Tồn đầu', align: 'right', render: (r) => number(r.opening) },
                {
                  key: 'increase',
                  label: 'Tăng',
                  align: 'right',
                  render: (r) => (
                    <span title={`Nhập mua ${r.in_RECEIPT} · Khách trả ${r.in_RESTOCK} · Kiểm kê ${r.in_ADJUSTMENT}`}>
                      {number(r.increase)}
                    </span>
                  )
                },
                {
                  key: 'decrease',
                  label: 'Giảm',
                  align: 'right',
                  render: (r) => (
                    <span title={`Xuất bán ${r.out_ORDER_OUT} · Trả NCC ${r.out_SUPPLIER_RETURN} · Kiểm kê ${r.out_ADJUSTMENT}`}>
                      {number(r.decrease)}
                    </span>
                  )
                },
                { key: 'closing', label: 'Tồn cuối', align: 'right', render: (r) => <b>{number(r.closing)}</b> },
                ...(cost
                  ? [
                      {
                        key: 'opening_value',
                        label: 'Giá trị đầu kỳ',
                        align: 'right',
                        render: (r) => (r.opening_value == null ? 'Chưa đủ cơ sở' : money(r.opening_value))
                      },
                      {
                        key: 'unit_cost',
                        label: 'Giá vốn BQ',
                        align: 'right',
                        render: (r) => (r.closing_value == null ? 'Chưa đủ cơ sở' : r.unit_cost == null ? '—' : money(r.unit_cost))
                      },
                      {
                        key: 'closing_value',
                        label: 'Giá trị tồn cuối',
                        align: 'right',
                        render: (r) => (r.closing_value == null ? <span title={r.cost_note}>Chưa đủ cơ sở</span> : money(r.closing_value))
                      }
                    ]
                  : []),
                {
                  key: 'ledger_gap',
                  label: 'Ghi chú',
                  render: (r) => (r.ledger_gap ? <Typography color="warning.main">Lịch sử thiếu {number(r.ledger_gap)}</Typography> : '')
                }
              ]}
            />
          </MainCard>
        </>
      ) : null}
    </>
  );
}
