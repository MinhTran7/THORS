import { Box, IconButton } from '@mui/material';
import { CloseOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

export default function ErrorBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        mb: 2.5,
        px: 2,
        py: 1.25,
        borderRadius: '12px',
        bgcolor: '#FEF2F2',
        border: '1px solid #FECACA',
        color: '#B91C1C',
        fontSize: 13.5,
        fontWeight: 600
      }}
    >
      <ExclamationCircleOutlined style={{ fontSize: 16 }} />
      <Box sx={{ flex: 1 }}>{message}</Box>
      <IconButton size="small" onClick={onClose} sx={{ color: '#B91C1C' }}>
        <CloseOutlined style={{ fontSize: 12 }} />
      </IconButton>
    </Box>
  );
}
