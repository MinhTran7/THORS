import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import useSWR from 'swr';
import MainCard from 'components/MainCard';
import { api } from 'services/http';
import { useWarehouse } from './WarehouseContext';
import { ActionDialog, DataTable, Metrics, Status, Title } from './components';
import { countCode, countReasonLabel, locationLabel, number, variantLabel, when } from './model';

const historyNames = {
  COUNT_CREATE: 'Lập phiếu',
  COUNT_EDIT: 'Sửa / lưu lại (cập nhật số hệ thống)',
  COUNT_SUBMIT: 'Gửi xác nhận',
  COUNT_CONFIRM: 'Xác nhận, cập nhật tồn',
  COUNT_REJECT: 'Từ chối',
  COUNT_CANCEL: 'Hủy phiếu'
};

/**
 * Lines for one variant with today's system figures: only locations that currently hold stock, plus the
 * unplaced part when it is > 0. A variant with no stock anywhere still gets the unplaced line to count.
 */
function linesFor(data, variant) {
  const places = data.locations.filter((l) => l.detail_id === variant.detail_id && Number(l.quantity) > 0);
  const unplaced = Number(variant.unassigned_quantity);
  return [
    ...places.map((l) => ({
      key: `${variant.detail_id}:${l.product_location_id}`,
      detailId: variant.detail_id,
      locationId: l.product_location_id,
      label: variantLabel(variant),
      place: locationLabel(data, l.shelf_level_id),
      system: Number(l.quantity),
      counted: '',
      reason: '',
      note: ''
    })),
    ...(unplaced > 0 || !places.length
      ? [
          {
            key: `${variant.detail_id}:unplaced`,
            detailId: variant.detail_id,
            locationId: null,
            label: variantLabel(variant),
            place: 'Chưa xếp vị trí',
            system: Math.max(0, unplaced),
            counted: '',
            reason: '',
            note: ''
          }
        ]
      : [])
  ];
}

