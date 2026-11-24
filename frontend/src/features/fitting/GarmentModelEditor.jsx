import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Slider,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import { C, cardSx, outlineButtonSx, primaryButtonSx } from 'features/customer/theme';
import { deleteGarmentModel, getGarmentModel, saveGarmentModel, setGarmentModelActive, SLOT_OPTIONS } from './garmentApi';
import { readGlbInfo } from './glbInfo';

// Thư viện 3D chỉ tải khi trang có khung này
const AvatarViewer = lazy(() => import('./avatar/AvatarViewer'));

const GENDER_OPTIONS = [
  ['FEMALE', 'Người mẫu nữ'],
  ['MALE', 'Người mẫu nam']
];

// Gợi ý mức size theo tên size (áo dựng gốc ở cỡ M): âm = thu nhỏ (Size_down), dương = nới rộng (Size_up)
// (núm Size_down = 1 nhỏ đi ~3-5 cm vòng ngực, Size_up = 1 rộng thêm ~7-10 cm: size lớn hơn XL dùng hết mức)
const SIZE_GUESS = { XXS: -1, XS: -1, S: -1, M: 0, L: 0.5, XL: 1, XXL: 1, XXXL: 1, XXXXL: 1, FREE: 0, F: 0, FREESIZE: 0 };
// "2XL" = "XXL", "3XL" = "XXXL"...; bỏ khoảng trắng, viết hoa
const sizeKey = (label) =>
  fold(label)
    .toUpperCase()
    .replace(/\s/g, '')
    .replace(/^(\d)XL$/, (_, n) => 'X'.repeat(Number(n)) + 'L');
// Gợi ý màu vải theo tên màu biến thể (không dấu, viết thường)
const COLOR_GUESS = [
  [/den|black/, '#222326'],
  [/trang|white/, '#F5F3EE'],
  [/kem|cream|ivory/, '#EFE6D2'],
  [/be|beige/, '#D8C3A5'],
  [/xam|ghi|grey|gray/, '#9CA3AF'],
  [/navy|tim than/, '#1F2A44'],
  [/xanh la|reu|olive|green/, '#4F6B45'],
  [/xanh|blue/, '#3B6EA8'],
  [/do do|burgundy|maroon/, '#7A2430'],
  [/do|red/, '#B42C2C'],
  [/hong|pink/, '#E8A9B8'],
  [/nau|brown|camel/, '#7C5A3C'],
  [/vang|yellow|mustard/, '#D9B44A'],
  [/cam|orange/, '#D9733A'],
  [/tim|purple/, '#6B4C8A']
];
const fold = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .trim();

/** Mức size -1..1 <-> { up, down } của backend */
const toMorph = (v) => ({ up: v > 0 ? v : 0, down: v < 0 ? -v : 0 });
const fromMorph = (m) => (m ? (m.up || 0) - (m.down || 0) : 0);

function guessSizes(labels) {
  const known = labels.every((l) => SIZE_GUESS[sizeKey(l)] !== undefined);
  if (known) return Object.fromEntries(labels.map((l) => [l, SIZE_GUESS[sizeKey(l)]]));
  // Size số (29, 30, 31...) xếp theo số; size tự đặt giữ thứ tự biến thể. Rải đều -1..1, size giữa = cỡ gốc
  const numeric = labels.every((l) => Number.isFinite(Number(l)));
  const sorted = numeric ? [...labels].sort((a, b) => Number(a) - Number(b)) : labels;
  const n = sorted.length;
  return Object.fromEntries(sorted.map((l, i) => [l, n <= 1 ? 0 : Math.round((-1 + (2 * i) / (n - 1)) * 100) / 100]));
}

function guessColor(name) {
  const hit = COLOR_GUESS.find(([re]) => re.test(fold(name)));
  return hit ? { use: true, hex: hit[1] } : { use: false, hex: '#8C8C8C' };
}

