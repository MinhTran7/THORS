import { lazy, Suspense, useEffect, useState } from 'react';
import { Box, Chip, IconButton, Tooltip, Typography } from '@mui/material';
import { AimOutlined, RedoOutlined, RotateRightOutlined, UndoOutlined } from '@ant-design/icons';
import { C } from 'features/shop/storeTheme';
import { cardSx } from 'features/customer/theme';
import { DRAG_TYPE } from './wardrobeData';

// Thư viện 3D khá nặng: chỉ tải khi mở Phòng thử đồ (dùng chung AvatarViewer với trang Số đo của tôi)
const AvatarViewer = lazy(() => import('features/fitting/avatar/AvatarViewer'));

// Dáng = tên animation trong file người mẫu (thors_*_avatar.glb); null = đứng yên tư thế gốc
const POSES = [
  [null, 'Đứng yên'],
  ['Idle', 'Thả lỏng'],
  ['Walk', 'Đi bộ'],
  ['Turn', 'Xoay người'],
  ['Fashion_Pose', 'Tạo dáng'],
  ['Arms_Raised', 'Giơ tay'],
  ['Elbows_Bent', 'Co tay'],
  ['Knees_Bent', 'Khuỵu gối'],
  ['Leg_Lift', 'Nhấc chân']
];

// Đang gõ trong ô nhập thì Ctrl+Z là hoàn tác chữ, không phải hoàn tác phòng thử đồ
const isTyping = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * Khung 3D của Phòng thử đồ: người mẫu theo số đo + quần áo 3D đang mặc (wear) + thanh công cụ (hoàn tác / làm lại, tự xoay, đặt lại góc nhìn).
 * Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) cũng hoàn tác / làm lại.
 */
export default function AvatarStudio({ profile, wear, canUndo, canRedo, onUndo, onRedo, onDropProduct, drawer }) {
  const [autoRotate, setAutoRotate] = useState(false);
  const [pose, setPose] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [viewResetKey, setViewResetKey] = useState(0);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || isTyping(document.activeElement)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey && canUndo) {
        e.preventDefault();
        onUndo();
      } else if ((key === 'y' || (key === 'z' && e.shiftKey)) && canRedo) {
        e.preventDefault();
        onRedo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canUndo, canRedo, onUndo, onRedo]);

  const tools = [
    { label: 'Hoàn tác (Ctrl+Z)', icon: <UndoOutlined />, onClick: onUndo, disabled: !canUndo },
    { label: 'Làm lại (Ctrl+Y)', icon: <RedoOutlined />, onClick: onRedo, disabled: !canRedo },
    {
      label: autoRotate ? 'Dừng xoay' : 'Tự xoay',
      icon: <RotateRightOutlined />,
      onClick: () => setAutoRotate((v) => !v),
      pressed: autoRotate
    },
    { label: 'Đặt lại góc nhìn', icon: <AimOutlined />, onClick: () => setViewResetKey((k) => k + 1) }
  ];

  return (
    <Box
      sx={{
        ...cardSx,
        position: 'relative',
        height: { xs: 460, md: 640 },
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #F7F5F2 0%, #ECE8E2 100%)',
        outline: dragOver ? `2px dashed ${C.primary}` : 'none',
        outlineOffset: -6
      }}
      // Kéo một món từ Tủ đồ thả lên người mẫu -> mở chọn size / màu của món đó
      onDragOver={(e) => {
        if (!onDropProduct || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        const id = Number(e.dataTransfer.getData(DRAG_TYPE));
        if (id && onDropProduct) {
          e.preventDefault();
          onDropProduct(id);
        }
      }}
    >
      <Suspense fallback={null}>
        <AvatarViewer profile={profile} wear={wear} pose={pose} autoRotate={autoRotate} viewResetKey={viewResetKey} />
      </Suspense>

      {/* Thanh công cụ nổi trên khung 3D */}
      <Box
        sx={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 0.5,
          p: 0.5,
          bgcolor: 'rgba(255,255,255,0.92)',
          borderRadius: '999px',
          boxShadow: '0 6px 18px -10px rgba(17,17,17,0.35)'
        }}
      >
        {tools.map(({ label, icon, onClick, disabled, pressed }) => (
          <Tooltip key={label} title={label}>
            {/* span: Tooltip vẫn hiện khi nút bị vô hiệu */}
            <span>
              <IconButton
                aria-label={label}
                aria-pressed={pressed}
                onClick={onClick}
                disabled={disabled}
                size="small"
                sx={{
                  width: 36,
                  height: 36,
                  color: pressed ? '#fff' : C.ink,
                  bgcolor: pressed ? C.primary : 'transparent',
                  '&:hover': { bgcolor: pressed ? C.primaryDark : C.sand }
                }}
              >
                {icon}
              </IconButton>
            </span>
          </Tooltip>
        ))}
      </Box>

      {/* Kho đồ / bảng công cụ nổi trên khung 3D: desktop bên trái, mobile ngăn kéo dưới; người mẫu vẫn nhìn thấy */}
      {drawer && (
        <Box
          sx={{
            position: 'absolute',
            zIndex: 2,
            top: { xs: 'auto', md: 70 },
            bottom: { xs: 0, md: 80 },
            left: { xs: 0, md: 12 },
            right: { xs: 0, md: 'auto' },
            width: { xs: 'auto', md: 320 },
            height: { xs: '62%', md: 'auto' },
            p: 1.75,
            bgcolor: 'rgba(255,255,255,0.96)',
            backdropFilter: 'blur(6px)',
            borderRadius: { xs: '18px 18px 0 0', md: '16px' },
            boxShadow: '0 18px 40px -18px rgba(17,17,17,0.35)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            '@keyframes thorsDrawerIn': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
            animation: 'thorsDrawerIn .18s ease-out'
          }}
        >
          {drawer}
        </Box>
      )}

      {/* Chọn dáng */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 34,
          left: 12,
          right: 12,
          display: 'flex',
          gap: 0.5,
          flexWrap: 'wrap',
          justifyContent: 'center'
        }}
      >
        {POSES.map(([name, label]) => (
          <Chip
            key={label}
            size="small"
            label={label}
            clickable
            onClick={() => setPose(name)}
            sx={{
              fontWeight: 600,
              bgcolor: pose === name ? C.primary : 'rgba(255,255,255,0.92)',
              color: pose === name ? '#fff' : C.ink,
              '&:hover': { bgcolor: pose === name ? C.primaryDark : '#fff' }
            }}
          />
        ))}
      </Box>

      <Typography
        sx={{ position: 'absolute', bottom: 10, width: '100%', textAlign: 'center', fontSize: 12, color: C.muted, pointerEvents: 'none' }}
      >
        Kéo để xoay · lăn chuột để phóng to · kéo đồ từ Tủ đồ thả lên người mẫu
      </Typography>
    </Box>
  );
}
