import { Box, Typography } from '@mui/material';
import { C } from 'features/shop/storeTheme';

// Icon nét mảnh (24x24) cho từng ô trang bị
const ICONS = {
  TOP: 'M8 3l-5 3 2 5 2-1v11h10V10l2 1 2-5-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z',
  OUTER: 'M8 3L3 6l1 15h5V9M16 3l5 3-1 15h-5V9M8 3c1 2 2.5 3 4 3s3-1 4-3M12 6v15',
  BOTTOM: 'M6 3h12l1 18h-5l-2-11-2 11H5L6 3z',
  DRESS: 'M9 3h6l-1 5 5 13H5l5-13-1-5z',
  SHOES: 'M3 15c3 0 5-1 6-4l3 1c1 2 4 3 9 3v4H3v-4z',
  BODY: 'M12 3a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM7 21l2-8-3-3 6-1 6 1-3 3 2 8',
  SUGGEST: 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5zM19 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z'
};

/** Ô trang bị (thứ tự hiện), ô công cụ ở cuối. Phụ kiện / thắt lưng: mở khi có file 3D phụ kiện. */
export const EQUIP_SLOTS = [
  ['TOP', 'Áo'],
  ['OUTER', 'Áo khoác'],
  ['BOTTOM', 'Quần / chân váy'],
  ['DRESS', 'Đầm / váy liền'],
  ['SHOES', 'Giày']
];
const TOOLS = [
  ['BODY', 'Dáng người'],
  ['SUGGEST', 'Gợi ý bộ']
];

function SlotButton({ id, label, on, worn, onClick }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={worn ? `${label}: ${worn.productName}` : label}
      sx={{
        position: 'relative',
        flex: '0 0 auto',
        width: { xs: 64, md: 76 },
        p: 0.75,
        border: `1.5px solid ${on ? C.primary : C.line}`,
        borderRadius: '14px',
        bgcolor: on ? C.primary : '#fff',
        color: on ? '#fff' : C.ink,
        cursor: 'pointer',
        font: 'inherit',
        display: 'grid',
        justifyItems: 'center',
        gap: 0.25,
        boxShadow: on ? '0 8px 18px -10px rgba(138,43,43,0.6)' : 'none',
        transition: 'all .15s',
        '&:hover': { borderColor: C.primary }
      }}
    >
      {/* Đang mặc: ảnh nhỏ của món thay cho icon */}
      {worn?.imageUrl ? (
        <Box
          component="img"
          src={worn.imageUrl}
          alt=""
          sx={{ width: 34, height: 34, borderRadius: '8px', objectFit: 'cover', border: '1px solid rgba(0,0,0,0.08)' }}
        />
      ) : (
        <Box
          component="svg"
          viewBox="0 0 24 24"
          sx={{ width: 30, height: 30, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round' }}
        >
          <path d={ICONS[id]} />
        </Box>
      )}
      <Typography sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1.15, textAlign: 'center' }}>{label}</Typography>
      {worn && (
        <Box sx={{ position: 'absolute', top: 5, right: 5, width: 8, height: 8, borderRadius: '50%', bgcolor: on ? '#fff' : '#1F7A4D' }} />
      )}
    </Box>
  );
}

/**
 * Cột ô trang bị kiểu game: bấm ô -> mở kho đồ của ô đó; bấm lại -> đóng; ô đang mặc có chấm xanh + ảnh món.
 * Desktop: cột dọc bên trái người mẫu; mobile: hàng ngang cuộn được.
 */
export default function EquipmentSlots({ slots, panel, onToggle }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'row', md: 'column' },
        gap: 1,
        overflowX: { xs: 'auto', md: 'visible' },
        pb: { xs: 0.5, md: 0 }
      }}
    >
      {EQUIP_SLOTS.map(([id, label]) => (
        <SlotButton key={id} id={id} label={label} on={panel === id} worn={slots[id]} onClick={() => onToggle(id)} />
      ))}
      <Box
        sx={{ flex: '0 0 auto', width: { xs: '1px', md: '100%' }, height: { xs: 'auto', md: '1px' }, bgcolor: C.line, my: { md: 0.5 } }}
      />
      {TOOLS.map(([id, label]) => (
        <SlotButton key={id} id={id} label={label} on={panel === id} onClick={() => onToggle(id)} />
      ))}
    </Box>
  );
}