const switchSx = {
  width: 34,
  height: 18,
  p: 0,
  '& .MuiSwitch-switchBase': {
    p: '2px',
    transitionDuration: '200ms',
    '&.Mui-checked': {
      transform: 'translateX(16px)',
      color: '#67E8F9',
      '& + .MuiSwitch-track': { bgcolor: '#BAF2F8', opacity: 1, border: 0 }
    }
  },
  '& .MuiSwitch-thumb': { boxShadow: '0 1px 2px rgba(0,0,0,0.15)', width: 14, height: 14 },
  '& .MuiSwitch-track': { borderRadius: 9, bgcolor: '#CBD5E1', opacity: 1 }
};

const labelSx = { fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 };

/**
 * "Mô hình 3D thử đồ" trên trang chi tiết sản phẩm (quản trị): Owner tải file GLB dựng trên người mẫu THORS,
 * chọn vị trí mặc, khai báo size biến thể -> mức size của áo, màu biến thể -> màu vải, xem trước rồi lưu.
 * Family Member chỉ xem.
 *
 * @param variants biến thể của sản phẩm ({ size, color }) - để liệt kê size / màu cần khai báo
 */
export default function GarmentModelEditor({ productId, variants, canEdit }) {
  const sizeLabels = useMemo(() => [...new Set(variants.map((v) => v.size).filter(Boolean))], [variants]);
  const colorNames = useMemo(() => [...new Set(variants.map((v) => v.color).filter(Boolean))], [variants]);

  const [model, setModel] = useState(undefined); // undefined = đang tải, null = chưa có
  const [loadError, setLoadError] = useState('');
  const [file, setFile] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [slot, setSlot] = useState('TOP');
  const [gender, setGender] = useState('');
  const [fabric, setFabric] = useState('');
  const [sizes, setSizes] = useState({});
  const [colors, setColors] = useState({});
  const [previewSize, setPreviewSize] = useState('');
  const [previewColor, setPreviewColor] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Đổ dữ liệu vào form: từ mô hình đã lưu, hoặc gợi ý khi chưa có
  const fill = (m) => {
    setModel(m);
    setSlot(m?.slot ?? 'TOP');
    setGender(m?.gender ?? '');
    setFabric(m?.fabricMaterial ?? '');
    const guessedSizes = guessSizes(sizeLabels);
    setSizes(Object.fromEntries(sizeLabels.map((l) => [l, m?.sizes?.[l] ? fromMorph(m.sizes[l]) : guessedSizes[l]])));
    setColors(
      Object.fromEntries(
        colorNames.map((c) => [
          c,
          m?.colors?.[c] ? { use: true, hex: m.colors[c].hex } : m ? { use: false, hex: '#8C8C8C' } : guessColor(c)
        ])
      )
    );
    setPreviewSize((s) => (sizeLabels.includes(s) ? s : (sizeLabels.find((l) => fold(l) === 'm') ?? sizeLabels[0] ?? '')));
    setPreviewColor((c) => (colorNames.includes(c) ? c : (colorNames[0] ?? '')));
  };

  useEffect(() => {
    let alive = true;
    getGarmentModel(productId)
      .then((m) => alive && fill(m))
      .catch((e) => {
        if (!alive) return;
        setModel(null);
        setLoadError(e.message || 'Không tải được mô hình 3D.');
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, sizeLabels, colorNames]);

  // Thu hồi link tạm của file đang xem trước
  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  const pickFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setMessage({ type: '', text: '' });
    const info = readGlbInfo(await f.arrayBuffer());
    setFile(f);
    setFileInfo(info);
    setPreviewUrl(info.problems.length ? '' : URL.createObjectURL(f));
    // Vật liệu vải: giữ lựa chọn cũ nếu file mới cũng có, không thì lấy vật liệu đầu tiên không phải cúc áo
    setFabric((cur) =>
      info.materials.includes(cur) ? cur : (info.materials.find((m) => !/button|cuc/i.test(fold(m))) ?? info.materials[0] ?? '')
    );
  };

  const fabricOptions = fileInfo ? fileInfo.materials : model ? [model.fabricMaterial] : [];
  const glbUrl = previewUrl || (!fileInfo && model?.glbUrl) || '';
  const fileProblems = fileInfo?.problems ?? [];
  const canSave = canEdit && !saving && gender && fabric && sizeLabels.length > 0 && (file || model) && fileProblems.length === 0;

  const save = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const saved = await saveGarmentModel(productId, {
        file,
        slot,
        gender,
        fabricMaterial: fabric,
        sizes: Object.fromEntries(sizeLabels.map((l) => [l, toMorph(sizes[l] ?? 0)])),
        colors: Object.fromEntries(colorNames.filter((c) => colors[c]?.use).map((c) => [c, { hex: colors[c].hex }]))
      });
      setFile(null);
      setFileInfo(null);
      setPreviewUrl('');
      fill(saved);
      setMessage({ type: 'success', text: 'Đã lưu mô hình 3D. Khách có thể thử sản phẩm này trong Phòng thử đồ.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Không lưu được mô hình 3D.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    setSaving(true);
    try {
      fill(await setGarmentModelActive(productId, !model.active));
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Không đổi được trạng thái.' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    setSaving(true);
    try {
      await deleteGarmentModel(productId);
      setFile(null);
      setFileInfo(null);
      setPreviewUrl('');
      fill(null);
      setMessage({ type: 'success', text: 'Đã xóa mô hình 3D.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Không xóa được mô hình 3D.' });
    } finally {
      setSaving(false);
    }
  };

  if (model === undefined) return null;
  // Family Member: chỉ hiện khi đã có mô hình
  if (!canEdit && !model) return null;

  const previewHex = colors[previewColor]?.use ? colors[previewColor].hex : undefined;
  const wear = glbUrl
    ? {
        slot,
        item: { id: glbUrl, url: glbUrl, fabric },
        color: previewHex,
        morphs: { Size_up: toMorph(sizes[previewSize] ?? 0).up, Size_down: toMorph(sizes[previewSize] ?? 0).down }
      }
    : null;

  return (
    <Card sx={{ ...cardSx, p: { xs: 2.5, sm: 3.5 }, mt: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Mô hình 3D thử đồ</Typography>
        {model && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Switch checked={model.active} disabled={!canEdit || saving} onChange={toggleActive} size="small" sx={switchSx} />
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: model.active ? '#168B70' : '#75869F' }}>
              {model.active ? 'Khách đang thử được' : 'Đang tắt'}
            </Typography>
          </Box>
        )}
      </Box>
      <Typography sx={{ fontSize: 13, color: C.muted, mt: 0.5, mb: 2 }}>
        File .glb dựng trên người mẫu THORS (có các núm co giãn theo số đo và Size_up / Size_down), tối đa 10 MB. Dùng cho Phòng thử đồ trên
        cửa hàng.
      </Typography>
      {loadError && <Typography sx={{ color: C.error, fontSize: 13.5, mb: 1.5 }}>{loadError}</Typography>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 260px' }, gap: 3, alignItems: 'start' }}>
        <Box>
          {/* File */}
          <Typography sx={labelSx}>File mô hình</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1 }}>
            {canEdit && (
              <Button component="label" sx={{ ...outlineButtonSx, height: 40 }}>
                {model || file ? 'Chọn file khác' : 'Chọn file .glb'}
                <input type="file" accept=".glb,model/gltf-binary" hidden onChange={pickFile} />
              </Button>
            )}
            <Typography sx={{ fontSize: 13, color: C.muted }}>
              {file
                ? `${file.name} · ${(file.size / 1048576).toFixed(2)} MB (chưa lưu)`
                : model
                  ? `Đã có file · ${(model.fileSizeBytes / 1048576).toFixed(2)} MB`
                  : 'Chưa có file'}
            </Typography>
          </Box>
          {fileProblems.map((p) => (
            <Typography key={p} sx={{ fontSize: 13, color: C.error, fontWeight: 600 }}>
              • {p}
            </Typography>
          ))}

          {/* Vị trí, người mẫu, vải */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2, mt: 2 }}>
            <Box>
              <Typography sx={labelSx}>Vị trí mặc</Typography>
              <TextField select fullWidth size="small" value={slot} disabled={!canEdit} onChange={(e) => setSlot(e.target.value)}>
                {SLOT_OPTIONS.map(([v, l]) => (
                  <MenuItem key={v} value={v}>
                    {l}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Box>
              <Typography sx={labelSx}>Người mẫu</Typography>
              <TextField
                select
                fullWidth
                size="small"
                value={gender}
                disabled={!canEdit}
                onChange={(e) => setGender(e.target.value)}
                SelectProps={{ displayEmpty: true }}
              >
                <MenuItem value="" disabled>
                  Chọn
                </MenuItem>
                {GENDER_OPTIONS.map(([v, l]) => (
                  <MenuItem key={v} value={v}>
                    {l}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Box>
              <Typography sx={labelSx}>Vật liệu vải (đổi màu)</Typography>
              <TextField
                select
                fullWidth
                size="small"
                value={fabricOptions.includes(fabric) ? fabric : ''}
                disabled={!canEdit || fabricOptions.length <= 1}
                onChange={(e) => setFabric(e.target.value)}
                SelectProps={{ displayEmpty: true }}
              >
                <MenuItem value="" disabled>
                  {fabricOptions.length ? 'Chọn' : 'Chọn file trước'}
                </MenuItem>
                {fabricOptions.map((m) => (
                  <MenuItem key={m} value={m}>
                    {m}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
          </Box>

          {/* Size */}
          <Typography sx={{ ...labelSx, mt: 2.5 }}>Size của biến thể → độ rộng áo</Typography>
          <Typography sx={{ fontSize: 12.5, color: C.muted, mb: 1 }}>
            Giữa = áo đúng như dựng trong Blender. Kéo trái để áo nhỏ lại, kéo phải để áo rộng ra.
          </Typography>
          {sizeLabels.length === 0 && <Typography sx={{ fontSize: 13, color: C.error }}>Sản phẩm chưa có biến thể nào có size.</Typography>}
          {sizeLabels.map((l) => (
            <Box key={l} sx={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) 64px', alignItems: 'center', gap: 1.5 }}>
              <Button
                onClick={() => setPreviewSize(l)}
                sx={{
                  ...outlineButtonSx,
                  height: 30,
                  px: 1,
                  fontSize: 12.5,
                  ...(previewSize === l && { borderColor: C.teal, color: C.teal })
                }}
              >
                {l}
              </Button>
              <Slider
                size="small"
                min={-1}
                max={1}
                step={0.05}
                value={sizes[l] ?? 0}
                disabled={!canEdit}
                onChange={(_, v) => {
                  setSizes((s) => ({ ...s, [l]: v }));
                  setPreviewSize(l);
                }}
                marks={[{ value: 0 }]}
                aria-label={`Độ rộng size ${l}`}
                sx={{ color: C.teal }}
              />
              <Typography sx={{ fontSize: 12.5, color: C.muted, textAlign: 'right' }}>
                {(sizes[l] ?? 0) === 0 ? 'gốc' : (sizes[l] > 0 ? '+' : '') + Math.round((sizes[l] ?? 0) * 100) + '%'}
              </Typography>
            </Box>
          ))}

          {/* Màu */}
          {colorNames.length > 0 && (
            <>
              <Typography sx={{ ...labelSx, mt: 2.5 }}>Màu của biến thể → màu vải</Typography>
              <Typography sx={{ fontSize: 12.5, color: C.muted, mb: 1 }}>Bỏ chọn = giữ màu vải gốc trong file.</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
                {colorNames.map((c) => (
                  <Box
                    key={c}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      border: `1px solid ${previewColor === c ? C.teal : C.border}`,
                      borderRadius: '12px',
                      px: 1,
                      py: 0.5,
                      cursor: 'pointer'
                    }}
                    onClick={() => setPreviewColor(c)}
                  >
                    <Checkbox
                      size="small"
                      checked={Boolean(colors[c]?.use)}
                      disabled={!canEdit}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setColors((m) => ({ ...m, [c]: { ...m[c], use: e.target.checked } }))}
                      inputProps={{ 'aria-label': `Dùng màu riêng cho ${c}` }}
                    />
                    <Typography sx={{ fontSize: 13.5, flex: 1, minWidth: 0 }} noWrap title={c}>
                      {c}
                    </Typography>
                    <Box
                      component="input"
                      type="color"
                      value={colors[c]?.hex ?? '#8C8C8C'}
                      disabled={!canEdit || !colors[c]?.use}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        setColors((m) => ({ ...m, [c]: { use: true, hex: e.target.value.toUpperCase() } }));
                        setPreviewColor(c);
                      }}
                      aria-label={`Màu vải cho ${c}`}
                      sx={{
                        width: 34,
                        height: 26,
                        border: 0,
                        p: 0,
                        bgcolor: 'transparent',
                        cursor: 'pointer',
                        opacity: colors[c]?.use ? 1 : 0.35
                      }}
                    />
                  </Box>
                ))}
              </Box>
            </>
          )}
        </Box>

        {/* Xem trước trên người mẫu */}
        <Box>
          <Typography sx={labelSx}>Xem trước</Typography>
          <Box
            sx={{
              height: 360,
              borderRadius: '16px',
              overflow: 'hidden',
              border: `1px solid ${C.border}`,
              background: 'linear-gradient(180deg, #F7F5F2 0%, #ECE8E2 100%)'
            }}
          >
            {gender && wear ? (
              <Suspense fallback={null}>
                <AvatarViewer profile={{ gender }} wear={wear} />
              </Suspense>
            ) : (
              <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 2, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 13, color: C.muted }}>
                  {!glbUrl ? 'Chọn file .glb hợp lệ để xem trước.' : 'Chọn người mẫu nam / nữ để xem trước.'}
                </Typography>
              </Box>
            )}
          </Box>
          <Typography sx={{ fontSize: 12, color: C.muted, mt: 0.75 }}>
            Đang xem: size {previewSize || '—'}
            {previewColor ? ` · ${previewColor}` : ''}. Bấm size / màu bên trái để đổi.
          </Typography>
        </Box>
      </Box>

      {message.text && (
        <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: message.type === 'error' ? C.error : C.teal, mt: 2 }}>
          {message.text}
        </Typography>
      )}
      {canEdit && (
        <Box sx={{ display: 'flex', gap: 1.5, mt: 2.5, flexWrap: 'wrap' }}>
          <Button onClick={save} disabled={!canSave} sx={primaryButtonSx}>
            {saving ? 'Đang lưu…' : 'Lưu mô hình 3D'}
          </Button>
          {model && (
            <Button onClick={() => setConfirmDelete(true)} disabled={saving} sx={{ ...outlineButtonSx, color: C.error }}>
              Xóa mô hình
            </Button>
          )}
        </Box>
      )}

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Xóa mô hình 3D?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: C.muted, fontSize: 14 }}>
            File mô hình sẽ bị xóa, khách không thử được sản phẩm này trong Phòng thử đồ nữa. Muốn tạm ẩn thì dùng nút bật / tắt.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConfirmDelete(false)} sx={outlineButtonSx}>
            Quay lại
          </Button>
          <Button onClick={remove} sx={{ ...primaryButtonSx, bgcolor: C.error, color: '#fff', '&:hover': { bgcolor: '#B83737' } }}>
            Xóa
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
