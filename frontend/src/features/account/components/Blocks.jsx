import { Box, Button, IconButton, InputAdornment, MenuItem, TableCell, TableRow, TextField, Typography } from '@mui/material';
import { Stack } from './Flex';
import { InfoCircleOutlined, LeftOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { brand, cardSx, fs } from '../tokens';
import { PAGE_TYPE, pageSubtitleSx, pageTitleSx } from 'themes/pageType';

// Không có nút "Quay lại": đường dẫn (breadcrumb) trên header đã có link về trang trước
export function PageHeader({ title, subtitle, action }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={2}>
        <Box>
          <Typography variant="h3" sx={{ ...pageTitleSx, color: brand.ink }}>
            {title}
          </Typography>
          {subtitle && <Typography sx={{ ...pageSubtitleSx, color: brand.muted, mt: 0.75 }}>{subtitle}</Typography>}
        </Box>
        {action}
      </Stack>
    </Box>
  );
}

export function NoticeBox({ title, children, icon = <InfoCircleOutlined />, sx }) {
  return (
    <Box
      sx={{
        bgcolor: brand.yellowSoft,
        border: `1px solid ${brand.yellowLine}`,
        borderRadius: '12px',
        p: 2,
        display: 'flex',
        gap: 1.5,
        ...sx
      }}
    >
      <Box sx={{ color: brand.ink, pt: '2px', fontSize: 16 }}>{icon}</Box>
      <Box>
        {title && (
          <Typography variant="subtitle2" sx={{ color: brand.ink, fontWeight: 700, fontSize: fs.body }}>
            {title}
          </Typography>
        )}
        <Typography sx={{ color: brand.muted, display: 'block', fontSize: fs.caption, lineHeight: 1.55 }}>{children}</Typography>
      </Box>
    </Box>
  );
}

export function StatCard({ label, value, caption, icon, warning = false, loading = false }) {
  return (
    <Box
      sx={{ ...cardSx, p: 2, bgcolor: warning ? brand.yellowSoft : brand.surface, borderColor: warning ? brand.yellowLine : brand.line }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography sx={{ color: brand.muted, fontSize: fs.body }}>{label}</Typography>
        <Box sx={{ color: brand.ink, fontSize: 20 }}>{icon}</Box>
      </Stack>
      <Typography sx={{ fontSize: 28, lineHeight: 1.2, fontWeight: 500, color: brand.ink, my: 0.25 }}>{loading ? '—' : value}</Typography>
      <Typography sx={{ color: brand.muted, fontSize: fs.caption }}>{caption}</Typography>
    </Box>
  );
}

export function StatRow({ children }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 2, mb: 2 }}>{children}</Box>;
}

export function SearchField({ placeholder, value, onChange }) {
  return (
    <TextField
      fullWidth
      size="small"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchOutlined />
            </InputAdornment>
          )
        },
        htmlInput: { 'aria-label': placeholder }
      }}
      sx={{ '& .MuiOutlinedInput-root': { bgcolor: brand.surface, borderRadius: '10px', fontSize: fs.body, '& fieldset': { borderColor: brand.line } } }}
    />
  );
}

export function FilterSelect({ value, onChange, options, label, minWidth = 150 }) {
  return (
    <TextField
      select
      size="small"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': label } }}
      sx={{
        minWidth,
        '& .MuiOutlinedInput-root': { bgcolor: brand.surface, borderRadius: '10px', fontSize: fs.body, '& fieldset': { borderColor: brand.line } }
      }}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value} sx={{ fontSize: fs.body }}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** alignEnd: canh đáy các ô lọc, dùng khi trong thanh có ô có nhãn nằm trên (như DateRangeFilter). */
export function Toolbar({ children, alignEnd = false }) {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2, alignItems: alignEnd ? { md: 'flex-end' } : undefined }}>
      {children}
    </Stack>
  );
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Hôm nay dạng yyyy-MM-dd theo giờ máy (giá trị của input type="date"). */
export const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/** Viền, nền, bo góc chung cho mọi ô lọc (ô ngày, ô chọn, ô tìm) để thanh lọc các trang giống nhau. */
export const filterInputSx = (height = 44) => ({
  '& .MuiOutlinedInput-root': {
    bgcolor: '#FFFFFF',
    borderRadius: '10px',
    height,
    fontSize: 13.5,
    '& fieldset': { borderColor: '#E2E8F0' },
    '&:hover fieldset': { borderColor: '#8EECF5' },
    '&.Mui-focused fieldset': { borderColor: '#8EECF5' }
  }
});

/** Một ô lọc có nhãn nằm trên (cùng kiểu với DateRangeFilter). width: số px hoặc chuỗi; grow = giãn hết chỗ trống. */
export function FilterField({ label, width, grow = false, children }) {
  return (
    <Box sx={{ minWidth: 0, width: { xs: '100%', md: width }, flex: grow ? { md: '1 1 240px' } : { md: '0 0 auto' } }}>
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: brand.ink, mb: 0.75 }}>{label}</Typography>
      {children}
    </Box>
  );
}

