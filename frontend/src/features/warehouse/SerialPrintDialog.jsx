import { useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import useSWR from 'swr';
import { api } from 'services/http';
import BarcodePrintDialog from './BarcodePrintDialog';
import { number, unitLabel } from './model';

/** Ghi nhận các chiếc vừa in tem (để lọc "chưa in tem"). Lỗi ghi nhận không làm hỏng lần in. */
export const markPrinted = (items) =>
  api('/warehouse/units/printed', { method: 'POST', body: { unitIds: items.map((u) => u.unit_id) } }).catch(() => {});

/**
 * In tem serial cho các chiếc đang trong kho của một hay nhiều biến thể (mỗi chiếc một tem, dùng để
 * dán bù hàng cũ). Database chưa có bảng serial: quay về in tem mã biến thể như trước.
 */
export default function SerialPrintDialog({ variants, onClose, onPrinted }) {
  const [mode, setMode] = useState('unprinted');
  const ids = [...new Set(variants.map((v) => v.detail_id))];
  const qs = ids.map((id) => `detail=${id}`).join('&') + (mode === 'unprinted' ? '&unprinted=true' : '&status=IN_STOCK');
  const { data, error } = useSWR(`/warehouse/units?${qs}`, api, { revalidateOnFocus: false });

  if (error?.status === 503)
    return (
      <BarcodePrintDialog
        variants={variants}
        onClose={onClose}
        header={<Alert severity="info">Database chưa có serial từng chiếc nên đang in tem mã biến thể như trước.</Alert>}
      />
    );
  if (error || !data)
    return (
      <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>In tem serial</DialogTitle>
        <DialogContent>
          {error ? <Alert severity="error">{error.message}</Alert> : <CircularProgress aria-label="Đang tải mã" />}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Đóng</Button>
        </DialogActions>
      </Dialog>
    );

  const inStock = Number(data.counts?.IN_STOCK || 0);
  const header = (
    <>
      <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, m) => m && setMode(m)} aria-label="Chọn chiếc cần in">
        <ToggleButton value="unprinted">Chưa in tem ({number(data.unprinted)})</ToggleButton>
        <ToggleButton value="all">Tất cả trong kho ({number(inStock)})</ToggleButton>
      </ToggleButtonGroup>
      {data.truncated && <Alert severity="warning">Chỉ hiện 5.000 chiếc đầu. In xong đợt này rồi mở lại để in tiếp.</Alert>}
    </>
  );
  return (
    <BarcodePrintDialog
      key={mode}
      serial
      variants={data.units.map(unitLabel)}
      header={header}
      onClose={onClose}
      onPrinted={async (items) => {
        await markPrinted(items);
        onPrinted?.();
      }}
    />
  );
}
