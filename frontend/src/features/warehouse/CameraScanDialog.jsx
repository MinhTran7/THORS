import { useCallback, useEffect, useRef, useState } from 'react';
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

const SAME_CODE_PAUSE_MS = 2500; // a label held in front of the camera is read many times per second
const ANY_CODE_PAUSE_MS = 800;

function cameraError(error) {
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError')
    return 'Chưa được cấp quyền camera. Hãy cho phép truy cập camera trong trình duyệt.';
  if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError')
    return 'Không tìm thấy camera. Hãy cắm webcam hoặc dùng máy quét / gõ mã vào ô tìm kiếm.';
  if (error.name === 'NotReadableError') return 'Không mở được camera. Hãy đóng ứng dụng khác đang dùng camera rồi thử lại.';
  return error.message || 'Không mở được camera.';
}

/**
 * Continuous camera scanning (fallback when there is no USB/Bluetooth scanner). Each new code is
 * passed to `onDetected(code)`, which returns { ok, message }; the camera stays on for the next item.
 */
export default function CameraScanDialog({ title = 'Quét mã bằng camera', onDetected, onClose }) {
  const video = useRef(null);
  const stream = useRef(null);
  const controls = useRef(null);
  const session = useRef(0);
  const last = useRef({ code: '', at: 0 });
  const busy = useRef(false);
  const handler = useRef(onDetected);
  handler.current = onDetected;
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [state, setState] = useState('starting'); // starting | on | off
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);

  const release = useCallback(() => {
    session.current += 1;
    controls.current?.stop();
    controls.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const detected = useCallback(async (code) => {
    const now = Date.now();
    if (busy.current) return;
    if (now - last.current.at < ANY_CODE_PAUSE_MS) return;
    if (code === last.current.code && now - last.current.at < SAME_CODE_PAUSE_MS) return;
    last.current = { code, at: now };
    busy.current = true;
    try {
      const result = (await handler.current(code)) || { ok: true, message: code };
      setLog((previous) => [{ id: now, ...result }, ...previous].slice(0, 5));
    } finally {
      busy.current = false;
      last.current = { code, at: Date.now() };
    }
  }, []);

  const start = useCallback(
    async (id) => {
      release();
      const current = session.current;
      setError('');
      setState('starting');
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera chỉ dùng được khi mở web bằng HTTPS hoặc localhost.');
        }
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library')
        ]);
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: id ? { deviceId: { exact: id } } : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (current !== session.current) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = media;
        const available = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (current !== session.current) return;
        setDevices(available.filter((device) => device.kind === 'videoinput'));
        const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]]]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150, delayBetweenScanSuccess: 300 });
        const active = await reader.decodeFromStream(media, video.current, (result) => {
          if (result && current === session.current) void detected(result.getText().trim().toUpperCase());
        });
        if (current !== session.current) active.stop();
        else {
          controls.current = active;
          setState('on');
        }
      } catch (err) {
        if (current === session.current) {
          release();
          setState('off');
          setError(cameraError(err));
        }
      }
    },
    [release, detected]
  );

  useEffect(() => {
    void start('');
    return release;
  }, [start, release]);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Đưa từng tem vào khung hình. Đọc được mã là hàng được thêm vào hóa đơn ngay, camera vẫn bật để quét món tiếp theo.
          </Typography>
          <Box
            component="video"
            ref={video}
            autoPlay
            muted
            playsInline
            aria-label="Camera quét mã vạch"
            sx={{ width: '100%', aspectRatio: '16 / 9', bgcolor: 'grey.900', borderRadius: 1, objectFit: 'contain' }}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              select
              label="Camera"
              size="small"
              value={deviceId}
              sx={{ flex: 1 }}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              onChange={(event) => {
                setDeviceId(event.target.value);
                void start(event.target.value);
              }}
            >
              <MenuItem value="">Tự động — ưu tiên camera sau</MenuItem>
              {devices.map((device, index) => (
                <MenuItem key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </MenuItem>
              ))}
            </TextField>
            {state === 'off' && (
              <Button variant="outlined" onClick={() => start(deviceId)}>
                Bật lại camera
              </Button>
            )}
          </Stack>
          {state === 'starting' && <Typography color="text.secondary">Đang mở camera…</Typography>}
          {error && <Alert severity="error">{error}</Alert>}
          {log.map((entry, index) => (
            <Alert key={entry.id} severity={entry.ok ? 'success' : 'warning'} sx={{ opacity: index ? 0.6 : 1, py: 0 }}>
              {entry.message}
            </Alert>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          Xong
        </Button>
      </DialogActions>
    </Dialog>
  );
}
