import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { C, btnSx } from 'features/shop/storeTheme';

/**
 * Chụp ảnh bằng webcam ngay trong hộp thoại (máy tính). Trên máy tính, <input capture> bị trình duyệt bỏ qua và chỉ
 * mở hộp chọn file, nên phải dùng getUserMedia. Camera tắt ngay khi chụp xong / hủy / đóng hộp thoại.
 * Cần trang chạy trên https hoặc localhost (trình duyệt chặn camera trên http thường).
 */

const errorText = (e) => {
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
    return 'Bạn chưa cho phép dùng camera. Hãy bấm biểu tượng camera / ổ khóa trên thanh địa chỉ để cho phép, hoặc chọn ảnh có sẵn.';
  }
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') {
    return 'Không tìm thấy camera trên máy này. Hãy chọn ảnh có sẵn.';
  }
  if (e?.name === 'NotReadableError') {
    return 'Camera đang được ứng dụng khác dùng. Hãy tắt ứng dụng đó rồi thử lại, hoặc chọn ảnh có sẵn.';
  }
  return 'Không mở được camera. Hãy chọn ảnh có sẵn.';
};

export const canUseWebcam = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export default function WebcamCapture({ onCapture, onCancel, onError }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.play().catch(() => {});
        }
      })
      .catch((e) => {
        if (!cancelled) onError(errorText(e));
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [onError]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          onError('Không chụp được ảnh, vui lòng thử lại.');
          return;
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onCapture(new File([blob], 'anh-chup.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <Box sx={{ position: 'relative', width: '100%', maxWidth: 640, aspectRatio: '4 / 3', bgcolor: '#111' }}>
        <Box
          component="video"
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label="Hình từ camera"
          onLoadedData={() => setReady(true)}
          sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
        {!ready && (
          <Box
            role="status"
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.5,
              color: '#fff'
            }}
          >
            <CircularProgress size={26} sx={{ color: '#fff' }} />
            <Box sx={{ fontSize: 14 }}>Đang mở camera... (trình duyệt có thể hỏi quyền dùng camera)</Box>
          </Box>
        )}
      </Box>
      <Box sx={{ fontSize: 13, color: C.muted, textAlign: 'center' }}>Đưa cả món đồ vào khung hình, đủ sáng, rồi bấm Chụp.</Box>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Box component="button" type="button" onClick={capture} disabled={!ready} sx={{ ...btnSx('dark'), opacity: ready ? 1 : 0.5 }}>
          CHỤP
        </Box>
        <Box component="button" type="button" onClick={onCancel} sx={btnSx('outline')}>
          HỦY
        </Box>
      </Box>
    </Box>
  );
}
