import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { barcodeSvg, printLabels, validateLabelQuantities } from './barcodeLabels';
import { number, variantLabel } from './model';

function BarcodePreview({ variant }) {
  const svg = useMemo(() => {
    if (!variant.barcode) return '';
    try {
      return barcodeSvg(variant.barcode);
    } catch {
      return '';
    }
  }, [variant.barcode]);
  return (
    <Box
      sx={{
        width: '50mm',
        height: '30mm',
        p: '1.5mm',
        boxSizing: 'border-box',
        bgcolor: '#fff',
        color: '#000',
        outline: '1px solid #ddd',
        overflow: 'hidden'
      }}
    >
      <Box sx={{ height: '7mm', font: 'bold 9pt/1.1 Arial', overflow: 'hidden' }}>{variant.product_name}</Box>
      <Box sx={{ height: '3.5mm', font: '8pt/3.5mm Arial', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {variant.color} · Size {variant.size}
      </Box>
      {svg ? (
        <Box sx={{ '& svg': { display: 'block', width: '100%', height: '16mm' } }} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <Typography color="error">Chưa có mã hợp lệ</Typography>
      )}
    </Box>
  );
}

export default function BarcodePrintDialog({ variants, onClose }) {
  const [quantities, setQuantities] = useState(() => Object.fromEntries(variants.map((variant) => [variant.detail_id, 1])));
  const [format, setFormat] = useState('a4');
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState(false);
  let validation = '';
  let total = 0;
  try {
    total = validateLabelQuantities(variants, quantities);
  } catch (err) {
    validation = err.message;
  }
  return (
    <Dialog open onClose={() => !printing && onClose()} fullWidth maxWidth="md">
      <DialogTitle>In mã vạch</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography>Chọn số tem cho từng biến thể. Các sản phẩm cùng màu/size dùng chung mã.</Typography>
          {variants.map((variant) => (
            <Stack key={variant.detail_id} direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2">{variantLabel(variant)}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {variant.barcode || 'Chưa có mã vạch'} · Tồn kho: {number(variant.stock_quantity)}
                </Typography>
              </Box>
              <TextField
                label={`Số tem #${variant.detail_id}`}
                type="number"
                size="small"
                value={quantities[variant.detail_id]}
                onChange={(event) => setQuantities((previous) => ({ ...previous, [variant.detail_id]: event.target.value }))}
                slotProps={{ htmlInput: { min: 1, step: 1 } }}
                sx={{ width: { xs: '100%', sm: 150 } }}
              />
            </Stack>
          ))}
          <TextField select label="Khổ giấy" size="small" value={format} onChange={(event) => setFormat(event.target.value)}>
            <MenuItem value="a4">Giấy A4 — tem 50 × 30 mm</MenuItem>
            <MenuItem value="roll">Tem cuộn — 50 × 30 mm</MenuItem>
          </TextField>
          <Typography color="text.secondary">
            In ở tỷ lệ 100%, tắt đầu/chân trang. Có thể chọn “Lưu dưới dạng PDF” trong hộp thoại in.
          </Typography>
          <Typography variant="subtitle2">Xem trước mẫu tem — mỗi biến thể một mẫu</Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', p: 1, bgcolor: 'grey.100' }}>
            {variants.map((variant) => (
              <BarcodePreview key={variant.detail_id} variant={variant} />
            ))}
          </Box>
          {(validation || error) && <Alert severity="error">{validation || error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Typography sx={{ mr: 'auto', ml: 2 }}>Tổng: {number(total)} tem</Typography>
        <Button disabled={printing} onClick={onClose}>
          Đóng
        </Button>
        <Button
          variant="contained"
          disabled={Boolean(validation) || printing}
          onClick={async () => {
            setError('');
            setPrinting(true);
            try {
              await printLabels(variants, quantities, format);
            } catch (err) {
              setError(err.message);
            } finally {
              setPrinting(false);
            }
          }}
        >
          {printing ? 'Đang mở bản in…' : 'In / Lưu PDF'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
