import { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, CircularProgress, Dialog, IconButton } from '@mui/material';
import { Photo, priceText } from 'features/shop/ShopCommon';
import { C, Icon, btnSx, focusRing, linkSx, SERIF } from 'features/shop/storeTheme';
import { imageSearchApi, prepareImage } from './api';
import WebcamCapture, { canUseWebcam } from './WebcamCapture';

// Điện thoại / máy tính bảng: <input capture> mở thẳng app camera (tốt hơn webcam trong trang)
const isTouchDevice = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/**
 * Khách chụp / chọn ảnh một món đồ để tìm sản phẩm giống trong shop.
 * Chỉ hiện kết quả: danh sách sản phẩm cùng danh mục xếp theo mức giống (sản phẩm khớp, nếu có, đứng đầu).
 * Không hiện câu trạng thái ("Shop có mẫu này", "hết hàng"...) dù backend vẫn trả về status / message.
 * Ảnh chỉ gửi lên để tìm, backend không lưu lại.
 */

export const CameraIcon = ({ size = 20 }) => (
  <Icon size={size}>
    <path d="M4 8h3.5l1.8-2.5h5.4L16.5 8H20v11H4z" />
    <circle cx="12" cy="13.2" r="3.4" />
  </Icon>
);

function ProductLink({ product, onNavigate, children, sx }) {
  return (
    <Box component={RouterLink} to={`/shop/products/${product.productId}`} onClick={onNavigate} sx={{ ...linkSx, display: 'block', ...sx }}>
      {children}
    </Box>
  );
}

function Suggestions({ items, onNavigate }) {
  if (!items?.length) return null;
  return (
    <Box component="section" aria-label="Sản phẩm giống ảnh của bạn">
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', md: 'repeat(6, minmax(0, 1fr))' },
          gap: 1.5
        }}
      >
        {items.map((p) => (
          <ProductLink key={p.productId} product={p} onNavigate={onNavigate} sx={{ minWidth: 0 }}>
            <Photo src={p.imageUrl} name={p.productName} sx={{ width: '100%', aspectRatio: '3 / 4', bgcolor: C.photo }} />
            <Box
              sx={{
                mt: 0.75,
                fontSize: 13,
                lineHeight: 1.35,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}
            >
              {p.productName}
            </Box>
            {p.minPrice != null && <Box sx={{ fontSize: 13, color: C.muted }}>{priceText(p.minPrice, p.maxPrice)}</Box>}
          </ProductLink>
        ))}
      </Box>
    </Box>
  );
}

