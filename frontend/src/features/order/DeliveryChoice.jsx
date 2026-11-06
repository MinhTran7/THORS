import { useEffect, useRef } from 'react';
import useSWR from 'swr';
import { Alert, Box, CircularProgress, Link, MenuItem, TextField, Typography } from '@mui/material';
import { EnvironmentOutlined } from '@ant-design/icons';
import { Stack } from 'features/account/components/Flex';
import { brand } from 'features/account/tokens';
import { ordersApi } from './api';
import { CARRIERS, carrierLabel } from './orderActions';
import GhnAddressFields from './GhnAddressFields';

const formatKm = (value) => `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} km`;

/**
 * Chọn hình thức giao trong hộp thoại "Giao hàng": hiện khoảng cách từ cửa hàng tới địa chỉ giao,
 * tự chọn sẵn hình thức được gợi ý (tự giao nếu gần, gửi hãng nếu xa); chủ shop vẫn đổi được.
 * Chọn GHN thì hiện thêm phần chọn địa chỉ theo GHN và cân nặng (ghn / onGhnChange).
 */
export default function DeliveryChoice({ orderId, address, carrier, onChange, ghn, onGhnChange, onBlockedChange }) {
  const { data, error, isLoading } = useSWR(['delivery-suggestion', orderId], () => ordersApi.deliverySuggestion(orderId), {
    revalidateOnFocus: false
  });
  const touched = useRef(false);
  const suggested = data?.suggestedCarrier ?? null;
  // Không tìm thấy địa chỉ trên bản đồ: không cho bàn giao với bất kỳ hình thức giao nào
  const blocked = Boolean(data?.addressNotFound);

  useEffect(() => {
    onBlockedChange?.(blocked);
  }, [blocked, onBlockedChange]);

  // Khi có gợi ý thì chọn sẵn, trừ khi chủ shop đã tự đổi trước đó
  useEffect(() => {
    if (suggested && !touched.current) onChange(suggested);
  }, [suggested, onChange]);

  const differs = suggested && carrier !== suggested;

  return (
    <Box>
      <Box sx={{ p: 1.5, bgcolor: '#FAFAF7', border: `1px solid ${brand.line}`, borderRadius: '10px', mb: 2 }}>
        <Typography variant="body2" sx={{ color: brand.muted }}>
          Địa chỉ giao:{' '}
          <Typography component="span" variant="body2" sx={{ color: brand.ink, fontWeight: 600 }}>
            {address || '—'}
          </Typography>
        </Typography>

        {isLoading && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, color: brand.muted }}>
            <CircularProgress size={14} />
            <Typography variant="body2">Đang tính khoảng cách…</Typography>
          </Stack>
        )}

        {data?.distanceKm != null && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
            <EnvironmentOutlined style={{ color: brand.muted }} />
            <Typography variant="body2" sx={{ color: brand.ink }}>
              Cách cửa hàng{' '}
              <strong>
                {data.approximate ? '~' : ''}
                {formatKm(data.distanceKm)}
              </strong>
              {' · '}Gợi ý: <strong>{carrierLabel(data.suggestedCarrier)}</strong>
            </Typography>
            {data.mapUrl && (
              <Link href={data.mapUrl} target="_blank" rel="noopener noreferrer" variant="body2" underline="hover">
                Xem đường đi
              </Link>
            )}
          </Stack>
        )}

        {data?.note && !blocked && (
          <Typography variant="caption" sx={{ color: brand.muted, display: 'block', mt: 0.5 }}>
            {data.note}
          </Typography>
        )}
      </Box>

      {blocked && (
        <Alert severity="error" sx={{ mb: 1.5, borderRadius: '8px' }}>
          {data.note}
        </Alert>
      )}

      {error && (
        <Alert severity="warning" sx={{ mb: 1.5, borderRadius: '8px' }}>
          Không tính được khoảng cách, vui lòng tự chọn hình thức giao.
        </Alert>
      )}

      <TextField
        select
        fullWidth
        margin="dense"
        label="Hình thức giao hàng"
        value={carrier}
        disabled={blocked}
        onChange={(e) => {
          touched.current = true;
          onChange(e.target.value);
        }}
        helperText={
          differs
            ? `Bạn đang chọn khác gợi ý (bán kính tự giao: ${formatKm(data.selfRadiusKm)}).`
            : carrier === 'SELF'
              ? 'Cửa hàng tự giao, không cần mã vận đơn.'
              : 'Giao qua đơn vị vận chuyển đối tác.'
        }
        slotProps={{ select: { sx: { borderRadius: '10px' } } }}
      >
        {CARRIERS.map((item) => (
          <MenuItem key={item.value} value={item.value}>
            {item.label}
            {item.value === suggested ? ' (gợi ý)' : ''}
          </MenuItem>
        ))}
      </TextField>

      {carrier === 'GHN' && onGhnChange && !blocked && <GhnAddressFields orderId={orderId} value={ghn} onChange={onGhnChange} />}
    </Box>
  );
}