const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Các khoảng chọn nhanh dùng chung cho mọi ô lọc ngày (và các nút khoảng ngày ở Bảng điều khiển). */
export const DATE_PRESETS = [
  { key: 'today', label: 'Hôm nay' },
  { key: '7d', label: '7 ngày' },
  { key: '30d', label: '30 ngày' },
  { key: 'month', label: 'Tháng này' }
];

/** Ngày bắt đầu / kết thúc (yyyy-MM-dd) của một khoảng chọn nhanh, tính đến hôm nay. */
export function presetRange(key) {
  const today = new Date();
  const start = new Date(today);
  if (key === '7d') start.setDate(today.getDate() - 6);
  if (key === '30d') start.setDate(today.getDate() - 29);
  if (key === 'month') start.setDate(1);
  return { from: ymd(start), to: ymd(today) };
}

const ALL_TIME = 'all';
const CUSTOM = 'custom';
// Khoảng đang chọn khớp nút nào (không khớp = "Tùy chọn" từ ngày – đến ngày)
const presetOf = (from, to) => {
  if (!from && !to) return ALL_TIME;
  const hit = DATE_PRESETS.find((p) => {
    const r = presetRange(p.key);
    return r.from === from && r.to === to;
  });
  return hit ? hit.key : CUSTOM;
};

/**
 * Lọc theo khoảng ngày dùng chung cho mọi trang: ô "Thời gian" chọn nhanh (Hôm nay, 7 ngày, 30 ngày, Tháng này)
 * và 2 ô "Từ ngày" / "Đến ngày" để chọn khoảng tùy ý; nhãn nằm trên ô.
 * from / to dạng yyyy-MM-dd, chuỗi rỗng = không giới hạn phía đó. onChange({ from, to }).
 * Không cho chọn ngày tương lai (trừ khi allowFuture); chọn "Từ" sau "Đến" thì tự kéo ô kia theo,
 * nên khoảng ngày luôn hợp lệ. Trả về 3 ô liền nhau (Fragment) để nằm được trong grid lẫn flex của trang.
 * allowAll = false: trang luôn cần một khoảng ngày (không có lựa chọn "Tất cả thời gian").
 */
export function DateRangeFilter({
  from,
  to,
  onChange,
  allowFuture = false,
  allowAll = true,
  height = 44,
  width = 150,
  presetWidth = 150,
  fromLabel = 'Từ ngày',
  toLabel = 'Đến ngày'
}) {
  const preset = presetOf(from, to);
  const pick = (key) => {
    if (key === ALL_TIME) onChange({ from: '', to: '' });
    else if (key !== CUSTOM) onChange(presetRange(key));
  };
  const max = allowFuture ? undefined : todayYmd();
  const clamp = (v) => (v && max && v > max ? max : v);
  const setFrom = (value) => {
    const next = clamp(value);
    onChange({ from: next, to: next && to && next > to ? next : to });
  };
  const setTo = (value) => {
    const next = clamp(value);
    onChange({ from: next && from && from > next ? next : from, to: next });
  };
  const field = (label, value, set, input) => (
    <Box sx={{ minWidth: 0, width: { xs: '100%', md: width }, flexShrink: 0 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: brand.ink, mb: 0.75 }}>{label}</Typography>
      <TextField
        fullWidth
        size="small"
        type="date"
        value={value || ''}
        onChange={(event) => set(event.target.value)}
        slotProps={{ htmlInput: { ...input, 'aria-label': label } }}
        sx={filterInputSx(height)}
      />
    </Box>
  );
  return (
    <>
      <Box sx={{ minWidth: 0, width: { xs: '100%', md: presetWidth }, flexShrink: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: brand.ink, mb: 0.75 }}>Thời gian</Typography>
        <TextField
          select
          fullWidth
          size="small"
          value={preset}
          onChange={(event) => pick(event.target.value)}
          slotProps={{ htmlInput: { 'aria-label': 'Khoảng thời gian' } }}
          sx={filterInputSx(height)}
        >
          {(allowAll || preset === ALL_TIME) && <MenuItem value={ALL_TIME}>Tất cả thời gian</MenuItem>}
          {DATE_PRESETS.map((p) => (
            <MenuItem key={p.key} value={p.key}>
              {p.label}
            </MenuItem>
          ))}
          {/* Chỉ hiện khi đang chọn tay ở 2 ô ngày; muốn khoảng tùy ý thì sửa thẳng Từ ngày / Đến ngày */}
          <MenuItem value={CUSTOM} sx={{ display: preset === CUSTOM ? undefined : 'none' }}>
            Tùy chọn
          </MenuItem>
        </TextField>
      </Box>
      {field(fromLabel, from, setFrom, { max: to && max ? (to < max ? to : max) : to || max })}
      {field(toLabel, to, setTo, { min: from || undefined, max })}
    </>
  );
}

