import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Box, Button, IconButton, Popover, Tooltip, Typography } from '@mui/material';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons';

/**
 * Tăng / giảm cỡ chữ cho các trang quản lý (người dùng tự chỉnh, lưu trong trình duyệt):
 *  - "all": toàn bộ chữ, đơn vị px so với chữ thường 14px. +2 = mọi chữ to hơn khoảng 2px (phóng theo tỉ lệ
 *    cả khung quản lý, vì nhiều trang ghi cỡ chữ cố định nên chỉ phóng tỉ lệ mới đều được).
 *  - "table": chỉ chữ trong bảng, cộng thẳng vào cỡ chữ bảng (PAGE_TYPE.th / td / tdSub dùng biến CSS này).
 * Trang cửa hàng của khách không bị ảnh hưởng: hiệu lực chỉ khi ThorsLayout đang mở (useFontScaleEffect).
 */

const KEY = 'thors.fontScale';
const BASE = 14;
export const FONT_STEP_MIN = -3;
export const FONT_STEP_MAX = 4;
const clamp = (n) => Math.max(FONT_STEP_MIN, Math.min(FONT_STEP_MAX, Math.round(Number(n) || 0)));

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { all: clamp(raw.all), table: clamp(raw.table) };
  } catch {
    return { all: 0, table: 0 };
  }
}

let state = read();
const listeners = new Set();
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function setFontScale(patch) {
  state = { all: clamp(patch.all ?? state.all), table: clamp(patch.table ?? state.table) };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // trình duyệt chặn lưu thì vẫn áp dụng trong lần mở này
  }
  listeners.forEach((fn) => fn());
}

export const useFontScale = () => useSyncExternalStore(subscribe, () => state);

/** Gắn vào layout trang quản lý: áp cỡ chữ đang chọn, gỡ ra khi rời layout (sang trang cửa hàng). */
export function useFontScaleEffect(enabled = true) {
  const { all, table } = useFontScale();
  useEffect(() => {
    if (!enabled) return undefined;
    const root = document.documentElement;
    root.style.setProperty('--thors-fs-table', `${table}px`);
    root.style.zoom = all ? String((BASE + all) / BASE) : '';
    return () => {
      root.style.removeProperty('--thors-fs-table');
      root.style.zoom = '';
    };
  }, [all, table, enabled]);
}

const signed = (n) => (n > 0 ? `+${n}` : String(n));

function StepRow({ label, hint, value, onChange }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{label}</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{hint}</Typography>
      </Box>
      <IconButton
        size="small"
        aria-label={`Giảm ${label.toLowerCase()}`}
        disabled={value <= FONT_STEP_MIN}
        onClick={() => onChange(value - 1)}
        sx={{ border: 1, borderColor: 'divider' }}
      >
        <MinusOutlined style={{ fontSize: 12 }} />
      </IconButton>
      <Typography aria-live="polite" sx={{ width: 32, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>
        {signed(value)}
      </Typography>
      <IconButton
        size="small"
        aria-label={`Tăng ${label.toLowerCase()}`}
        disabled={value >= FONT_STEP_MAX}
        onClick={() => onChange(value + 1)}
        sx={{ border: 1, borderColor: 'divider' }}
      >
        <PlusOutlined style={{ fontSize: 12 }} />
      </IconButton>
    </Box>
  );
}

/** Nút "Aa" trên header: mở bảng chỉnh cỡ chữ. */
export function FontScaleButton() {
  const { all, table } = useFontScale();
  const anchor = useRef(null);
  const [open, setOpen] = useState(false);
  const changed = all !== 0 || table !== 0;
  return (
    <>
      <Tooltip title="Cỡ chữ">
        <IconButton
          ref={anchor}
          aria-label="Chỉnh cỡ chữ"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          sx={{ fontWeight: 700, fontSize: 15, width: 36, height: 36, color: changed ? 'primary.main' : 'text.secondary' }}
        >
          Aa
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchor.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 1, p: 2, width: 320, maxWidth: 'calc(100vw - 32px)', borderRadius: 2 } } }}
      >
        <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 0.5 }}>Cỡ chữ</Typography>
        <StepRow label="Toàn bộ chữ" hint="Mọi chữ trên trang quản lý" value={all} onChange={(v) => setFontScale({ all: v })} />
        <StepRow label="Chữ trong bảng" hint="Chỉ các bảng danh sách" value={table} onChange={(v) => setFontScale({ table: v })} />
        <Button size="small" disabled={!changed} onClick={() => setFontScale({ all: 0, table: 0 })} sx={{ mt: 1, textTransform: 'none' }}>
          Về mặc định
        </Button>
      </Popover>
    </>
  );
}
