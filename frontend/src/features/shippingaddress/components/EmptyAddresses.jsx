import { Box, Typography } from '@mui/material';
import { EnvironmentOutlined, PlusOutlined } from '@ant-design/icons';
import { C as STORE } from 'features/shop/storeTheme';
import { C, addButtonSx, cardSx } from '../theme';

export default function EmptyAddresses({ onAdd }) {
  return (
    <Box sx={{ ...cardSx, p: { xs: 4, md: 8 }, textAlign: 'center', boxShadow: 'none', border: `1px solid ${C.border}` }}>
      <Box
        sx={{
          width: 112,
          height: 112,
          mx: 'auto',
          mb: 2.5,
          borderRadius: '50%',
          bgcolor: STORE.sand,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <EnvironmentOutlined style={{ fontSize: 40, color: STORE.accent }} />
      </Box>
      <Typography sx={{ fontSize: 18, fontWeight: 800, mb: 1 }}>Bạn chưa lưu địa chỉ giao hàng nào</Typography>
      <Typography sx={{ fontSize: 13.5, color: C.muted, maxWidth: 420, mx: 'auto', mb: 3, lineHeight: 1.6 }}>
        Thêm địa chỉ nhận hàng để thanh toán nhanh hơn và theo dõi đơn hàng chính xác.
      </Typography>
      <Box component="button" type="button" onClick={onAdd} sx={addButtonSx}>
        <PlusOutlined />
        Thêm địa chỉ giao hàng
      </Box>
    </Box>
  );
}
