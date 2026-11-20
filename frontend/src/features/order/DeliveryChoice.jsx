import { useEffect, useRef } from 'react';
import useSWR from 'swr';
import { Box, Link, MenuItem, TextField, Typography } from '@mui/material';
import { EnvironmentOutlined } from '@ant-design/icons';
import { Stack } from 'features/account/components/Flex';
import { brand } from 'features/account/tokens';
import { ordersApi } from './api';
import { CARRIERS } from './orderActions';
import GhnAddressFields from './GhnAddressFields';

/**
 * Chọn hình thức giao trong hộp thoại "Giao hàng": hiện địa chỉ giao kèm link "Xem đường đi" (Google Maps,
 * từ cửa hàng tới địa chỉ khách) để chủ shop tự xem xa gần; chọn sẵn hình thức mặc định (gửi GHN), chủ shop
 * đổi sang tự giao nếu muốn. Chọn GHN thì hiện thêm phần chọn địa chỉ theo GHN và cân nặng (ghn / onGhnChange).
 */
export default function DeliveryChoice({ orderId, address, carrier, onChange, ghn, onGhnChange }) {
  const { data } = useSWR(['delivery-suggestion', orderId], () => ordersApi.deliverySuggestion(orderId), {
    revalidateOnFocus: false
  });
  const touched = useRef(false);
  const defaultCarrier = data?.defaultCarrier ?? null;

  // Chọn sẵn hình thức mặc định, trừ khi chủ shop đã tự đổi trước đó
  useEffect(() => {
    if (defaultCarrier && !touched.current) onChange(defaultCarrier);
  }, [defaultCarrier, onChange]);

  return (
    <Box>
      <Box sx={{ p: 1.5, bgcolor: '#FAFAF7', border: `1px solid ${brand.line}`, borderRadius: '10px', mb: 2 }}>
        <Typography variant="body2" sx={{ color: brand.muted }}>
          Địa chỉ giao:{' '}
          <Typography component="span" variant="body2" sx={{ color: brand.ink, fontWeight: 600 }}>
            {address || '—'}
          </Typography>
        </Typography>

        {data?.mapUrl && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            <EnvironmentOutlined style={{ color: brand.muted }} />
            <Link href={data.mapUrl} target="_blank" rel="noopener noreferrer" variant="body2" underline="hover">
              Xem đường đi
            </Link>
          </Stack>
        )}
      </Box>

      <TextField
        select
        fullWidth
        margin="dense"
        label="Hình thức giao hàng"
        value={carrier}
        onChange={(e) => {
          touched.current = true;
          onChange(e.target.value);
        }}
        helperText={
          carrier === 'SELF' ? 'Cửa hàng tự giao, không cần mã vận đơn.' : 'Tạo vận đơn GHN; trạng thái đơn tự cập nhật theo GHN.'
        }
        slotProps={{ select: { sx: { borderRadius: '10px' } } }}
      >
        {CARRIERS.map((item) => (
          <MenuItem key={item.value} value={item.value}>
            {item.label}
          </MenuItem>
        ))}
      </TextField>

      {carrier === 'GHN' && onGhnChange && <GhnAddressFields orderId={orderId} value={ghn} onChange={onGhnChange} />}
    </Box>
  );
}
