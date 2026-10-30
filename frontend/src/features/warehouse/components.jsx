import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import MainCard from 'components/MainCard';
import { statusLabel, number } from './model';
import { api } from 'services/http';
import { useWarehouse } from './WarehouseContext';
export const active = (v) => Boolean(Number(v));
export function Status({ value }) {
  return (
    <Chip
      size="small"
      label={statusLabel[value] || value}
      color={
        ['CONFIRMED', 'AVAILABLE'].includes(value)
          ? 'success'
          : ['REJECTED', 'FULL'].includes(value)
            ? 'error'
            : ['PENDING_CONFIRMATION', 'MAINTENANCE'].includes(value)
              ? 'warning'
              : 'default'
      }
      variant="outlined"
    />
  );
}
export function Title({ title, subtitle, action }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', gap: 2, mb: 3 }}>
      <Box>
        <Typography variant="h3">{title}</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.75 }}>
          {subtitle}
        </Typography>
      </Box>
      {action && <Box>{action}</Box>}
    </Stack>
  );
}
export function Metrics({ items }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: `repeat(${items.length},1fr)` }, gap: 2, mb: 3 }}>
      {items.map(([title, val, hint]) => (
        <MainCard key={title} contentSX={{ p: 2.5 }}>
          <Typography color="text.secondary">{title}</Typography>
          <Typography variant="h2" sx={{ my: 1 }}>
            {number(val)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        </MainCard>
      ))}
    </Box>
  );
}
export function Field({ label, children, ...props }) {
  return (
    <Stack spacing={0.75}>
      <Typography component="label" htmlFor={props.id} variant="subtitle2">
        {label}
      </Typography>
      {children || <TextField size="small" fullWidth {...props} />}
    </Stack>
  );
}
export function Choice({ label, children, ...props }) {
  return (
    <Field label={label}>
      <TextField
        select
        size="small"
        fullWidth
        {...props}
        slotProps={{ select: { displayEmpty: true, inputProps: { 'aria-label': label } } }}
      >
        {children}
      </TextField>
    </Field>
  );
}
export function DataTable({ columns, rows, empty = 'Chưa có dữ liệu.', onRow }) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / size) - 1));
  return (
    <>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {columns.map((c) => (
                <TableCell key={c.key} align={c.align}>
                  {c.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {!rows.length ? (
              <TableRow>
                <TableCell colSpan={columns.length} sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              rows.slice(current * size, (current + 1) * size).map((row, index) => (
                <TableRow
                  hover
                  key={row._key ?? row.detail_id ?? row.receipt_id ?? index}
                  onClick={onRow ? () => onRow(row) : undefined}
                  sx={{ cursor: onRow ? 'pointer' : 'default' }}
                >
                  {columns.map((c) => (
                    <TableCell key={c.key} align={c.align}>
                      {c.render ? c.render(row) : row[c.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={rows.length}
        rowsPerPage={size}
        page={current}
        onPageChange={(_, p) => setPage(p)}
        onRowsPerPageChange={(e) => {
          setSize(Number(e.target.value));
          setPage(0);
        }}
        rowsPerPageOptions={[20, 50, 100]}
        labelRowsPerPage="Số dòng"
        labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
        getItemAriaLabel={(type) => (type === 'next' ? 'Trang sau' : 'Trang trước')}
      />
    </>
  );
}
export function PhotoPicker({ keys, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const { owner } = useWarehouse();
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Ảnh thực tế tại vị trí (JPG/PNG, tối đa 5 MB/ảnh)</Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        {keys.map((key) => (
          <Stack key={key}>
            <Box
              component="img"
              src={`/api/warehouse/photos/${key}`}
              alt="Ảnh vừa tải"
              sx={{ width: 100, height: 80, objectFit: 'cover', borderRadius: 1 }}
            />
            <Button size="small" onClick={() => onChange(keys.filter((k) => k !== key))}>
              Bỏ ảnh
            </Button>
          </Stack>
        ))}
      </Stack>
      <Button component="label" variant="outlined" disabled={!owner || uploading || keys.length >= 8}>
        {uploading ? 'Đang tải ảnh…' : 'Chọn ảnh'}
        <input
          hidden
          type="file"
          accept="image/jpeg,image/png"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setError('');
            if (file.size > 5 * 1024 * 1024) {
              setError('Ảnh tối đa 5 MB.');
              return;
            }
            setUploading(true);
            try {
              const form = new FormData();
              form.append('file', file);
              const result = await api('/warehouse/photos', { method: 'POST', form });
              onChange([...keys, result.key]);
            } catch (err) {
              setError(err.message);
            } finally {
              setUploading(false);
            }
          }}
        />
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
export function ActionDialog({ title, text, reason = false, onConfirm, onClose }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);
  return (
    <Dialog open onClose={() => !waiting && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2 }}>{text}</Typography>
        {reason && (
          <Field
            id="warehouse-reason"
            label="Lý do"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: 255 } }}
          />
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button disabled={waiting} onClick={onClose}>
          Quay lại
        </Button>
        <Button
          variant="contained"
          disabled={waiting || (reason && !value.trim())}
          onClick={async () => {
            setWaiting(true);
            try {
              await onConfirm(value);
              onClose();
            } catch (e) {
              setError(e.message);
            } finally {
              setWaiting(false);
            }
          }}
        >
          {waiting ? 'Đang xử lý…' : 'Xác nhận'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
