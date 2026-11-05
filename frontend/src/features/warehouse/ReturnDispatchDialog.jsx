import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { api } from 'services/http';
import { useWarehouse } from './WarehouseContext';
import { docCode, locationLabel, number, variantLabel } from './model';

const UNASSIGNED = 'unassigned';

// Where each return line can be taken from: not-yet-placed stock and every location holding the variant.
const sourcesOf = (data, line) => {
  const variant = data.variants.find((v) => v.detail_id === line.detail_id);
  const list = [];
  if (Number(variant?.unassigned_quantity) > 0)
    list.push({ key: UNASSIGNED, locationId: null, label: 'Chưa xếp vị trí', available: Number(variant.unassigned_quantity) });
  data.locations
    .filter((l) => l.detail_id === line.detail_id && Number(l.quantity) > 0)
    .forEach((l) =>
      list.push({
        key: String(l.product_location_id),
        locationId: l.product_location_id,
        label: locationLabel(data, l.shelf_level_id),
        available: Number(l.quantity)
      })
    );
  return list;
};

// Suggestion only (same idea as before: unplaced stock first, then the fullest locations); the user edits it.
const suggest = (sources, quantity) => {
  let left = quantity;
  const result = {};
  [
    ...sources.filter((s) => s.key === UNASSIGNED),
    ...sources.filter((s) => s.key !== UNASSIGNED).sort((a, b) => b.available - a.available)
  ].forEach((s) => {
    const take = Math.min(left, s.available);
    result[s.key] = take ? String(take) : '';
    left -= take;
  });
  return result;
};

export default function ReturnDispatchDialog({ doc, onClose, onDone }) {
  const { data, run } = useWarehouse();
  const lines = doc.items.map((line) => ({ line, sources: sourcesOf(data, line) }));
  const [picks, setPicks] = useState(() =>
    Object.fromEntries(lines.map(({ line, sources }) => [line.receipt_item_id, suggest(sources, Number(line.quantity))]))
  );
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);

  const problems = lines.map(({ line, sources }) => {
    const values = picks[line.receipt_item_id] || {};
    const bad = sources.find((s) => {
      const v = values[s.key];
      return v !== '' && v !== undefined && (!Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > s.available);
    });
    if (bad) return `${bad.label}: số lấy phải là số nguyên từ 0 đến ${number(bad.available)}.`;
    const sum = sources.reduce((n, s) => n + Number(values[s.key] || 0), 0);
    if (sum !== Number(line.quantity)) return `Đã phân bổ ${number(sum)} / cần lấy ${number(line.quantity)}.`;
    return '';
  });
  const approved = doc.status === 'APPROVED';

  return (
    <Dialog open onClose={() => !waiting && onClose()} fullWidth maxWidth="md">
      <DialogTitle>
        {approved ? 'Xác nhận xuất trả' : 'Xác nhận và xuất trả'} {docCode(doc)}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Alert severity="info">
            Kho xuất trả: Kho cửa hàng. Kiểm tra vị trí lấy hàng và số lượng lấy ở từng vị trí theo hàng thực tế. Số điền sẵn chỉ là gợi ý,
            hãy sửa lại nếu lấy ở vị trí khác. Khi xác nhận, tổng tồn và tồn tại các vị trí đã chọn giảm ngay, phiếu không sửa được nữa.
          </Alert>
          {lines.map(({ line, sources }, index) => (
            <Stack key={line.receipt_item_id} spacing={1}>
              <Typography variant="subtitle1">
                {variantLabel(line)} · cần lấy {number(line.quantity)}
              </Typography>
              {!sources.length ? (
                <Alert severity="error">Không còn tồn ở vị trí nào cho biến thể này.</Alert>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Vị trí lấy hàng</TableCell>
                      <TableCell align="right">Đang có</TableCell>
                      <TableCell sx={{ width: 160 }}>Số lượng lấy</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sources.map((s) => (
                      <TableRow key={s.key}>
                        <TableCell>{s.label}</TableCell>
                        <TableCell align="right">{number(s.available)}</TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            type="number"
                            value={picks[line.receipt_item_id]?.[s.key] ?? ''}
                            onChange={(e) =>
                              setPicks((p) => ({ ...p, [line.receipt_item_id]: { ...p[line.receipt_item_id], [s.key]: e.target.value } }))
                            }
                            slotProps={{
                              htmlInput: {
                                min: 0,
                                max: s.available,
                                step: 1,
                                'aria-label': `Số lấy tại ${s.label} · ${variantLabel(line)}`
                              }
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {problems[index] && (
                <Typography variant="caption" color="error">
                  {problems[index]}
                </Typography>
              )}
            </Stack>
          ))}
          <Alert severity="warning">
            Xuất trả hàng không đồng nghĩa đã nhận hoàn tiền. Sau khi xuất trả, ghi nhận hoàn tiền, giảm công nợ, giữ tiền đối trừ hoặc nhận
            hàng đổi trong chi tiết phiếu.
          </Alert>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={waiting} onClick={onClose}>
          Quay lại
        </Button>
        <Button
          variant="contained"
          disabled={waiting || problems.some(Boolean)}
          onClick={async () => {
            setWaiting(true);
            setError('');
            try {
              const body = {
                picks: lines.flatMap(({ line, sources }) =>
                  sources
                    .filter((s) => Number(picks[line.receipt_item_id]?.[s.key] || 0) > 0)
                    .map((s) => ({
                      itemId: line.receipt_item_id,
                      locationId: s.locationId,
                      quantity: Number(picks[line.receipt_item_id][s.key])
                    }))
                )
              };
              const result = await run(
                () => api(`/warehouse/documents/${doc.receipt_id}/confirm`, { method: 'POST', body }),
                'Đã xuất trả hàng cho nhà cung cấp.'
              );
              onDone?.(result);
              onClose();
            } catch (e) {
              setError(e.message);
            } finally {
              setWaiting(false);
            }
          }}
        >
          {waiting ? 'Đang xử lý…' : approved ? 'Xác nhận xuất trả' : 'Xác nhận và xuất trả'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
