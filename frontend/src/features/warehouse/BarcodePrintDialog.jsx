import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { CloseOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';
import {
  DEFAULT_LABEL_OPTIONS,
  downloadLabelsPdf,
  LABEL_TEMPLATES,
  MAX_LABELS,
  previewDocument,
  printLabels,
  templateOf,
  validateLabelQuantities
} from './barcodeLabels';
import { number, skuLabel } from './model';

const STORAGE_KEY = 'thors.labelOptions';

function loadOptions() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    const merged = { ...DEFAULT_LABEL_OPTIONS, ...saved };
    if (!LABEL_TEMPLATES[merged.template]) merged.template = DEFAULT_LABEL_OPTIONS.template;
    return merged;
  } catch {
    return { ...DEFAULT_LABEL_OPTIONS };
  }
}

function saveOptions(options) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
  } catch {
    /* Private mode / blocked storage: settings just are not remembered. */
  }
}

const unassigned = (v) => Math.max(0, Number(v.unassigned_quantity) || 0);
const stock = (v) => Math.max(0, Number(v.stock_quantity) || 0);

/** Goods just received sit in "chưa xếp vị trí" until labelled and shelved, so that is the natural default. */
const defaultQuantity = (v) => unassigned(v) || 1;

const FILL_MODES = [
  ['one', 'Mỗi mã 1 tem', () => 1],
  ['unassigned', 'Theo hàng chưa xếp', (v) => unassigned(v)],
  ['stock', 'Theo tổng tồn', (v) => stock(v)]
];

const SHOW_FIELDS = [
  ['showName', 'Tên sản phẩm'],
  ['showVariant', 'Màu / Size'],
  ['showPrice', 'Giá bán'],
  ['showCode', 'Mã số dưới vạch'],
  ['showShop', 'Tên cửa hàng']
];

/**
 * Print barcode labels for one or more variants. Variants without a code are listed but not printed
 * (the owner creates codes on the Tồn kho page first). Template and display options are remembered
 * per browser.
 */
