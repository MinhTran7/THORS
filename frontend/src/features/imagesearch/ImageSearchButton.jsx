import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { iconBtnSx } from 'features/shop/storeTheme';
import { imageSearchApi } from './api';
import ImageSearchDialog, { CameraIcon } from './ImageSearchDialog';

// Hỏi backend một lần cho cả trang: tính năng đang bật thì mới hiện nút máy ảnh.
let statusPromise;
function useImageSearchEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!statusPromise) statusPromise = imageSearchApi.status().catch(() => ({ enabled: false }));
    statusPromise.then((s) => alive && setEnabled(Boolean(s?.enabled)));
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}

/** Nút máy ảnh cạnh ô tìm kiếm; bấm mở hộp thoại tìm bằng hình ảnh. variant="text" hiện thêm chữ. */
export default function ImageSearchButton({ variant = 'icon', sx }) {
  const enabled = useImageSearchEnabled();
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  return (
    <>
      <Box
        component="button"
        type="button"
        aria-label="Tìm bằng hình ảnh"
        title="Tìm bằng hình ảnh"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        sx={{ ...iconBtnSx, ...(variant === 'text' ? { width: 'auto', gap: 1, px: 1.5, fontSize: 14, whiteSpace: 'nowrap' } : {}), ...sx }}
      >
        <CameraIcon />
        {variant === 'text' && <span>Tìm bằng ảnh</span>}
      </Box>
      <ImageSearchDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
