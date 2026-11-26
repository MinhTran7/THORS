import { Box, IconButton, Typography } from '@mui/material';
import {
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  PhoneOutlined,
  StarFilled,
  StarOutlined,
  UserOutlined
} from '@ant-design/icons';
import { C as STORE, focusRing } from 'features/shop/storeTheme';
import { C, YELLOW } from '../theme';

const TONES = {
  neutral: { color: '#1F2937', bg: '#FFFFFF', border: C.border, hover: '#F8FAFC' },
  danger: { color: '#DC2626', bg: '#FFFFFF', border: '#FECACA', hover: '#FEF2F2' }
};

function ActionButton({ tone, icon, children, ...props }) {
  const t = TONES[tone];
  return (
    <Box
      component="button"
      type="button"
      {...props}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        height: 34,
        px: 1.5,
        borderRadius: '10px',
        border: `1px solid ${t.border}`,
        bgcolor: t.bg,
        color: t.color,
        fontFamily: 'inherit',
        fontSize: 13,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
        '&:hover': { bgcolor: t.hover },
        '&:disabled': { opacity: 0.6, cursor: 'default' },
        ...focusRing
      }}
    >
      {icon}
      {children}
    </Box>
  );
}

export default function AddressCard({ address: a, onDefault, onEdit, onDelete }) {
  return (
    <Box
      sx={{
        bgcolor: C.surface,
        borderRadius: '18px',
        border: a.isDefault ? `1.5px solid ${STORE.accent}` : `1px solid ${C.border}`,
        p: { xs: 2, sm: 2.5 },
        display: 'flex',
        flexDirection: 'column',
        gap: 2
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: '12px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: a.isDefault ? YELLOW.bg : STORE.sand,
            color: a.isDefault ? YELLOW.text : STORE.accent
          }}
        >
          <EnvironmentOutlined style={{ fontSize: 19 }} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 15.5, color: '#0F172A', lineHeight: 1.3, wordBreak: 'break-word' }}>
              {a.addressDetail}
            </Typography>
            {a.isDefault ? (
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  flexShrink: 0,
                  px: 1.25,
                  py: 0.35,
                  borderRadius: 99,
                  bgcolor: YELLOW.bg,
                  border: `1px solid ${YELLOW.border}`,
                  color: YELLOW.text,
                  fontSize: 11.5,
                  fontWeight: 800
                }}
              >
                <StarFilled style={{ fontSize: 11, color: YELLOW.star }} />
                Mặc định
              </Box>
            ) : (
              <IconButton
                size="small"
                disableRipple
                title="Đặt làm mặc định"
                aria-label="Đặt làm mặc định"
                onClick={onDefault}
                sx={{ flexShrink: 0, mt: -0.5, mr: -0.5, '&:hover': { bgcolor: 'transparent' } }}
              >
                <StarOutlined style={{ fontSize: 20, color: YELLOW.star }} />
              </IconButton>
            )}
          </Box>
          <Typography sx={{ fontSize: 13.5, color: C.muted, mt: 0.25, lineHeight: 1.5 }}>
            {a.wardName}, {a.provinceName}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2.5, rowGap: 0.5, color: '#374151', fontSize: 13.5 }}>
        <Box title="Tên người nhận" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontWeight: 700 }}>
          <UserOutlined style={{ fontSize: 14, color: C.muted }} />
          {a.recipientName}
        </Box>
        <Box title="Số điện thoại" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          <PhoneOutlined style={{ fontSize: 14, color: C.muted }} />
          {a.phone}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        {a.isDefault ? <Typography sx={{ fontSize: 13, color: C.muted }}>Ưu tiên khi thanh toán</Typography> : <Box />}

        <Box sx={{ display: 'flex', gap: 1 }}>
          <ActionButton tone="neutral" onClick={onEdit} icon={<EditOutlined style={{ fontSize: 13 }} />}>
            Chỉnh sửa
          </ActionButton>
          <ActionButton tone="danger" onClick={onDelete} icon={<DeleteOutlined style={{ fontSize: 13 }} />}>
            Xóa
          </ActionButton>
        </Box>
      </Box>
    </Box>
  );
}
