import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { RedoOutlined } from '@ant-design/icons';
import { C } from '../shippingaddress/theme';

/**
 * Hộp thoại căn chỉnh ảnh trước khi tải lên (kiểu "Cắt ảnh" trên điện thoại):
 *  - Khung cắt cố định tỉ lệ (mặc định 4:5 — rộng 4, cao 5 — khớp khung ảnh trên website), có lưới 3x3.
 *  - Kéo khung để chọn vị trí, kéo 4 góc để phóng to / thu nhỏ khung.
 *  - "Xoay" xoay ảnh 90°, "Đặt lại" về khung lớn nhất ở giữa.
 *  - Chọn nhiều ảnh thì căn lần lượt từng ảnh; "Giữ nguyên ảnh" bỏ qua bước cắt cho ảnh đó.
 * Kết quả: các File ảnh JPEG đã cắt (cạnh dài tối đa OUTPUT_MAX px) trả về qua onDone(files).
 */

const STAGE_MAX_W = 520;
const STAGE_MAX_H = 440;
const OUTPUT_MAX = 1600;
const MIN_FRACTION = 0.15; // khung cắt nhỏ nhất = 15% cạnh ngắn của ảnh

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không đọc được ảnh.'));
    img.src = src;
  });

// Khung lớn nhất đúng tỉ lệ, đặt giữa ảnh
function initialBox(w, h, aspect) {
  let bw = w;
  let bh = w / aspect;
  if (bh > h) {
    bh = h;
    bw = h * aspect;
  }
  return { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
}

// Xoay ảnh 90° theo chiều kim đồng hồ, trả về URL ảnh mới
async function rotateSrc(src) {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalHeight;
  canvas.height = img.naturalWidth;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  return URL.createObjectURL(blob);
}

async function cropToFile(src, box, name) {
  const img = await loadImage(src);
  const scale = Math.min(1, OUTPUT_MAX / Math.max(box.w, box.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(box.w * scale);
  canvas.height = Math.round(box.h * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF'; // ảnh PNG nền trong suốt -> nền trắng
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  const base = String(name || 'anh').replace(/\.[^.]+$/, '');
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}

const CORNERS = [
  { key: 'nw', sx: -1, sy: -1, cursor: 'nwse-resize' },
  { key: 'ne', sx: 1, sy: -1, cursor: 'nesw-resize' },
  { key: 'sw', sx: -1, sy: 1, cursor: 'nesw-resize' },
  { key: 'se', sx: 1, sy: 1, cursor: 'nwse-resize' }
];

export default function ImageCropDialog({ files, aspect = 4 / 5, onDone, onCancel }) {
  const open = Boolean(files && files.length);
  const [index, setIndex] = useState(0);
  const [src, setSrc] = useState('');
  const [size, setSize] = useState(null); // kích thước thật của ảnh { w, h }
  const [box, setBox] = useState(null); // khung cắt theo pixel ảnh thật
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const results = useRef([]);
  const drag = useRef(null);
  const ownedUrls = useRef([]);

  const file = open ? files[index] : null;

  const newUrl = (url) => {
    ownedUrls.current.push(url);
    return url;
  };

  // Mở ảnh tiếp theo
  useEffect(() => {
    if (!file) return undefined;
    let alive = true;
    const url = newUrl(URL.createObjectURL(file));
    loadImage(url)
      .then((img) => {
        if (!alive) return;
        setSrc(url);
        setSize({ w: img.naturalWidth, h: img.naturalHeight });
        setBox(initialBox(img.naturalWidth, img.naturalHeight, aspect));
        setError('');
      })
      .catch(() => alive && setError(`Không đọc được ảnh "${file.name}".`));
    return () => {
      alive = false;
    };
  }, [file, aspect]);

  // Đóng hộp thoại: dọn URL tạm, về ảnh đầu
  useEffect(() => {
    if (open) return undefined;
    setIndex(0);
    setSrc('');
    setSize(null);
    setBox(null);
    results.current = [];
    ownedUrls.current.forEach((u) => URL.revokeObjectURL(u));
    ownedUrls.current = [];
    return undefined;
  }, [open]);

  const scale = size ? Math.min(STAGE_MAX_W / size.w, STAGE_MAX_H / size.h) : 1;

  const onPointerMove = useCallback(
    (e) => {
      const d = drag.current;
      if (!d || !size) return;
      const dx = (e.clientX - d.px) / scale;
      const dy = (e.clientY - d.py) / scale;
      if (d.mode === 'move') {
        setBox((b) => ({
          ...b,
          x: Math.min(Math.max(0, d.box.x + dx), size.w - b.w),
          y: Math.min(Math.max(0, d.box.y + dy), size.h - b.h)
        }));
        return;
      }
      // Kéo góc: góc đối diện đứng yên, khung giữ đúng tỉ lệ
      const { sx, sy } = d.corner;
      const ax = sx > 0 ? d.box.x : d.box.x + d.box.w;
      const ay = sy > 0 ? d.box.y : d.box.y + d.box.h;
      const px = (sx > 0 ? d.box.x + d.box.w : d.box.x) + dx;
      const py = (sy > 0 ? d.box.y + d.box.h : d.box.y) + dy;
      let w = Math.max(sx * (px - ax), sy * (py - ay) * aspect);
      const maxW = sx > 0 ? size.w - ax : ax;
      const maxH = sy > 0 ? size.h - ay : ay;
      const minW = Math.min(size.w, size.h) * MIN_FRACTION * Math.max(1, aspect);
      w = Math.min(Math.max(w, minW), maxW, maxH * aspect);
      const h = w / aspect;
      setBox({ x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w, h });
    },
    [size, scale, aspect]
  );

  const endDrag = useCallback(() => {
    drag.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
  }, [onPointerMove]);

  useEffect(() => endDrag, [endDrag]);

  const startDrag = (mode, corner) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { mode, corner, px: e.clientX, py: e.clientY, box };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
  };

  // Phím mũi tên dịch khung 1% (giữ Shift: 5%)
  const onKeyDown = (e) => {
    if (!box || !size) return;
    const step = (e.shiftKey ? 0.05 : 0.01) * Math.max(size.w, size.h);
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    setBox((b) => ({
      ...b,
      x: Math.min(Math.max(0, b.x + m[0]), size.w - b.w),
      y: Math.min(Math.max(0, b.y + m[1]), size.h - b.h)
    }));
  };

  const rotate = async () => {
    if (!src || busy) return;
    setBusy(true);
    try {
      const url = newUrl(await rotateSrc(src));
      const img = await loadImage(url);
      setSrc(url);
      setSize({ w: img.naturalWidth, h: img.naturalHeight });
      setBox(initialBox(img.naturalWidth, img.naturalHeight, aspect));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => size && setBox(initialBox(size.w, size.h, aspect));

  const next = (picked) => {
    results.current = [...results.current, picked];
    if (index + 1 < files.length) {
      setSrc('');
      setBox(null);
      setIndex(index + 1);
    } else {
      const out = results.current;
      results.current = [];
      onDone(out);
    }
  };

  const confirm = async () => {
    if (!box || busy) return;
    setBusy(true);
    try {
      next(await cropToFile(src, box, file.name));
    } catch {
      setError('Không cắt được ảnh, vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };

  const view = box && size ? { left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale } : null;

  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>
        Căn chỉnh ảnh {files?.length > 1 ? `(${index + 1}/${files.length})` : ''}
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13, color: C.muted, mb: 2 }}>
          Kéo khung để chọn phần ảnh hiển thị, kéo các góc để phóng to / thu nhỏ. Ảnh trên website hiển thị đúng phần trong khung.
        </Typography>

        {error && <Typography sx={{ color: C.error, fontSize: 13, mb: 1 }}>{error}</Typography>}

        <Box sx={{ display: 'grid', placeItems: 'center', bgcolor: '#111111', borderRadius: 2, p: 2, minHeight: 300 }}>
          {src && size && view && (
            <Box
              sx={{ position: 'relative', width: size.w * scale, height: size.h * scale, overflow: 'hidden', userSelect: 'none', touchAction: 'none' }}
            >
              <Box component="img" src={src} alt="" draggable={false} sx={{ width: '100%', height: '100%', display: 'block' }} />
              {/* Khung cắt: phần ngoài khung bị làm tối bằng bóng đổ cực lớn */}
              <Box
                role="slider"
                tabIndex={0}
                aria-label="Khung cắt ảnh. Dùng phím mũi tên để dịch khung"
                onPointerDown={startDrag('move')}
                onKeyDown={onKeyDown}
                sx={{
                  position: 'absolute',
                  ...view,
                  cursor: 'move',
                  border: '1px solid rgba(255,255,255,.9)',
                  boxShadow: '0 0 0 9999px rgba(0,0,0,.55)',
                  backgroundImage:
                    'linear-gradient(rgba(255,255,255,.45) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.45) 1px, transparent 1px)',
                  backgroundSize: '33.333% 33.333%',
                  backgroundPosition: '-1px -1px',
                  '&:focus-visible': { outline: `2px solid ${C.cyan}`, outlineOffset: 2 }
                }}
              >
                {CORNERS.map((c) => (
                  <Box
                    key={c.key}
                    onPointerDown={startDrag('resize', c)}
                    sx={{
                      position: 'absolute',
                      width: 22,
                      height: 22,
                      [c.sx > 0 ? 'right' : 'left']: 0,
                      [c.sy > 0 ? 'bottom' : 'top']: 0,
                      cursor: c.cursor,
                      [`border${c.sy > 0 ? 'Bottom' : 'Top'}`]: '4px solid #FFFFFF',
                      [`border${c.sx > 0 ? 'Right' : 'Left'}`]: '4px solid #FFFFFF'
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}
          {!src && !error && <Typography sx={{ color: '#9CA3AF', fontSize: 13 }}>Đang mở ảnh...</Typography>}
        </Box>

        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
          <Button size="small" startIcon={<RedoOutlined />} onClick={rotate} disabled={busy || !src} sx={{ textTransform: 'none' }}>
            Xoay
          </Button>
          <Button size="small" onClick={reset} disabled={busy || !src} sx={{ textTransform: 'none' }}>
            Đặt lại
          </Button>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, flexWrap: 'wrap' }}>
        <Button onClick={onCancel} disabled={busy} sx={{ textTransform: 'none', mr: 'auto' }}>
          Hủy
        </Button>
        <Button variant="outlined" onClick={() => next(file)} disabled={busy || !file} sx={{ textTransform: 'none' }}>
          Giữ nguyên ảnh
        </Button>
        <Button variant="contained" onClick={confirm} disabled={busy || !box} sx={{ textTransform: 'none' }}>
          {busy ? 'Đang xử lý...' : index + 1 < (files?.length || 0) ? 'Xong, ảnh tiếp' : 'Xong'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
