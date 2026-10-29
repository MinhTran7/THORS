import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { api } from 'services/http';
import { number, variantLabel } from './model';

function cameraError(error) {
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError')
    return 'Chưa được cấp quyền camera. Hãy cho phép truy cập camera trong trình duyệt.';
  if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError')
    return 'Không tìm thấy camera phù hợp. Hãy chọn camera khác hoặc nhập mã bên dưới.';
  if (error.name === 'NotReadableError') return 'Không mở được camera. Hãy đóng ứng dụng khác đang dùng camera rồi thử lại.';
  return error.message || 'Không mở được camera. Bạn có thể nhập mã để tìm hàng.';
}

export default function BarcodeScannerDialog({ onClose }) {
  const video = useRef(null);
  const stream = useRef(null);
  const controls = useRef(null);
  const session = useRef(0);
  const lookupRequest = useRef(0);
  const [code, setCode] = useState('');
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [starting, setStarting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const releaseCamera = useCallback(() => {
    session.current += 1;
    controls.current?.stop();
    controls.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  useEffect(
    () => () => {
      releaseCamera();
      lookupRequest.current += 1;
    },
    [releaseCamera]
  );

  const stopCamera = () => {
    releaseCamera();
    setScanning(false);
    setStarting(false);
  };

  const lookupCode = useCallback(
    async (value) => {
      releaseCamera();
      setScanning(false);
      setStarting(false);
      const current = ++lookupRequest.current;
      const normalized = value.trim();
      setCode(normalized);
      setResult(null);
      setError('');
      setLoading(false);
      if (!normalized) {
        setError('Hãy nhập hoặc quét mã vạch.');
        return;
      }
      setLoading(true);
      try {
        const found = await api(`/warehouse/barcodes/lookup?code=${encodeURIComponent(normalized)}`);
        if (current === lookupRequest.current) setResult(found);
      } catch (err) {
        if (current === lookupRequest.current) setError(err.message);
      } finally {
        if (current === lookupRequest.current) setLoading(false);
      }
    },
    [releaseCamera]
  );

  const startCamera = async () => {
    releaseCamera();
    const current = session.current;
    setError('');
    setResult(null);
    setStarting(true);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera cần truy cập web bằng HTTPS hoặc localhost. Bạn vẫn có thể nhập mã để tìm hàng.');
      }
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library')
      ]);
      if (current !== session.current) return;
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (current !== session.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      setScanning(true);
      const available = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      if (current !== session.current) return;
      setDevices(available.filter((device) => device.kind === 'videoinput'));
      const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]]]);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 200, delayBetweenScanSuccess: 500 });
      const activeControls = await reader.decodeFromStream(media, video.current, (decoded) => {
        if (decoded && current === session.current) void lookupCode(decoded.getText());
      });
      if (current !== session.current) activeControls.stop();
      else controls.current = activeControls;
    } catch (err) {
      if (current === session.current) {
        releaseCamera();
        setScanning(false);
        setStarting(false);
        setError(cameraError(err));
      }
    } finally {
      if (current === session.current) setStarting(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Quét mã tìm hàng</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography>Đưa tem mã vạch vào camera. Có thể dùng camera điện thoại hoặc webcam máy tính.</Typography>
          <Box
            component="video"
            ref={video}
            autoPlay
            muted
            playsInline
            aria-label="Camera quét mã vạch"
            sx={{
              display: result ? 'none' : 'block',
              width: '100%',
              aspectRatio: '16 / 9',
              bgcolor: 'grey.900',
              borderRadius: 1,
              objectFit: 'contain'
            }}
          />
          <TextField
            select
            label="Camera"
            size="small"
            value={deviceId}
            disabled={starting || scanning}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            onChange={(event) => setDeviceId(event.target.value)}
          >
            <MenuItem value="">Tự động — ưu tiên camera sau</MenuItem>
            {devices.map((device, index) => (
              <MenuItem key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${index + 1}`}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" disabled={starting || scanning || loading} onClick={startCamera}>
              {starting ? 'Đang mở camera…' : 'Bật camera'}
            </Button>
            <Button disabled={!starting && !scanning} onClick={stopCamera}>
              Dừng camera
            </Button>
          </Stack>
          <Box
            component="form"
            onSubmit={(event) => {
              event.preventDefault();
              void lookupCode(code);
            }}
          >
            <Stack direction="row" spacing={1}>
              <TextField
                label="Mã vạch"
                size="small"
                fullWidth
                value={code}
                onChange={(event) => setCode(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 32 } }}
              />
              <Button type="submit" variant="contained" disabled={loading || !code.trim()} sx={{ flexShrink: 0 }}>
                {loading ? 'Đang tìm…' : 'Tìm hàng'}
              </Button>
            </Stack>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          {result && (
            <Stack spacing={1.5} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              {result.variant.image_url && (
                <Box
                  component="img"
                  src={result.variant.image_url}
                  alt={result.variant.product_name}
                  sx={{ width: 100, height: 100, objectFit: 'contain' }}
                />
              )}
              <Typography variant="h5">{variantLabel(result.variant)}</Typography>
              <Typography>{result.variant.barcode}</Typography>
              <Typography>
                Tổng tồn: {number(result.variant.stock_quantity)} · Chưa xếp: {number(result.variant.unassigned_quantity)}
              </Typography>
              <Typography variant="subtitle2">Vị trí lưu kho</Typography>
              {result.locations.length ? (
                result.locations.map((location) => (
                  <Typography key={location.product_location_id}>
                    {location.rack_code}
                    {location.level_number}: {number(location.quantity)} sản phẩm
                  </Typography>
                ))
              ) : (
                <Typography color="text.secondary">Chưa có hàng được xếp vào vị trí.</Typography>
              )}
              <Button component={Link} to={`/warehouse/locations?variant=${result.variant.detail_id}`} onClick={onClose} variant="outlined">
                Xem vị trí trên sơ đồ
              </Button>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
      </DialogActions>
    </Dialog>
  );
}