function CountForm({ count, initialVariant, onClose, onSaved }) {
  const { data, owner, run, busy } = useWarehouse();
  const [requestKey] = useState(() => crypto.randomUUID());
  const [note, setNote] = useState(count?.note || '');
  const [lines, setLines] = useState(() => {
    if (count)
      return count.lines.map((l) => ({
        key: `${l.detail_id}:${l.product_location_id ?? 'unplaced'}`,
        detailId: l.detail_id,
        locationId: l.product_location_id,
        label: `${l.product_name} · ${l.color} · ${l.size}`,
        place: l.location_label || 'Chưa xếp vị trí',
        system: Number(l.current_quantity ?? l.system_quantity),
        counted: String(l.counted_quantity),
        reason: l.reason_code || '',
        note: l.note || ''
      }));
    const v = data.variants.find((x) => x.detail_id === initialVariant);
    return v ? linesFor(data, v) : [];
  });
  const [error, setError] = useState('');
  const change = (key, patch) => setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const problems = lines.filter(
    (l) =>
      l.counted === '' || Number(l.counted) < 0 || !Number.isInteger(Number(l.counted)) || (Number(l.counted) !== l.system && !l.reason)
  );
  const payload = {
    note,
    requestKey: count ? undefined : requestKey,
    lines: lines.map((l) => ({
      detailId: l.detailId,
      locationId: l.locationId,
      counted: Number(l.counted),
      reason: Number(l.counted) !== l.system ? l.reason : null,
      note: l.note || null
    }))
  };
  const save = async (next) => {
    setError('');
    try {
      const saved = await run(() =>
        count
          ? api(`/warehouse/counts/${count.count_id}`, { method: 'PUT', body: payload })
          : api('/warehouse/counts', { method: 'POST', body: payload })
      );
      if (next === 'submit')
        await run(() => api(`/warehouse/counts/${saved.count_id}/submit`, { method: 'POST' }), 'Đã gửi phiếu kiểm kê chờ xác nhận.');
      if (next === 'confirm')
        await run(() => api(`/warehouse/counts/${saved.count_id}/confirm`, { method: 'POST' }), 'Đã xác nhận kiểm kê, tồn đã cập nhật.');
      onSaved(saved.count_id);
    } catch (e) {
      setError(e.message);
    }
  };
  const used = new Set(lines.map((l) => l.detailId));
  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="lg">
      <DialogTitle>{count ? `Sửa phiếu kiểm kê ${countCode(count.count_id)}` : 'Lập phiếu kiểm kê'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info">
            Đếm thực tế từng vị trí và phần chưa xếp. Số hệ thống được chụp khi lưu phiếu; phiếu nháp / chờ xác nhận chưa đổi tồn. Khi xác
            nhận, nếu tồn đã phát sinh thêm sau lúc đếm, hệ thống dừng lại để đếm/lưu lại — không ghi đè âm thầm.
          </Alert>
          <Autocomplete
            options={data.variants.filter((v) => !used.has(v.detail_id))}
            getOptionLabel={(v) => `${variantLabel(v)} · #${v.detail_id}${v.barcode ? ` · ${v.barcode}` : ''}`}
            onChange={(_, v) => v && setLines((all) => [...all, ...linesFor(data, v)])}
            value={null}
            renderInput={(p) => <TextField {...p} size="small" label="Thêm biến thể cần kiểm (tên, màu, size, mã vạch)" />}
          />
          <DataTable
            rows={lines.map((l) => ({ ...l, _key: l.key }))}
            empty="Chưa chọn biến thể nào."
            columns={[
              {
                key: 'label',
                label: 'Biến thể / vị trí',
                render: (l) => (
                  <>
                    <Typography variant="subtitle2">{l.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      #{l.detailId} · {l.place}
                    </Typography>
                  </>
                )
              },
              { key: 'system', label: 'Số hệ thống', align: 'right', render: (l) => number(l.system) },
              {
                key: 'counted',
                label: 'Thực đếm',
                render: (l) => (
                  <TextField
                    size="small"
                    type="number"
                    value={l.counted}
                    onChange={(e) => change(l.key, { counted: e.target.value })}
                    slotProps={{ htmlInput: { min: 0, step: 1, 'aria-label': `Thực đếm ${l.label} ${l.place}` } }}
                    sx={{ width: 100 }}
                  />
                )
              },
              {
                key: 'diff',
                label: 'Chênh lệch',
                align: 'right',
                render: (l) =>
                  l.counted === '' ? (
                    '—'
                  ) : (
                    <Typography color={Number(l.counted) - l.system ? 'warning.main' : 'text.secondary'}>
                      {Number(l.counted) - l.system > 0 ? '+' : ''}
                      {number(Number(l.counted) - l.system)}
                    </Typography>
                  )
              },
              {
                key: 'reason',
                label: 'Lý do chênh lệch',
                render: (l) =>
                  l.counted !== '' && Number(l.counted) !== l.system ? (
                    <TextField
                      select
                      size="small"
                      value={l.reason}
                      onChange={(e) => change(l.key, { reason: e.target.value })}
                      sx={{ minWidth: 200 }}
                      slotProps={{ select: { displayEmpty: true, inputProps: { 'aria-label': `Lý do ${l.label} ${l.place}` } } }}
                    >
                      <MenuItem value="">Chọn lý do</MenuItem>
                      {Object.entries(countReasonLabel).map(([k, v]) => (
                        <MenuItem key={k} value={k}>
                          {v}
                        </MenuItem>
                      ))}
                    </TextField>
                  ) : (
                    '—'
                  )
              },
              {
                key: 'note',
                label: 'Ghi chú',
                render: (l) => (
                  <TextField
                    size="small"
                    value={l.note}
                    onChange={(e) => change(l.key, { note: e.target.value })}
                    slotProps={{ htmlInput: { maxLength: 255 } }}
                  />
                )
              },
              {
                key: 'remove',
                label: '',
                render: (l) => (
                  <Button size="small" color="error" onClick={() => setLines((all) => all.filter((x) => x.key !== l.key))}>
                    Bỏ
                  </Button>
                )
              }
            ]}
          />
          {lines.some((l) => l.reason === 'MISSING_DOCUMENT' && Number(l.counted) !== l.system) && (
            <Alert severity="warning">
              Chênh lệch do thiếu chứng từ không được xác nhận bằng điều chỉnh kho: hãy lập đúng phiếu nhập / đơn bán / phiếu trả NCC trước,
              rồi lưu lại phiếu kiểm kê.
            </Alert>
          )}
          <TextField
            label="Ghi chú phiếu"
            size="small"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 255 } }}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Typography sx={{ mr: 'auto', ml: 2 }} color={problems.length ? 'warning.main' : 'text.secondary'}>
          {problems.length ? `${problems.length} dòng chưa nhập số đếm hoặc chưa chọn lý do` : `${lines.length} dòng`}
        </Typography>
        <Button disabled={busy} onClick={onClose}>
          Đóng
        </Button>
        {/* Chủ cửa hàng xác nhận thẳng, không cần nháp; nháp chỉ dành cho thành viên trước khi gửi xác nhận. */}
        {!owner && (
          <Button variant="outlined" disabled={busy || !lines.length || problems.length > 0} onClick={() => save()}>
            Lưu nháp
          </Button>
        )}
        {owner ? (
          <Button variant="contained" disabled={busy || !lines.length || problems.length > 0} onClick={() => save('confirm')}>
            Xác nhận kiểm kê
          </Button>
        ) : (
          (!count || count.status === 'DRAFT') && (
            <Button variant="contained" disabled={busy || !lines.length || problems.length > 0} onClick={() => save('submit')}>
              Gửi xác nhận
            </Button>
          )
        )}
      </DialogActions>
    </Dialog>
  );
}

