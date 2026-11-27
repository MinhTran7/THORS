import { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, CircularProgress, Dialog, IconButton } from '@mui/material';
import { Photo, money, priceText } from 'features/shop/ShopCommon';
import { C, Icon, btnSx, focusRing, linkSx, SERIF } from 'features/shop/storeTheme';
import { imageSearchApi, prepareImage } from './api';
import WebcamCapture, { canUseWebcam } from './WebcamCapture';

// Điện thoại / máy tính bảng: <input capture> mở thẳng app camera (tốt hơn webcam trong trang)
const isTouchDevice = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/**
 * Khách chụp / chọn ảnh một món đồ để hỏi shop có bán không.
 * Trả lời 1 trong 4 trạng thái (có hàng / hết hàng / không có màu này / chưa có mẫu này) và luôn kèm sản phẩm gần giống.
 * Ảnh chỉ gửi lên để tìm, backend không lưu lại.
 */

const STATUS = {
  AVAILABLE: { title: 'Shop có mẫu này', bg: '#E8F3EA', fg: '#1E5B2A' },
  OUT_OF_STOCK: { title: 'Có mẫu này nhưng đang hết hàng', bg: '#FBF1DF', fg: '#7A4B00' },
  COLOR_UNAVAILABLE: { title: 'Có mẫu này nhưng khác màu', bg: '#FBF1DF', fg: '#7A4B00' },
  // Giống nhưng AI chưa chắc là cùng mẫu (điểm 0,808 - 0,85): không khẳng định "shop có mẫu này"
  SIMILAR: { title: 'Có sản phẩm khá giống', bg: '#EEF1F5', fg: '#2B3A4F' },
  NOT_FOUND: { title: 'Shop chưa có mẫu này', bg: C.sand, fg: C.ink },
  // Ảnh nhân vật hoạt hình, logo...: không hiện sản phẩm nào (danh sách gợi ý rỗng)
  NOT_PRODUCT: { title: 'Không nhận ra sản phẩm trong ảnh', bg: C.sand, fg: C.ink }
};

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

function MatchedProduct({ product, detectedColor, onNavigate, label }) {
  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
      <ProductLink product={product} onNavigate={onNavigate} sx={{ flex: '0 0 140px' }}>
        <Photo src={product.imageUrl} name={product.productName} sx={{ width: 140, aspectRatio: '3 / 4', bgcolor: C.photo }} />
      </ProductLink>
      <Box sx={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ fontSize: 12, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label ? `${label} · ${product.categoryName}` : product.categoryName}
        </Box>
        <ProductLink product={product} onNavigate={onNavigate} sx={{ fontWeight: 600, fontSize: 17 }}>
          {product.productName}
        </ProductLink>
        {product.minPrice != null && <Box sx={{ fontSize: 15 }}>{priceText(product.minPrice, product.maxPrice)}</Box>}
        {detectedColor?.confident && (
          <Box sx={{ fontSize: 13, color: C.muted }}>
            Màu trong ảnh của bạn: <b>{detectedColor.name}</b>
          </Box>
        )}
        {product.colors?.length > 0 && (
          <Box role="list" aria-label="Màu và tồn kho" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {product.colors.map((c) => (
              <Box
                key={c.color}
                role="listitem"
                sx={{
                  fontSize: 13,
                  px: 1.25,
                  py: 0.5,
                  border: `1px solid ${c.matches ? C.ink : C.line}`,
                  fontWeight: c.matches ? 600 : 400,
                  color: c.stock > 0 ? C.ink : C.muted,
                  textDecoration: c.stock > 0 ? 'none' : 'line-through'
                }}
              >
                {c.color} · {c.stock > 0 ? `còn ${c.stock}` : 'hết hàng'}
              </Box>
            ))}
          </Box>
        )}
        <Box
          component={RouterLink}
          to={`/shop/products/${product.productId}`}
          onClick={onNavigate}
          sx={{ ...btnSx('dark'), alignSelf: 'flex-start', mt: 0.5, py: '12px', px: '20px' }}
        >
          XEM SẢN PHẨM
        </Box>
      </Box>
    </Box>
  );
}

function Suggestions({ items, onNavigate, title }) {
  if (!items?.length) return null;
  return (
    <Box component="section" aria-label={title} sx={{ mt: 3 }}>
      <Box component="h3" sx={{ m: 0, mb: 1.5, fontSize: 15, fontWeight: 600 }}>
        {title}
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' },
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
            {p.minPrice != null && <Box sx={{ fontSize: 13, color: C.muted }}>{money(p.minPrice)}</Box>}
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

  const status = result && (STATUS[result.status] || STATUS.NOT_FOUND);
  // Luôn có khung sản phẩm riêng: sản phẩm khớp, hoặc (chưa có mẫu) gợi ý đầu tiên với nhãn "Gần giống nhất"
  const featured = result ? result.product || result.suggestions?.[0] || null : null;
  const others = result ? (result.product ? result.suggestions : result.suggestions?.slice(1)) || [] : [];

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
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'stretch', flexWrap: { xs: 'wrap', sm: 'nowrap' }, mb: 3 }}>
              {preview && (
                <Box sx={{ flex: '0 0 auto', width: { xs: 96, sm: 120 } }}>
                  <Box sx={{ fontSize: 12, color: C.muted, mb: 0.5 }}>Ảnh của bạn</Box>
                  <Box
                    component="img"
                    src={preview}
                    alt="Ảnh bạn đã gửi"
                    sx={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', bgcolor: C.photo }}
                  />
                </Box>
              )}
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  bgcolor: status.bg,
                  color: status.fg,
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: 0.75
                }}
              >
                <Box sx={{ fontWeight: 700, fontSize: 18 }}>{status.title}</Box>
                <Box sx={{ fontSize: 14, lineHeight: 1.6 }}>{result.message}</Box>
              </Box>
            </Box>

            {featured && (
              <MatchedProduct
                product={featured}
                detectedColor={result.product ? result.detectedColor : null}
                onNavigate={onClose}
                label={result.product ? (result.status === 'SIMILAR' ? 'Giống nhất' : '') : 'Gần giống nhất (shop chưa có đúng mẫu này)'}
              />
            )}

            <Suggestions
              items={others}
              onNavigate={onClose}
              title={
                result.suggestionCategory
                  ? `${featured ? 'Sản phẩm khác' : 'Có thể bạn đang tìm'} trong danh mục ${result.suggestionCategory}`
                  : featured ? 'Sản phẩm khác gần giống' : 'Có thể bạn đang tìm'
              }
            />

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
