import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { getProducts } from 'services/productService';
import { C, cardSx, outlineButtonSx, primaryButtonSx } from 'features/customer/theme';
import { applySizeChartToCategory, copySizeChart, getSizeChart, getStandardSizeChart, saveSizeChart } from './api';

// Các cặp số đo trong bảng size (khớp cột product_size_chart)
// Quần áo: số đo cơ thể; giày dép: chiều dài bàn chân
const BODY_MEASURES = [
  { key: 'height', label: 'Chiều cao', unit: 'cm' },
  { key: 'weight', label: 'Cân nặng', unit: 'kg' },
  { key: 'chest', label: 'Vòng ngực', unit: 'cm' },
  { key: 'waist', label: 'Vòng eo', unit: 'cm' },
  { key: 'hip', label: 'Vòng hông', unit: 'cm' }
];
const FOOT_MEASURES = [{ key: 'foot', label: 'Chiều dài bàn chân', unit: 'cm' }];
const MEASURES = [...BODY_MEASURES, ...FOOT_MEASURES];

const cellInputSx = {
  width: 54,
  '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: '#FAFDFD' },
  '& input': { p: '6px 6px', fontSize: 13, textAlign: 'center' }
};

// Một dòng rỗng cho size chưa có số đo
const emptyRow = (size) => ({
  sizeLabel: size,
  ...Object.fromEntries(
    MEASURES.flatMap((m) => [
      [`${m.key}Min`, ''],
      [`${m.key}Max`, '']
    ])
  )
});
const toNumber = (v) => (String(v ?? '').trim() === '' ? null : Number(String(v).replace(',', '.')));

/**
 * Bảng size của sản phẩm (trang chi tiết sản phẩm, phía quản trị).
 * Mỗi size đang bán là một dòng; mỗi số đo nhập "từ - đến". Bỏ trống cả cặp = size đó không quy định số đo này.
 * Dùng cho "Gợi ý size" trên trang cửa hàng.
 */
