import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Checkbox, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import useSWR from 'swr';
import { api } from 'services/http';
import { DataTable } from './components';
import BarcodePrintDialog from './BarcodePrintDialog';
import { markPrinted } from './SerialPrintDialog';
import { defectSourceLabel, docCode, number, unitLabel, unitStatusColor, unitStatusLabel, when } from './model';

const FILTERS = ['IN_STOCK', 'PENDING', 'SOLD', 'RETURNED_SUPPLIER', 'LOST', 'VOID'];

function Origin({ u }) {
  if (!u.in_receipt_id) return <Typography color="text.secondary">Hàng tồn trước khi có serial</Typography>;
  const code = docCode({ receipt_type: 'RECEIPT', receipt_id: u.in_receipt_id });
  return (
    <Button component={Link} to={`/warehouse/receipts?id=${u.in_receipt_id}`} size="small" sx={{ p: 0, minWidth: 0 }}>
      {code}
    </Button>
  );
}

function Exit({ u }) {
  if (u.order_id)
    return (
      <Button component={Link} to={`/orders/${u.order_id}`} size="small" sx={{ p: 0, minWidth: 0 }}>
        {u.order_number || `Đơn #${u.order_id}`}
      </Button>
    );
  if (u.out_receipt_id)
    return (
      <Button component={Link} to={`/warehouse/returns?id=${u.out_receipt_id}`} size="small" sx={{ p: 0, minWidth: 0 }}>
        {docCode({ receipt_type: 'SUPPLIER_RETURN', receipt_id: u.out_receipt_id })}
      </Button>
    );
  return u.out_at ? when(u.out_at) : '—';
}

/** Tab "Mã từng chiếc" của chi tiết biến thể: mỗi chiếc một serial, lọc theo trạng thái, in lại tem. */
export default function UnitList({ variant }) {
  const [status, setStatus] = useState('IN_STOCK');
  const [picked, setPicked] = useState(() => new Set());
  const [printing, setPrinting] = useState(null);
  // 'DEFECT' = chiếc đang báo lỗi (ghi ở Bán hàng → Xử lý hàng lỗi; ở đây chỉ hiển thị)
  const key = `/warehouse/units?detail=${variant.detail_id}${status === 'DEFECT' ? '&defective=true' : status ? `&status=${status}` : ''}`;
  const { data, error, isLoading, mutate } = useSWR(key, api, { keepPreviousData: true });
  const units = useMemo(() => data?.units || [], [data]);
  const chosen = units.filter((u) => picked.has(u.unit_id));
  const allPicked = units.length > 0 && chosen.length === units.length;

  if (error?.status === 503) return <Alert severity="info">{error.message}</Alert>;
  if (error) return <Alert severity="error">{error.message}</Alert>;
  if (isLoading && !data) return <CircularProgress size={24} aria-label="Đang tải mã" />;

  const counts = data?.counts || {};
  const total = Object.values(counts).reduce((n, c) => n + Number(c), 0);
  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const unprinted = units.filter((u) => u.status === 'IN_STOCK' && !u.printed_at);

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        Mỗi chiếc có một mã riêng (mã biến thể + số thứ tự), in trên tem dán vào từng chiếc. Số chiếc “Trong kho” luôn bằng tổng tồn.
      </Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        {FILTERS.map((f) => (
          <Chip
            key={f}
            clickable
            color={status === f ? 'primary' : 'default'}
            variant={status === f ? 'filled' : 'outlined'}
            label={`${unitStatusLabel[f]} (${number(counts[f] || 0)})`}
            onClick={() => (setStatus(f), setPicked(new Set()))}
          />
        ))}
        <Chip
          clickable
          color={status === '' ? 'primary' : 'default'}
          variant={status === '' ? 'filled' : 'outlined'}
          label={`Tất cả (${number(total)})`}
          onClick={() => (setStatus(''), setPicked(new Set()))}
        />
        {Number(data?.defective) > 0 && (
          <Chip
            clickable
            color="error"
            variant={status === 'DEFECT' ? 'filled' : 'outlined'}
            label={`Đang lỗi (${number(data.defective)})`}
            onClick={() => (setStatus('DEFECT'), setPicked(new Set()))}
          />
        )}
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button variant="outlined" disabled={!chosen.length} onClick={() => setPrinting(chosen)}>
          In tem đã chọn ({number(chosen.length)})
        </Button>
        {status === 'IN_STOCK' && (
          <Button variant="outlined" disabled={!unprinted.length} onClick={() => setPrinting(unprinted)}>
            In tem chưa in ({number(unprinted.length)})
          </Button>
        )}
      </Stack>
      {data?.truncated && <Alert severity="warning">Chỉ hiện 5.000 chiếc đầu.</Alert>}
      <DataTable
        rows={units.map((u) => ({ ...u, _key: u.unit_id }))}
        empty="Không có chiếc nào ở trạng thái này."
        onRow={(u) => toggle(u.unit_id)}
        columns={[
          {
            key: 'pick',
            label: (
              <Checkbox
                size="small"
                checked={allPicked}
                indeterminate={chosen.length > 0 && !allPicked}
                disabled={!units.length}
                onChange={(e) => setPicked(e.target.checked ? new Set(units.map((u) => u.unit_id)) : new Set())}
                slotProps={{ input: { 'aria-label': 'Chọn tất cả' } }}
              />
            ),
            render: (u) => (
              <Checkbox
                size="small"
                checked={picked.has(u.unit_id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggle(u.unit_id)}
                slotProps={{ input: { 'aria-label': `Chọn ${u.serial_code}` } }}
              />
            )
          },
          {
            key: 'serial_code',
            label: 'Mã serial',
            render: (u) => <Typography sx={{ fontFamily: 'monospace' }}>{u.serial_code}</Typography>
          },
          {
            key: 'status',
            label: 'Trạng thái',
            render: (u) => (
              <Chip size="small" variant="outlined" color={unitStatusColor[u.status]} label={unitStatusLabel[u.status] || u.status} />
            )
          },
          {
            key: 'location',
            label: 'Vị trí',
            render: (u) => (u.status === 'IN_STOCK' ? u.location || 'Chưa xếp' : '—')
          },
          { key: 'origin', label: 'Nhập từ', render: (u) => <Origin u={u} /> },
          { key: 'exit', label: 'Xuất / bán', render: (u) => <Exit u={u} /> },
          {
            key: 'printed_at',
            label: 'Tem',
            render: (u) =>
              u.printed_at ? (
                <Typography variant="body2">Đã in {when(u.printed_at)}</Typography>
              ) : (
                <Typography variant="body2" color="warning.main">
                  Chưa in
                </Typography>
              )
          },
          {
            key: 'note',
            label: 'Ghi chú',
            render: (u) =>
              u.defect_id ? (
                <Stack spacing={0.25}>
                  <Typography variant="body2" color="error.main">
                    Lỗi: {u.defect_types}
                    {u.defect_description ? ` — ${u.defect_description}` : ''}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {[defectSourceLabel[u.defect_source], u.defect_reporter, when(u.defect_reported_at)].filter(Boolean).join(' · ')} ·{' '}
                    <Link to="/warehouse/defects" onClick={(e) => e.stopPropagation()}>
                      Xử lý
                    </Link>
                  </Typography>
                </Stack>
              ) : (
                u.note || '—'
              )
          }
        ]}
      />
      {printing && (
        <BarcodePrintDialog
          serial
          variants={printing.map(unitLabel)}
          onClose={() => setPrinting(null)}
          onPrinted={async (items) => {
            await markPrinted(items);
            setPicked(new Set());
            mutate();
          }}
        />
      )}
    </Stack>
  );
}
