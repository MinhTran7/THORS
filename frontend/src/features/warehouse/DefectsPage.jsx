import { useState } from 'react';
import { Alert, Box, Button, Chip, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { CameraOutlined } from '@ant-design/icons';
import useSWR from 'swr';
import { api } from 'services/http';
import { useCrumbs } from 'layouts/crumbs';
import MainCard from 'components/MainCard';
import { useWarehouse } from './WarehouseContext';
import { ActionDialog, DataTable, PhotoPicker, Title } from './components';
import CameraScanDialog from './CameraScanDialog';
import useBarcodeScanner from './useBarcodeScanner';
import { defectSourceLabel, defectStatusColor, defectStatusLabel, docCode, unitStatusLabel, variantLabel, when } from './model';

const STATUSES = ['OPEN', 'FIXED', 'DISCARDED', 'RETURNED', 'SOLD'];

/** Biểu mẫu ghi lỗi cho chiếc vừa quét (lookup có `unit`). Chiếc đã có lỗi đang mở thì sửa lại lỗi đó. */
function ReportForm({ found, types, owner, onSaved, onCancel }) {
  const { unit, variant } = found;
  const open = Boolean(unit.defect_id);
  const [picked, setPicked] = useState(() => (open ? unit.defect_types.split(', ') : []));
  const [source, setSource] = useState((open && unit.defect_source) || 'SUPPLIER');
  const [description, setDescription] = useState((open && unit.defect_description) || '');
  const [extra, setExtra] = useState('');
  const [photos, setPhotos] = useState(() => (open && unit.defect_photo_keys ? unit.defect_photo_keys.split(',') : []));
  // Mẫu có sẵn + lỗi chủ cửa hàng vừa gõ thêm (lưu xong sẽ thành lựa chọn cho lần sau)
  const choices = [...types, ...picked.filter((p) => !types.includes(p))];
  const addExtra = () => {
    const name = extra.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const known = choices.find((c) => c.toLowerCase() === name.toLowerCase());
    setPicked((prev) => (prev.includes(known || name) ? prev : [...prev, known || name]));
    setExtra('');
  };
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (name) => setPicked((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/warehouse/defects', {
        method: 'POST',
        body: { serial: unit.serial_code, types: picked, description: description || null, source, photoKeys: photos }
      });
      onSaved(`Đã ghi lỗi cho chiếc ${unit.serial_code}. Tồn kho không đổi.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5">{variantLabel(variant)}</Typography>
        <Typography color="text.secondary">
          Chiếc <b style={{ fontFamily: 'monospace' }}>{unit.serial_code}</b> · {unitStatusLabel[unit.status]} ·{' '}
          {unit.location || 'chưa xếp vị trí'} ·{' '}
          {unit.in_receipt_id
            ? `nhập theo ${docCode({ receipt_type: 'RECEIPT', receipt_id: unit.in_receipt_id })}`
            : 'hàng tồn trước khi có serial'}
        </Typography>
      </Box>
      {open && (
        <Alert severity="warning">
          Chiếc này đang báo lỗi: {unit.defect_types}
          {unit.defect_reporter ? ` (${unit.defect_reporter}, ${when(unit.defect_reported_at)})` : ''}. Lưu lại sẽ cập nhật lỗi đó.
        </Alert>
      )}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Lỗi (chọn một hoặc nhiều)
        </Typography>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {choices.map((t) => (
            <Chip
              key={t}
              clickable
              label={t}
              color={picked.includes(t) ? 'error' : 'default'}
              variant={picked.includes(t) ? 'filled' : 'outlined'}
              onClick={() => toggle(t)}
              aria-pressed={picked.includes(t)}
            />
          ))}
        </Stack>
        {owner && (
          <Stack direction="row" spacing={1} sx={{ mt: 1, maxWidth: 420 }}>
            <TextField
              size="small"
              fullWidth
              label="Lỗi khác (chủ cửa hàng gõ thêm)"
              value={extra}
              onChange={(e) => setExtra(e.target.value.replace(/,/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addExtra())}
              slotProps={{ htmlInput: { maxLength: 60 } }}
            />
            <Button variant="outlined" disabled={!extra.trim()} onClick={addExtra}>
              Thêm
            </Button>
          </Stack>
        )}
      </Box>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Nguồn lỗi
        </Typography>
        <ToggleButtonGroup size="small" exclusive value={source} onChange={(_, v) => v && setSource(v)} aria-label="Nguồn lỗi">
          {Object.entries(defectSourceLabel).map(([k, label]) => (
            <ToggleButton key={k} value={k}>
              {label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      <TextField
        label="Mô tả thêm (không bắt buộc)"
        multiline
        minRows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        slotProps={{ htmlInput: { maxLength: 500 } }}
      />
      <PhotoPicker keys={photos} onChange={setPhotos} anyone title="Ảnh bằng chứng (JPG/PNG, tối đa 5 MB/ảnh)" />
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button onClick={onCancel} disabled={busy}>
          Bỏ qua
        </Button>
        <Button variant="contained" color="error" disabled={busy || !picked.length} onClick={save}>
          {busy ? 'Đang lưu…' : open ? 'Cập nhật lỗi' : 'Ghi lỗi'}
        </Button>
      </Stack>
    </Stack>
  );
}

/**
 * Bán hàng → Xử lý hàng lỗi: quét tem serial để ra đúng chiếc, ghi lỗi (chọn mẫu lỗi có sẵn, mô tả,
 * ảnh). Báo lỗi không trừ tồn; chiếc lỗi không bán được ở quầy. Tồn chỉ giảm khi trả NCC hoặc chủ
 * cửa hàng "Bỏ hẳn".
 */
export default function DefectsPage() {
  useCrumbs(['Bán hàng', 'Xử lý hàng lỗi']);
  const { owner } = useWarehouse();
  const [code, setCode] = useState('');
  const [found, setFound] = useState(null);
  const [notice, setNotice] = useState(null);
  const [camera, setCamera] = useState(false);
  const [status, setStatus] = useState('OPEN');
  const [q, setQ] = useState('');
  const [action, setAction] = useState(null);
  const typesSWR = useSWR('/warehouse/defect-types', api);
  const listKey = `/warehouse/defects?status=${status}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`;
  const { data, error, mutate } = useSWR(listKey, api, { keepPreviousData: true });

  const lookup = async (raw) => {
    const value = String(raw || '')
      .trim()
      .toUpperCase();
    if (!value) return { ok: false, message: 'Chưa đọc được mã.' };
    setCode('');
    setNotice(null);
    try {
      const result = await api(`/warehouse/barcodes/lookup?code=${encodeURIComponent(value)}`);
      if (!result.unit) throw new Error(`${value} là mã biến thể. Hãy quét tem serial của đúng chiếc bị lỗi (dạng ${value}-0001).`);
      if (result.unit.status !== 'IN_STOCK')
        throw new Error(
          `Chiếc ${result.unit.serial_code} không còn trong kho (${unitStatusLabel[result.unit.status] || result.unit.status}).`
        );
      setFound(result);
      return { ok: true, message: `Đã tìm thấy ${result.unit.serial_code}` };
    } catch (e) {
      setFound(null);
      setNotice({ severity: 'error', text: e.message });
      return { ok: false, message: e.message };
    }
  };
  useBarcodeScanner(lookup, !found && !camera && !action);

  const migration = typesSWR.error?.status === 503 ? typesSWR.error : error?.status === 503 ? error : null;
  const counts = data?.counts || {};

  return (
    <Stack spacing={3}>
      <Title
        title="Xử lý hàng lỗi"
        subtitle="Quét tem serial để ra đúng chiếc bị lỗi. Báo lỗi không trừ tồn; chiếc lỗi không bán được ở quầy cho tới khi sửa xong, trả nhà cung cấp hoặc bỏ hẳn."
      />
      {migration && <Alert severity="warning">{migration.message}</Alert>}
      <MainCard>
        {found ? (
          <ReportForm
            key={found.unit.serial_code}
            found={found}
            types={typesSWR.data || []}
            owner={owner}
            onCancel={() => setFound(null)}
            onSaved={(text) => {
              setFound(null);
              setNotice({ severity: 'success', text });
              mutate();
            }}
          />
        ) : (
          <Stack spacing={1.5}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                size="small"
                fullWidth
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    lookup(code);
                  }
                }}
                placeholder="Quét tem serial (máy quét dùng được ở bất kỳ đâu trên trang) hoặc gõ mã rồi Enter, ví dụ TH000051-0003"
                slotProps={{ htmlInput: { 'aria-label': 'Mã tem hàng lỗi', maxLength: 40 } }}
              />
              <Button variant="outlined" startIcon={<CameraOutlined />} onClick={() => setCamera(true)}>
                Camera
              </Button>
            </Stack>
            {notice && (
              <Alert severity={notice.severity} onClose={() => setNotice(null)}>
                {notice.text}
              </Alert>
            )}
          </Stack>
        )}
      </MainCard>

      <MainCard>
        <Stack spacing={1.5}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ justifyContent: 'space-between' }}>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
              {STATUSES.map((s) => (
                <Chip
                  key={s}
                  clickable
                  color={status === s ? 'primary' : 'default'}
                  variant={status === s ? 'filled' : 'outlined'}
                  label={`${defectStatusLabel[s]} (${counts[s] || 0})`}
                  onClick={() => setStatus(s)}
                />
              ))}
              <Chip
                clickable
                color={status === 'ALL' ? 'primary' : 'default'}
                variant={status === 'ALL' ? 'filled' : 'outlined'}
                label="Tất cả"
                onClick={() => setStatus('ALL')}
              />
            </Stack>
            <TextField
              size="small"
              placeholder="Tìm mã serial / tên sản phẩm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              sx={{ minWidth: 260 }}
            />
          </Stack>
          {error && !migration && <Alert severity="error">{error.message}</Alert>}
          <DataTable
            rows={(data?.items || []).map((d) => ({ ...d, _key: d.defect_id }))}
            empty="Không có chiếc hàng lỗi nào."
            columns={[
              {
                key: 'serial_code',
                label: 'Mã serial',
                render: (d) => <Typography sx={{ fontFamily: 'monospace' }}>{d.serial_code}</Typography>
              },
              { key: 'product', label: 'Sản phẩm · màu · size', render: variantLabel },
              {
                key: 'types',
                label: 'Lỗi',
                render: (d) => (
                  <Stack spacing={0.5}>
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                      {d.types.map((t) => (
                        <Chip key={t} size="small" color="error" variant="outlined" label={t} />
                      ))}
                    </Stack>
                    {d.description && (
                      <Typography variant="caption" color="text.secondary">
                        {d.description}
                      </Typography>
                    )}
                  </Stack>
                )
              },
              { key: 'source', label: 'Nguồn', render: (d) => defectSourceLabel[d.source] || d.source },
              {
                key: 'where',
                label: 'Vị trí',
                render: (d) => (d.unit_status === 'IN_STOCK' ? d.location || 'Chưa xếp' : unitStatusLabel[d.unit_status] || '—')
              },
              {
                key: 'photos',
                label: 'Ảnh',
                render: (d) =>
                  d.photo_keys.length ? (
                    <Stack direction="row" spacing={0.5}>
                      {d.photo_keys.map((k) => (
                        <a key={k} href={`/api/warehouse/photos/${k}`} target="_blank" rel="noreferrer">
                          <Box
                            component="img"
                            src={`/api/warehouse/photos/${k}`}
                            alt="Ảnh lỗi"
                            sx={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 0.5 }}
                          />
                        </a>
                      ))}
                    </Stack>
                  ) : (
                    '—'
                  )
              },
              {
                key: 'reported',
                label: 'Người ghi',
                render: (d) => (
                  <Typography variant="body2">
                    {d.reporter_name || '—'}
                    <br />
                    <Typography component="span" variant="caption" color="text.secondary">
                      {when(d.reported_at)}
                    </Typography>
                  </Typography>
                )
              },
              {
                key: 'status',
                label: 'Xử lý',
                align: 'right',
                render: (d) =>
                  d.status === 'OPEN' ? (
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                      <Button size="small" variant="outlined" onClick={() => setAction({ kind: 'fix', d })}>
                        Sửa xong
                      </Button>
                      {owner && (
                        <Button size="small" color="error" onClick={() => setAction({ kind: 'discard', d })}>
                          Bỏ hẳn
                        </Button>
                      )}
                    </Stack>
                  ) : (
                    <Stack spacing={0.25} sx={{ alignItems: 'flex-end' }}>
                      <Chip size="small" variant="outlined" color={defectStatusColor[d.status]} label={defectStatusLabel[d.status]} />
                      <Typography variant="caption" color="text.secondary">
                        {[d.resolver_name, when(d.resolved_at)].filter(Boolean).join(' · ')}
                        {d.resolve_note ? ` · ${d.resolve_note}` : ''}
                      </Typography>
                    </Stack>
                  )
              }
            ]}
          />
          <Typography variant="caption" color="text.secondary">
            Trả nhà cung cấp: lập phiếu trả như bình thường; khi xuất trả, hệ thống lấy chiếc đang lỗi của biến thể đó trước.
          </Typography>
        </Stack>
      </MainCard>

      {camera && <CameraScanDialog title="Quét tem chiếc hàng lỗi" onDetected={lookup} onClose={() => setCamera(false)} />}
      {action && (
        <ActionDialog
          title={action.kind === 'fix' ? `Sửa xong ${action.d.serial_code}` : `Bỏ hẳn ${action.d.serial_code}`}
          text={
            action.kind === 'fix'
              ? 'Chiếc này đã sửa xong và bán lại được. Tồn kho không đổi.'
              : `${variantLabel(action.d)}: tồn kho giảm 1, chiếc này chuyển thành Mất / hỏng. Không hoàn tác được.`
          }
          reason={action.kind === 'discard'}
          onClose={() => setAction(null)}
          onConfirm={async (note) => {
            await api(`/warehouse/defects/${action.d.defect_id}/${action.kind}`, { method: 'POST', body: { note: note || null } });
            setNotice({
              severity: 'success',
              text: action.kind === 'fix' ? `${action.d.serial_code} đã sửa xong.` : `Đã bỏ ${action.d.serial_code}, tồn giảm 1.`
            });
            mutate();
          }}
        />
      )}
    </Stack>
  );
}