/** Nút "Bỏ lọc" dùng chung; height khớp với chiều cao các ô lọc của trang (44 hoặc 40). */
export function FilterResetButton({ onClick, disabled, height = 44 }) {
  return (
    <Button
      variant="outlined"
      onClick={onClick}
      disabled={disabled}
      sx={{
        justifySelf: 'start',
        flexShrink: 0,
        height,
        px: 1.75,
        minWidth: 'unset',
        borderRadius: '10px',
        borderWidth: '1px',
        borderColor: '#E2E8F0',
        bgcolor: brand.surface,
        color: brand.ink,
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        '&::after': { display: 'none' },
        '&:hover': { borderWidth: '1px', borderColor: '#8EECF5', bgcolor: brand.surface, color: brand.ink }
      }}
    >
      Bỏ lọc
    </Button>
  );
}

export const headCellSx = {
  color: brand.muted,
  fontSize: PAGE_TYPE.th,
  fontWeight: 600,
  py: 1.5,
  bgcolor: '#FAFAF6',
  borderBottom: `1px solid ${brand.line}`
};

export const bodyCellSx = { py: 1.5, fontSize: PAGE_TYPE.td, borderBottom: `1px solid ${brand.line}` };

// Luôn có trang đầu và trang cuối; các trang ở giữa bị lược thì thay bằng "…" (kiểu chuỗi "gap-n").
function pageItems(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index);
  const last = totalPages - 1;
  const keep = new Set([0, last, page - 1, page, page + 1]);
  if (page <= 2) [1, 2, 3].forEach((n) => keep.add(n));
  if (page >= last - 2) [last - 3, last - 2, last - 1].forEach((n) => keep.add(n));
  const sorted = [...keep].filter((n) => n >= 0 && n <= last).sort((a, b) => a - b);
  const items = [];
  sorted.forEach((n, i) => {
    if (i > 0) {
      const gap = n - sorted[i - 1];
      if (gap === 2) items.push(n - 1);
      else if (gap > 2) items.push(`gap-${n}`);
    }
    items.push(n);
  });
  return items;
}

const pagerActiveBg = '#F1F5F9';
const pagerButtonSx = {
  width: 32,
  height: 32,
  borderRadius: '8px',
  fontSize: 13,
  fontWeight: 500,
  color: brand.muted,
  '&:hover': { bgcolor: pagerActiveBg },
  '&.Mui-disabled': { opacity: 0.3 }
};

/**
 * Thanh phân trang dùng chung cho MỌI trang danh sách (đồng bộ giao diện).
 * page bắt đầu từ 0. totalPages bỏ trống thì tự tính từ total / size.
 * Truyền onSize (và sizeOptions) nếu muốn cho người dùng chọn số dòng mỗi trang.
 */
export function Pager({ page, totalPages: pagesProp, total, size, noun = 'mục', onPage, onSize, sizeOptions = [10, 20, 50], sx }) {
  const totalPages = pagesProp ?? Math.ceil(total / Math.max(size, 1));
  const from = total === 0 ? 0 : page * size + 1;
  const to = Math.min(total, (page + 1) * size);
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5} sx={{ p: 2, ...sx }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Typography sx={{ color: brand.muted, fontSize: fs.caption }}>{`Hiển thị ${from}–${to} trong ${total} ${noun}`}</Typography>
        {onSize && (
          <TextField
            select
            size="small"
            value={size}
            onChange={(event) => onSize(Number(event.target.value))}
            slotProps={{ htmlInput: { 'aria-label': 'Số dòng mỗi trang' } }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: fs.caption, bgcolor: brand.surface } }}
          >
            {sizeOptions.map((option) => (
              <MenuItem key={option} value={option} sx={{ fontSize: fs.caption }}>
                {`${option} / trang`}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <IconButton aria-label="Trang trước" disabled={page <= 0} onClick={() => onPage(page - 1)} sx={pagerButtonSx}>
          <LeftOutlined style={{ fontSize: 12 }} />
        </IconButton>
        {pageItems(page, Math.max(totalPages, 1)).map((index) =>
          typeof index === 'string' ? (
            <Typography key={index} sx={{ color: brand.muted, px: 0.5 }}>
              …
            </Typography>
          ) : (
            <IconButton
              key={index}
              aria-current={index === page ? 'page' : undefined}
              onClick={() => onPage(index)}
              sx={{ ...pagerButtonSx, ...(index === page && { bgcolor: pagerActiveBg, color: brand.ink, fontWeight: 700 }) }}
            >
              {index + 1}
            </IconButton>
          )
        )}
        <IconButton aria-label="Trang sau" disabled={page + 1 >= totalPages} onClick={() => onPage(page + 1)} sx={pagerButtonSx}>
          <RightOutlined style={{ fontSize: 12 }} />
        </IconButton>
      </Stack>
    </Stack>
  );
}

export function EmptyRow({ colSpan, children }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} sx={{ py: 6, textAlign: 'center', color: brand.muted, borderBottom: 'none', fontSize: fs.body }}>
        {children}
      </TableCell>
    </TableRow>
  );
}