export default function SizeChartEditor({ productId, sizes, canEdit }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [products, setProducts] = useState([]);
  const [copyFrom, setCopyFrom] = useState(null);
  // Bảng size chuẩn tính theo danh mục: { kind: TOP|DRESS|BOTTOM|SHOES|NONE, rows }
  const [standard, setStandard] = useState(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [manual, setManual] = useState(false); // giày dép / hàng không cần size: vẫn muốn nhập tay
  const [confirmApply, setConfirmApply] = useState(false);

  const sizeKey = sizes.join('|');

  // Một dòng nguồn (đã lưu / bảng chuẩn) -> dòng trong form (ô trống = '')
  const toFormRow = (size, source) =>
    source ? Object.fromEntries(Object.entries(emptyRow(size)).map(([k, v]) => [k, source[k] ?? v])) : emptyRow(size);

  // Ghép dữ liệu đã lưu vào danh sách size hiện có của sản phẩm (size mới thêm -> dòng trống)
  const fill = (saved) => {
    const bySize = Object.fromEntries((saved || []).map((r) => [r.sizeLabel, r]));
    setRows(sizes.map((s) => toFormRow(s, bySize[s])));
    setHasSaved(Boolean(saved?.length));
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getSizeChart(productId)
        .then(fill)
        .catch((e) => {
          fill([]);
          setMessage({ type: 'error', text: e.message });
        }),
      getStandardSizeChart(productId)
        .then(setStandard)
        .catch(() => setStandard(null))
    ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, sizeKey]);

  // Điền theo bảng chuẩn (chưa lưu): chỉ ghi đè các size tra được, size khác giữ nguyên
  const fillStandard = () => {
    const bySize = Object.fromEntries(standard.rows.map((r) => [r.sizeLabel, r]));
    setRows((list) => list.map((r) => (bySize[r.sizeLabel] ? toFormRow(r.sizeLabel, bySize[r.sizeLabel]) : r)));
    setMessage({ type: 'success', text: 'Đã điền theo bảng size chuẩn. Kiểm tra lại cho đúng hàng của shop rồi bấm "Lưu bảng size".' });
  };

  const applyToCategory = async () => {
    setConfirmApply(false);
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const { updated } = await applySizeChartToCategory(productId);
      setMessage({ type: 'success', text: `Đã áp dụng bảng size cho ${updated} sản phẩm cùng danh mục.` });
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Không áp dụng được.' });
    } finally {
      setSaving(false);
    }
  };

  // Giày dép / balo, túi... không dùng số đo cơ thể: ẩn bảng (trừ khi đã có bảng lưu sẵn hoặc Owner muốn nhập tay)
  const noBodySize = standard?.kind === 'NONE' && !hasSaved && !manual;
  // Cột hiển thị theo loại hàng: giày dép chỉ có chiều dài bàn chân
  const shoes = standard?.kind === 'SHOES';
  const shownMeasures = shoes ? FOOT_MEASURES : BODY_MEASURES;

  useEffect(() => {
    if (!canEdit) return;
    getProducts()
      .then((list) => setProducts(Array.isArray(list) ? list.filter((p) => p.productId !== Number(productId)) : []))
      .catch(() => setProducts([]));
  }, [canEdit, productId]);

  const filled = useMemo(() => rows.filter((r) => MEASURES.some((m) => r[`${m.key}Min`] !== '' || r[`${m.key}Max`] !== '')), [rows]);

  const set = (size, field, value) => {
    setRows((list) => list.map((r) => (r.sizeLabel === size ? { ...r, [field]: value.replace(/[^\d.,]/g, '') } : r)));
    setMessage({ type: '', text: '' });
  };

  const run = async (work, success) => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      fill(await work());
      setMessage({ type: 'success', text: success });
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Không lưu được bảng size.' });
    } finally {
      setSaving(false);
    }
  };

  const save = () =>
    run(
      () =>
        saveSizeChart(
          productId,
          filled.map((r) => ({
            sizeLabel: r.sizeLabel,
            ...Object.fromEntries(
              MEASURES.flatMap((m) => [
                [`${m.key}Min`, toNumber(r[`${m.key}Min`])],
                [`${m.key}Max`, toNumber(r[`${m.key}Max`])]
              ])
            )
          }))
        ),
      filled.length ? 'Đã lưu bảng size.' : 'Đã xóa bảng size.'
    );

  const copy = () => run(() => copySizeChart(productId, copyFrom.productId), `Đã sao chép bảng size từ "${copyFrom.productName}".`);

  return (
    <Card sx={{ ...cardSx, p: { xs: 2.5, sm: 3.5 }, mt: 2.5 }}>
      <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Bảng size</Typography>
      {/* Hàng không cần size: chỉ hiện dòng giải thích bên dưới, không cần mô tả cách nhập */}
      {!noBodySize && (
        <Typography sx={{ fontSize: 13, color: C.muted, mt: 0.5, mb: 2 }}>
          {shoes ? (
            <>
              <strong>Chiều dài bàn chân</strong> phù hợp với từng size giày (từ - đến, cm). Dùng để gợi ý size giày cho khách trên cửa
              hàng.
            </>
          ) : (
            <>
              Số đo <strong>cơ thể</strong> phù hợp với từng size (từ - đến). Dùng để gợi ý size cho khách trên cửa hàng. Bỏ trống số đo
              không áp dụng (vd. áo không cần vòng hông).
            </>
          )}
        </Typography>
      )}

      {loading ? (
        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={28} sx={{ color: C.cyan }} />
        </Box>
      ) : sizes.length === 0 ? (
        <Typography sx={{ fontSize: 13.5, color: C.muted }}>Sản phẩm chưa có biến thể nào.</Typography>
      ) : noBodySize ? (
        <Typography sx={{ fontSize: 13.5, color: C.muted }}>
          Loại hàng này (balo, túi, ví, phụ kiện…) không cần bảng size theo số đo cơ thể.{' '}
          {canEdit && (
            <Button size="small" onClick={() => setManual(true)} sx={{ textTransform: 'none', fontWeight: 700 }}>
              Vẫn nhập bảng size
            </Button>
          )}
        </Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ '& th': { fontSize: 12, fontWeight: 700, color: C.muted, whiteSpace: 'nowrap' } }}>
            <TableHead>
              <TableRow>
                <TableCell>SIZE</TableCell>
                {shownMeasures.map((m) => (
                  <TableCell key={m.key} align="center">
                    {m.label.toUpperCase()} ({m.unit})
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.sizeLabel}>
                  <TableCell sx={{ fontWeight: 800 }}>{r.sizeLabel}</TableCell>
                  {shownMeasures.map((m) => (
                    <TableCell key={m.key} align="center" sx={{ whiteSpace: 'nowrap' }}>
                      <TextField
                        size="small"
                        value={r[`${m.key}Min`]}
                        onChange={(e) => set(r.sizeLabel, `${m.key}Min`, e.target.value)}
                        disabled={!canEdit || saving}
                        placeholder="từ"
                        autoComplete="off"
                        sx={cellInputSx}
                        slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 5 } }}
                      />
                      <Box component="span" sx={{ mx: 0.5, color: C.muted }}>
                        –
                      </Box>
                      <TextField
                        size="small"
                        value={r[`${m.key}Max`]}
                        onChange={(e) => set(r.sizeLabel, `${m.key}Max`, e.target.value)}
                        disabled={!canEdit || saving}
                        placeholder="đến"
                        autoComplete="off"
                        sx={cellInputSx}
                        slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 5 } }}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {message.text && (
        <Typography sx={{ mt: 2, fontSize: 13.5, fontWeight: 600, color: message.type === 'error' ? C.error : C.teal }}>
          {message.text}
        </Typography>
      )}

      {canEdit && sizes.length > 0 && !noBodySize && (
        <Box sx={{ display: 'flex', gap: 1.5, mt: 2.5, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Điền nhanh: bảng size chuẩn theo danh mục (áo / quần / váy, nam / nữ) */}
          {standard?.rows?.length > 0 && (
            <Button onClick={fillStandard} disabled={saving || loading} sx={outlineButtonSx}>
              Điền theo bảng size chuẩn
            </Button>
          )}
          <Button onClick={save} disabled={saving || loading} sx={primaryButtonSx}>
            {saving ? 'Đang lưu…' : 'Lưu bảng size'}
          </Button>
          {hasSaved && (
            <Button onClick={() => setConfirmApply(true)} disabled={saving} sx={outlineButtonSx}>
              Áp dụng cho cả danh mục
            </Button>
          )}
        </Box>
      )}

      {canEdit && sizes.length > 0 && !noBodySize && (
        <Box sx={{ display: 'flex', gap: 1.5, mt: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <Autocomplete
            size="small"
            options={products}
            value={copyFrom}
            onChange={(_, v) => setCopyFrom(v)}
            getOptionLabel={(p) => p.productName || ''}
            isOptionEqualToValue={(a, b) => a.productId === b.productId}
            sx={{ minWidth: 240, flex: '1 1 240px', maxWidth: 360 }}
            renderInput={(params) => <TextField {...params} placeholder="Sao chép từ sản phẩm khác…" />}
          />
          <Button onClick={copy} disabled={!copyFrom || saving} sx={outlineButtonSx}>
            Sao chép
          </Button>
        </Box>
      )}

      <Dialog open={confirmApply} onClose={() => setConfirmApply(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Áp dụng cho cả danh mục?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: C.muted }}>
            Bảng size đã lưu của sản phẩm này sẽ được dùng cho mọi sản phẩm khác cùng danh mục (mỗi sản phẩm nhận các size nó đang có). Bảng
            size cũ của các sản phẩm đó sẽ bị thay thế.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConfirmApply(false)} sx={outlineButtonSx}>
            Quay lại
          </Button>
          <Button onClick={applyToCategory} sx={primaryButtonSx}>
            Áp dụng
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