function CountDetail({ id, onClose, onEdit }) {
  const { owner, account, run, busy } = useWarehouse();
  const { data: c, error } = useSWR(`/warehouse/counts/${id}`, api);
  const [ending, setEnding] = useState(null);
  const [result, setResult] = useState(null);
  const open = c && ['DRAFT', 'PENDING_CONFIRMATION'].includes(c.status);
  const mine = c && c.created_by === account.id;
  const stale = c?.lines?.some((l) => l.changed_since_count);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>
        {c ? `Phiếu kiểm kê ${c.code}` : 'Phiếu kiểm kê'} {c && <Status value={c.status} />}
      </DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error">{error.message}</Alert>
        ) : !c ? (
          <CircularProgress aria-label="Đang tải phiếu kiểm kê" />
        ) : (
          <Stack spacing={2}>
            <Typography color="text.secondary">
              Người lập: {c.creator_name} · Đếm lúc {when(c.counted_at)}
              {c.confirmer_name && ` · ${c.status === 'CONFIRMED' ? 'Xác nhận' : 'Xử lý'}: ${c.confirmer_name} lúc ${when(c.confirmed_at)}`}
              {c.note && ` · ${c.note}`}
            </Typography>
            {c.rejection_reason && <Alert severity="warning">Lý do: {c.rejection_reason}</Alert>}
            {open && stale && (
              <Alert severity="warning">
                Có dòng đã phát sinh biến động sau lúc đếm (cột “Hiện tại”). Không thể xác nhận bằng số đếm cũ — mở “Sửa / đếm lại” để kiểm
                tra và lưu lại.
              </Alert>
            )}
            {result?.warnings?.map((w) => (
              <Alert key={w} severity="warning">
                {w}
              </Alert>
            ))}
            <DataTable
              rows={c.lines.map((l) => ({ ...l, _key: l.count_item_id }))}
              columns={[
                {
                  key: 'name',
                  label: 'Biến thể / vị trí',
                  render: (l) => (
                    <>
                      <Typography variant="subtitle2">
                        {l.product_name} · {l.color} · {l.size}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        #{l.detail_id} · {l.location_label || 'Chưa xếp vị trí'}
                      </Typography>
                    </>
                  )
                },
                { key: 'system_quantity', label: 'Số hệ thống lúc đếm', align: 'right', render: (l) => number(l.system_quantity) },
                { key: 'counted_quantity', label: 'Thực đếm', align: 'right', render: (l) => number(l.counted_quantity) },
                {
                  key: 'difference',
                  label: 'Chênh lệch',
                  align: 'right',
                  render: (l) => `${l.difference > 0 ? '+' : ''}${number(l.difference)}`
                },
                { key: 'reason_label', label: 'Lý do', render: (l) => l.reason_label || '—' },
                { key: 'note', label: 'Ghi chú', render: (l) => l.note || '—' },
                ...(open
                  ? [
                      {
                        key: 'current_quantity',
                        label: 'Hiện tại',
                        align: 'right',
                        render: (l) => (
                          <Typography color={l.changed_since_count ? 'error' : 'text.secondary'}>{number(l.current_quantity)}</Typography>
                        )
                      }
                    ]
                  : [])
              ]}
            />
            <Typography variant="subtitle1">Lịch sử phiếu</Typography>
            <DataTable
              rows={c.history.map((h, i) => ({ ...h, _key: i }))}
              columns={[
                { key: 'performed_at', label: 'Thời gian', render: (h) => when(h.performed_at) },
                { key: 'action_type', label: 'Thao tác', render: (h) => historyNames[h.action_type] || h.action_type },
                { key: 'actor_name', label: 'Người thực hiện' },
                { key: 'new_value', label: 'Chi tiết' }
              ]}
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {open && (owner || (mine && c.status === 'DRAFT')) && (
          <Button disabled={busy} onClick={() => onEdit(c)}>
            Sửa / đếm lại
          </Button>
        )}
        {open && (owner || mine) && (
          <Button color="error" disabled={busy} onClick={() => setEnding('cancel')}>
            Hủy phiếu
          </Button>
        )}
        {owner && c?.status === 'PENDING_CONFIRMATION' && (
          <Button color="error" disabled={busy} onClick={() => setEnding('reject')}>
            Từ chối
          </Button>
        )}
        {!owner && mine && c?.status === 'DRAFT' && (
          <Button
            variant="contained"
            disabled={busy}
            onClick={() =>
              run(() => api(`/warehouse/counts/${id}/submit`, { method: 'POST' }), 'Đã gửi phiếu kiểm kê chờ xác nhận.').catch(() => {})
            }
          >
            Gửi xác nhận
          </Button>
        )}
        {owner && open && (
          <Button
            variant="contained"
            disabled={busy || stale}
            onClick={() =>
              run(() => api(`/warehouse/counts/${id}/confirm`, { method: 'POST' }), 'Đã xác nhận kiểm kê, tồn đã cập nhật.')
                .then(setResult)
                .catch(() => {})
            }
          >
            {c?.status === 'PENDING_CONFIRMATION' ? 'Duyệt và cập nhật tồn' : 'Xác nhận kiểm kê'}
          </Button>
        )}
        <Button onClick={onClose}>Đóng</Button>
      </DialogActions>
      {ending && (
        <ActionDialog
          title={ending === 'reject' ? 'Từ chối phiếu kiểm kê' : 'Hủy phiếu kiểm kê'}
          text="Tồn kho không thay đổi."
          reason
          onClose={() => setEnding(null)}
          onConfirm={(reason) => run(() => api(`/warehouse/counts/${id}/${ending}`, { method: 'POST', body: { reason } }))}
        />
      )}
    </Dialog>
  );
}

