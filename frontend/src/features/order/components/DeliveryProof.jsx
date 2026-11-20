import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Typography } from '@mui/material';
import { CameraOutlined, CloseOutlined } from '@ant-design/icons';
import { formatLogDate, formatTime } from 'features/account/format';
import { brand } from 'features/account/tokens';
import { ordersApi } from '../api';

// Giới hạn khớp với backend (DeliveryProofService)
const MAX_IMAGES = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_NOTE = 255;
const IMAGE_TYPES = ['image/jpeg', 'image/png'];

/** Có bắt buộc ảnh minh chứng khi xác nhận đã giao không. Chưa biết (đang tải / lỗi) thì coi như có. */
export function useDeliveryProofRequired(enabled = true) {
  const { data } = useSWR(enabled ? ['delivery-proof-required'] : null, () => ordersApi.deliveryProofRequired(), {
    revalidateOnFocus: true
  });
  return data ? Boolean(data.required) : true;
}

/**
 * Hộp thoại "Xác nhận đã giao": người giao chụp / chọn 1–3 ảnh lúc giao (khách cầm hàng, hàng trước cửa...)
 * và ghi chú tùy chọn. order: { id, orderNumber, deliveryName } hoặc null để đóng.
 */
export function DeliveryProofDialog({ order, onClose, onDone }) {
  const [files, setFiles] = useState([]); // [{ file, url }]
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);
  const latest = useRef(files);
  latest.current = files;
  const open = Boolean(order);

  // Mở hộp thoại cho đơn khác (hoặc đóng) thì làm mới form và giải phóng ảnh xem trước cũ
  useEffect(() => {
    latest.current.forEach((f) => URL.revokeObjectURL(f.url));
    setFiles([]);
    setNote('');
    setError('');
  }, [order?.id]);

  // Rời trang khi hộp thoại còn ảnh thì cũng giải phóng
  useEffect(() => () => latest.current.forEach((f) => URL.revokeObjectURL(f.url)), []);

  const pick = (event) => {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = '';
    setError('');
    const bad = chosen.find((file) => !IMAGE_TYPES.includes(file.type));
    if (bad) return setError('Chỉ nhận ảnh JPG hoặc PNG.');
    const big = chosen.find((file) => file.size > MAX_BYTES);
    if (big) return setError('Mỗi ảnh tối đa 5 MB.');
    if (files.length + chosen.length > MAX_IMAGES) return setError(`Tối đa ${MAX_IMAGES} ảnh minh chứng.`);
    setFiles((current) => [...current, ...chosen.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };

  const remove = (index) => {
    URL.revokeObjectURL(files[index].url);
    setFiles((current) => current.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (files.length === 0) return setError('Vui lòng chụp ít nhất 1 ảnh lúc giao hàng.');
    setBusy(true);
    setError('');
    try {
      await ordersApi.confirmDelivered(
        order.id,
        files.map((f) => f.file),
        note.trim()
      );
      await onDone?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Không xác nhận được đã giao.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 700 }}>Xác nhận đã giao{order?.orderNumber ? ` · ${order.orderNumber}` : ''}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: brand.muted, mb: 2 }}>
          Chụp ảnh lúc giao làm minh chứng hàng đã đến tay khách{order?.deliveryName ? ` (${order.deliveryName})` : ''}: khách cầm
          hàng, hàng đặt trước cửa hoặc người nhận thay. Cần ít nhất 1 ảnh, tối đa {MAX_IMAGES} ảnh. Khách sẽ xem được ảnh này
          trong đơn của họ.
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
          {files.map((f, index) => (
            <Box key={f.url} sx={{ position: 'relative', aspectRatio: '1', borderRadius: '10px', overflow: 'hidden', bgcolor: brand.neutralBg }}>
              <Box component="img" src={f.url} alt={`Ảnh minh chứng ${index + 1}`} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <IconButton
                size="small"
                aria-label="Bỏ ảnh này"
                disabled={busy}
                onClick={() => remove(index)}
                sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' } }}
              >
                <CloseOutlined style={{ fontSize: 12 }} />
              </IconButton>
            </Box>
          ))}
          {files.length < MAX_IMAGES && (
            <Box
              component="button"
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              sx={{
                aspectRatio: '1',
                borderRadius: '10px',
                border: `1.5px dashed ${brand.line}`,
                bgcolor: brand.surface,
                color: brand.muted,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.75,
                fontSize: 13,
                fontWeight: 600,
                '&:hover': { borderColor: brand.cyan, color: brand.ink }
              }}
            >
              <CameraOutlined style={{ fontSize: 22 }} />
              {files.length === 0 ? 'Chụp / chọn ảnh' : 'Thêm ảnh'}
            </Box>
          )}
        </Box>
        {/* capture: trên điện thoại mở thẳng camera sau; trên máy tính là chọn file bình thường */}
        <input ref={input} type="file" accept="image/jpeg,image/png" capture="environment" multiple hidden onChange={pick} />

        <TextField
          fullWidth
          multiline
          minRows={2}
          margin="normal"
          label="Ghi chú (không bắt buộc)"
          placeholder="Ví dụ: khách nhờ gửi bảo vệ tòa nhà"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          inputProps={{ maxLength: MAX_NOTE }}
        />

        {error && (
          <Typography color="error" variant="body2" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button disabled={busy} onClick={onClose}>
          Quay lại
        </Button>
        <Button variant="contained" disableElevation disabled={busy || files.length === 0} onClick={submit}>
          {busy ? 'Đang tải ảnh...' : 'Xác nhận đã giao'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Minh chứng giao hàng của một đơn (ảnh, ghi chú, thời điểm, người giao). Chỉ tải khi đơn đã giao; không có
 * minh chứng thì không hiện gì. render(content) để trang tự bọc vào khung theo giao diện của mình.
 */
export function DeliveryProofView({ order, render }) {
  const delivered = ['DELIVERED', 'COMPLETED'].includes(order.orderStatus);
  const { data } = useSWR(delivered ? ['order-proof', order.id] : null, () => ordersApi.deliveryProof(order.id));
  const proof = data?.proof;
  if (!proof || proof.imageUrls.length === 0) return null;

  const when = proof.createdAt ? `${formatLogDate(proof.createdAt)} · ${formatTime(proof.createdAt)}` : null;
  return render(
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.25 }}>
        {proof.imageUrls.map((url, index) => (
          <Box
            key={url}
            component="a"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ display: 'block', aspectRatio: '1', borderRadius: '10px', overflow: 'hidden', bgcolor: brand.neutralBg }}
          >
            <Box component="img" src={url} alt={`Ảnh giao hàng ${index + 1}`} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Box>
        ))}
      </Box>
      {proof.note && (
        <Typography variant="body2" sx={{ mt: 1.5, whiteSpace: 'pre-line' }}>
          Ghi chú: {proof.note}
        </Typography>
      )}
      {(when || proof.createdByName) && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: brand.muted }}>
          {['Giao lúc ' + (when ?? '—'), proof.createdByName].filter(Boolean).join(' · ')}
        </Typography>
      )}
    </Box>
  );
}
