import { Box } from '@mui/material';
import { C } from './theme';

export const fullAddress = (detail, wardName, provinceName) => [detail, wardName, provinceName].filter(Boolean).join(', ');

export default function AddressMap({ query, height = 260 }) {
  return (
    <Box
      component="iframe"
      title="Bản đồ địa chỉ"
      src={`https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      sx={{ display: 'block', width: '100%', height, border: `1px solid ${C.border}`, borderRadius: 2.5 }}
    />
  );
}