export default function ImageSearchDialog({ open, onClose }) {
  const [phase, setPhase] = useState('pick'); // pick | camera | searching | result
  const [preview, setPreview] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  const requestId = useRef(0);

  const reset = useCallback(() => {
    requestId.current += 1;
    setPhase('pick');
    setResult(null);
    setError('');
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return '';
    });
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleFile = async (file) => {
    if (!file) return;
    const id = ++requestId.current;
    setError('');
    setResult(null);
    setPhase('searching');
    try {
      const { blob, previewUrl } = await prepareImage(file);
      if (id !== requestId.current) return URL.revokeObjectURL(previewUrl);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return previewUrl;
      });
      const data = await imageSearchApi.search(blob);
      if (id !== requestId.current) return undefined;
      setResult(data);
      setPhase('result');
    } catch (e) {
      if (id !== requestId.current) return undefined;
      setError(e.message || 'Không tìm được, vui lòng thử lại.');
      setPhase('pick');
    }
    return undefined;
  };

  const onInput = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // chọn lại cùng ảnh vẫn chạy
    handleFile(file);
  };

  // Máy tính: trình duyệt bỏ qua capture và chỉ mở hộp chọn file -> mở webcam ngay trong hộp thoại
  const openCamera = () => {
    setError('');
    if (isTouchDevice() || !canUseWebcam()) cameraRef.current?.click();
    else setPhase('camera');
  };

  const onCameraError = useCallback((message) => {
    setError(message);
    setPhase('pick');
  }, []);

  const items = result ? [...(result.product ? [result.product] : []), ...(result.suggestions || [])] : [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      aria-labelledby="image-search-title"
      slotProps={{ paper: { sx: { borderRadius: 0, m: { xs: 1, sm: 4 }, width: { xs: 'calc(100% - 16px)', sm: undefined } } } }}
    >
      <Box sx={{ p: { xs: 2, sm: 4 }, color: C.ink }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
          <Box component="h2" id="image-search-title" sx={{ m: 0, fontFamily: SERIF, fontWeight: 400, fontSize: { xs: 24, sm: 30 } }}>
            Tìm bằng hình ảnh
          </Box>
          <IconButton onClick={onClose} aria-label="Đóng" sx={{ color: C.ink, borderRadius: 0, ...focusRing }}>
            <Icon>
              <path d="M6 6l12 12M18 6L6 18" />
            </Icon>
          </IconButton>
        </Box>

        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onInput} />
        <input ref={fileRef} type="file" accept="image/*,.heic,.heif" hidden onChange={onInput} />

        {phase === 'pick' && (
          <Box
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            sx={{
              border: `1px dashed ${dragging ? C.accent : C.ink}`,
              bgcolor: dragging ? C.sand : C.cream,
              p: { xs: 3, sm: 5 },
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2
            }}
          >
            <CameraIcon size={40} />
            <Box sx={{ fontSize: 15, maxWidth: 460, lineHeight: 1.6 }}>
              Chụp hoặc chọn ảnh một món đồ (giày, dép, túi, balo, thắt lưng, quần áo) để xem shop có bán không.
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
                {' '}
                Bạn cũng có thể kéo thả ảnh vào đây.
              </Box>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'center' }}>
              <Box
                component="button"
                type="button"
                onClick={openCamera}
                sx={{ ...btnSx('dark'), display: 'inline-flex', alignItems: 'center', gap: 1 }}
              >
                <CameraIcon size={18} /> CHỤP ẢNH
              </Box>
              <Box component="button" type="button" onClick={() => fileRef.current?.click()} sx={btnSx('outline')}>
                CHỌN ẢNH CÓ SẴN
              </Box>
            </Box>
            <Box sx={{ fontSize: 13, color: C.muted, maxWidth: 460 }}>
              Mẹo: chụp cả món đồ, đủ sáng, nền gọn. Ảnh chỉ dùng để tìm kiếm, shop không lưu lại ảnh của bạn.
            </Box>
            {error && (
              <Box role="alert" sx={{ color: '#B3261E', fontSize: 14 }}>
                {error}
              </Box>
            )}
          </Box>
        )}

        {phase === 'camera' && <WebcamCapture onCapture={handleFile} onCancel={() => setPhase('pick')} onError={onCameraError} />}

        {phase === 'searching' && (
          <Box role="status" aria-live="polite" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 6 }}>
            {preview && (
              <Box component="img" src={preview} alt="Ảnh bạn vừa chọn" sx={{ maxHeight: 220, maxWidth: '100%', objectFit: 'contain' }} />
            )}
            <CircularProgress size={28} sx={{ color: C.ink }} />
            <Box sx={{ fontSize: 15 }}>Đang tìm sản phẩm giống ảnh của bạn...</Box>
          </Box>
        )}

        {phase === 'result' && result && (
          <Box aria-live="polite">
            {/* Chỉ hiện kết quả: ảnh của khách + danh sách xếp theo mức giống (sản phẩm khớp, nếu có, đứng đầu) */}
            {preview && (
              <Box
                component="img"
                src={preview}
                alt="Ảnh bạn đã gửi"
                sx={{ display: 'block', width: 72, aspectRatio: '3 / 4', objectFit: 'cover', bgcolor: C.photo, mb: 2 }}
              />
            )}

            {items.length > 0 ? (
              <Suggestions items={items} onNavigate={onClose} />
            ) : (
              <Box sx={{ fontSize: 15, color: C.muted, py: 3, textAlign: 'center' }}>Chưa tìm thấy sản phẩm phù hợp.</Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Box component="button" type="button" onClick={reset} sx={btnSx('outline')}>
                TÌM BẰNG ẢNH KHÁC
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </Dialog>
  );
}