export default function CountsPage() {
  const { owner } = useWarehouse();
  const [params, setParams] = useSearchParams();
  const variant = Number(params.get('variant')) || null;
  const [status, setStatus] = useState('');
  const [form, setForm] = useState(() => (params.get('new') ? { variant } : null));
  const [detail, setDetail] = useState(() => (params.get('id') ? Number(params.get('id')) : null));
  const { data, error, isLoading, mutate } = useSWR(`/warehouse/counts${variant ? `?detail=${variant}` : ''}`, api);
  const rows = useMemo(() => (data || []).filter((c) => !status || c.status === status), [data, status]);
  return (
    <>
      <Title
        title="Kiểm kê"
        subtitle={
          owner
            ? 'Ghi số hệ thống, số thực đếm, chênh lệch và lý do. Chủ cửa hàng xác nhận trực tiếp hoặc duyệt phiếu thành viên gửi.'
            : 'Lập phiếu kiểm kê và gửi chủ cửa hàng xác nhận. Phiếu chưa xác nhận không làm thay đổi tồn.'
        }
        action={
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" component={Link} to="/warehouse/inventory">
              Quay lại kho
            </Button>
            <Button variant="contained" onClick={() => setForm({ variant })}>
              Lập phiếu kiểm kê
            </Button>
          </Stack>
        }
      />
      <Metrics
        items={[
          ['Tổng số phiếu', (data || []).length, variant ? 'Có biến thể đang lọc' : 'Tất cả phiếu kiểm kê'],
          ['Nháp', (data || []).filter((c) => c.status === 'DRAFT').length, 'Chưa gửi / chưa xác nhận'],
          ['Chờ xác nhận', (data || []).filter((c) => c.status === 'PENDING_CONFIRMATION').length, 'Cần chủ cửa hàng duyệt'],
          ['Đã xác nhận', (data || []).filter((c) => c.status === 'CONFIRMED').length, 'Đã cập nhật tồn và lịch sử']
        ]}
      />
      <MainCard>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
          <TextField
            select
            size="small"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            sx={{ minWidth: 200 }}
            slotProps={{ select: { displayEmpty: true, inputProps: { 'aria-label': 'Trạng thái phiếu' } } }}
          >
            <MenuItem value="">Tất cả trạng thái</MenuItem>
            {['DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'CANCELLED'].map((s) => (
              <MenuItem key={s} value={s}>
                <Status value={s} />
              </MenuItem>
            ))}
          </TextField>
          {variant && (
            <Button
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete('variant');
                setParams(next, { replace: true });
              }}
            >
              Bỏ lọc biến thể #{variant}
            </Button>
          )}
        </Stack>
        {error ? (
          <Alert severity="error" action={<Button onClick={() => mutate()}>Thử lại</Button>}>
            {error.message}
          </Alert>
        ) : isLoading ? (
          <CircularProgress aria-label="Đang tải phiếu kiểm kê" />
        ) : (
          <DataTable
            rows={rows.map((c) => ({ ...c, _key: c.count_id }))}
            empty="Chưa có phiếu kiểm kê."
            onRow={(c) => setDetail(c.count_id)}
            columns={[
              { key: 'code', label: 'Mã phiếu', render: (c) => countCode(c.count_id) },
              { key: 'counted_at', label: 'Đếm lúc', render: (c) => when(c.counted_at) },
              { key: 'creator_name', label: 'Người lập' },
              { key: 'line_count', label: 'Số dòng', align: 'right', render: (c) => number(c.line_count) },
              { key: 'diff_lines', label: 'Dòng lệch', align: 'right', render: (c) => number(c.diff_lines) },
              {
                key: 'net_difference',
                label: 'Chênh lệch ròng',
                align: 'right',
                render: (c) => `${c.net_difference > 0 ? '+' : ''}${number(c.net_difference)}`
              },
              { key: 'status', label: 'Trạng thái', render: (c) => <Status value={c.status} /> },
              { key: 'confirmer_name', label: 'Người xác nhận', render: (c) => c.confirmer_name || '—' }
            ]}
          />
        )}
      </MainCard>
      {form && (
        <CountForm
          count={form.count}
          initialVariant={form.variant}
          onClose={() => setForm(null)}
          onSaved={(id) => {
            setForm(null);
            mutate();
            setDetail(id);
          }}
        />
      )}
      {detail && (
        <CountDetail
          id={detail}
          onClose={() => (setDetail(null), mutate())}
          onEdit={(c) => {
            setDetail(null);
            setForm({ count: c });
          }}
        />
      )}
    </>
  );
}