export default function BarcodePrintDialog({ variants, onClose }) {
  const [items, setItems] = useState(() => variants.filter((v) => v.barcode));
  const missing = useMemo(() => variants.filter((v) => !v.barcode), [variants]);
  const [quantities, setQuantities] = useState(() => Object.fromEntries(variants.map((v) => [v.detail_id, defaultQuantity(v)])));
  const [options, setOptionsState] = useState(loadOptions);
  const [error, setError] = useState('');
  // '' | 'print' | 'pdf' — which action is running.
  const [busyAction, setBusyAction] = useState('');
  const printing = Boolean(busyAction);

  const setOptions = (patch) =>
    setOptionsState((previous) => {
      const next = { ...previous, ...patch };
      saveOptions(next);
      return next;
    });
  const setQuantity = (id, value) => setQuantities((previous) => ({ ...previous, [id]: value }));
  const step = (id, delta) => setQuantity(id, Math.max(1, (Number.parseInt(quantities[id], 10) || 0) + delta));
  const fill = (fn) => {
    const zero = items.filter((v) => fn(v) < 1);
    setQuantities((previous) => ({ ...previous, ...Object.fromEntries(items.map((v) => [v.detail_id, Math.max(1, fn(v))])) }));
    setError(zero.length ? `${number(zero.length)} biến thể có số lượng 0 nên được đặt 1 tem. Bỏ dòng đó nếu không cần in.` : '');
  };

  let validation = '';
  let total = 0;
  try {
    total = validateLabelQuantities(items, quantities);
  } catch (err) {
    validation = err.message;
  }
  const template = templateOf(options.template);
  const sheets = template.kind === 'roll' ? Math.ceil(total / template.cols) : 0;
  const preview = useMemo(() => previewDocument(items, options), [items, options]);
  const previewHeight = Math.min(
    260,
    28 + Math.ceil(items.length / Math.max(1, Math.floor(700 / (template.w * 3.8 + 12)))) * (template.h * 3.8 + 12)
  );

  const runAction = async (action, fn) => {
    setError('');
    setBusyAction(action);
    try {
      await fn(items, quantities, options);
    } catch (err) {
      setError(err.message || 'Không tạo được bản in. Vui lòng thử lại.');
    } finally {
      setBusyAction('');
    }
  };

  return (
    <Dialog open onClose={() => !printing && onClose()} fullWidth maxWidth="md">
      <DialogTitle>In tem mã vạch</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          {missing.length > 0 && (
            <Alert severity="warning">
              {number(missing.length)} biến thể chưa có mã vạch nên sẽ không được in:{' '}
              {missing.map((v) => `${v.product_name} · ${v.color} · ${v.size}`).join('; ')}. Chủ cửa hàng bấm “Tạo mã còn thiếu” ở trang Tồn
              kho trước.
            </Alert>
          )}

          <Box>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              sx={{ mb: 1, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
            >
              <Typography variant="subtitle1">1. Số lượng tem</Typography>
              <ButtonGroup size="small" variant="outlined" disabled={!items.length}>
                {FILL_MODES.map(([key, label, fn]) => (
                  <Button key={key} onClick={() => fill(fn)}>
                    {label}
                  </Button>
                ))}
              </ButtonGroup>
            </Stack>
            {items.length ? (
              <Box sx={{ overflowX: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Hàng hóa</TableCell>
                      <TableCell>Mã vạch</TableCell>
                      <TableCell align="right">Tồn / Chưa xếp</TableCell>
                      <TableCell align="center" sx={{ width: 170 }}>
                        Số tem
                      </TableCell>
                      <TableCell sx={{ width: 40 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((v) => (
                      <TableRow key={v.detail_id}>
                        <TableCell>
                          <Typography variant="subtitle2">{v.product_name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {v.color} · Size {v.size} · {skuLabel(v)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{v.barcode}</TableCell>
                        <TableCell align="right">
                          {number(stock(v))} / {number(unassigned(v))}
                        </TableCell>
                        <TableCell align="center">
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'center' }}>
                            <IconButton size="small" aria-label={`Bớt 1 tem ${v.barcode}`} onClick={() => step(v.detail_id, -1)}>
                              <MinusOutlined />
                            </IconButton>
                            <TextField
                              size="small"
                              type="number"
                              value={quantities[v.detail_id]}
                              onChange={(e) => setQuantity(v.detail_id, e.target.value)}
                              onFocus={(e) => e.target.select()}
                              slotProps={{
                                htmlInput: {
                                  min: 1,
                                  max: MAX_LABELS,
                                  step: 1,
                                  'aria-label': `Số tem ${v.barcode}`,
                                  style: { textAlign: 'center' }
                                }
                              }}
                              sx={{ width: 80 }}
                            />
                            <IconButton size="small" aria-label={`Thêm 1 tem ${v.barcode}`} onClick={() => step(v.detail_id, 1)}>
                              <PlusOutlined />
                            </IconButton>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          {items.length > 1 && (
                            <Tooltip title="Bỏ khỏi lần in này">
                              <IconButton
                                size="small"
                                aria-label={`Bỏ ${v.barcode}`}
                                onClick={() => setItems((previous) => previous.filter((x) => x.detail_id !== v.detail_id))}
                              >
                                <CloseOutlined />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            ) : (
              <Alert severity="info">Không có biến thể nào có mã vạch để in.</Alert>
            )}
          </Box>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                2. Khổ giấy / mẫu tem
              </Typography>
              <TextField
                select
                fullWidth
                size="small"
                label="Mẫu tem"
                value={options.template}
                onChange={(e) => setOptions({ template: e.target.value })}
              >
                {Object.entries(LABEL_TEMPLATES).map(([key, t]) => (
                  <MenuItem key={key} value={key}>
                    {t.name}
                  </MenuItem>
                ))}
              </TextField>
              {template.kind === 'a4' && (
                <FormControlLabel
                  sx={{ mt: 0.5 }}
                  control={
                    <Checkbox
                      size="small"
                      checked={Boolean(options.cutLines)}
                      onChange={(e) => setOptions({ cutLines: e.target.checked })}
                    />
                  }
                  label="Kẻ khung cắt quanh từng tem (file PDF)"
                />
              )}
              <Alert severity="info" icon={false} sx={{ mt: 1, '& .MuiAlert-message': { fontSize: 13 } }}>
                <b>Có máy in tem:</b> bấm “In ngay”, chọn máy in, tỷ lệ 100%, lề “Không”, tắt đầu/chân trang.
                <br />
                <b>Chưa có máy in:</b> bấm “Tải file PDF” rồi gửi tiệm in, in lên giấy decal (A4 decal hoặc tem cuộn đúng khổ) để bóc dán.
                Dặn tiệm in ở tỷ lệ 100%, không co giãn.
              </Alert>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
                3. Thông tin trên tem
              </Typography>
              <FormGroup row>
                {SHOW_FIELDS.map(([key, label]) => (
                  <FormControlLabel
                    key={key}
                    sx={{ width: { sm: '50%' }, mr: 0 }}
                    control={
                      <Checkbox size="small" checked={Boolean(options[key])} onChange={(e) => setOptions({ [key]: e.target.checked })} />
                    }
                    label={label}
                  />
                ))}
              </FormGroup>
              {options.showShop && (
                <TextField
                  size="small"
                  fullWidth
                  label="Tên cửa hàng in trên tem"
                  value={options.shopName}
                  onChange={(e) => setOptions({ shopName: e.target.value.slice(0, 40) })}
                  sx={{ mt: 1 }}
                />
              )}
            </Box>
          </Stack>

          {items.length > 0 && (
            <Box>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                Xem trước (kích thước thật, mỗi biến thể một mẫu)
              </Typography>
              <Box
                component="iframe"
                title="Xem trước tem"
                srcDoc={preview}
                sx={{ width: '100%', height: previewHeight, border: 1, borderColor: 'divider', borderRadius: 1, display: 'block' }}
              />
            </Box>
          )}
          {(validation || error) && <Alert severity={validation ? 'error' : 'info'}>{validation || error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Typography sx={{ mr: 'auto' }}>
          Tổng: <b>{number(total)}</b> tem
          {sheets > 0 && template.cols > 1 && (
            <Typography component="span" color="text.secondary">
              {' '}
              · {number(sheets)} hàng tem
            </Typography>
          )}
          {template.kind === 'a4' && total > 0 && (
            <Typography component="span" color="text.secondary">
              {' '}
              · khoảng {number(Math.ceil(total / (template.cols * Math.floor((297 - 20) / (template.h + template.gap)))))} trang A4
            </Typography>
          )}
        </Typography>
        <Button disabled={printing} onClick={onClose}>
          Đóng
        </Button>
        <Button variant="outlined" disabled={Boolean(validation) || printing} onClick={() => runAction('pdf', downloadLabelsPdf)}>
          {busyAction === 'pdf' ? 'Đang tạo file…' : 'Tải file PDF'}
        </Button>
        <Button variant="contained" disabled={Boolean(validation) || printing} onClick={() => runAction('print', printLabels)}>
          {busyAction === 'print' ? 'Đang mở bản in…' : `In ngay ${number(total)} tem`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
