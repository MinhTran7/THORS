import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, InputAdornment, MenuItem, TableCell, TableRow, TextField, Typography } from '@mui/material';
import { Stack } from './Flex';
import { ArrowLeftOutlined, InfoCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { brand, cardSx, fs } from '../tokens';
import { OutlineButton } from './Brand';

export function PageHeader({ back, title, subtitle, action }) {
  return (
    <Box sx={{ mb: 3 }}>
      {back && (
        <Button
          component={RouterLink}
          to={back.to}
          startIcon={<ArrowLeftOutlined style={{ fontSize: 13 }} />}
          sx={{ color: brand.muted, fontSize: fs.small, letterSpacing: 0.4, textTransform: 'uppercase', p: 0, mb: 1, minWidth: 0 }}
        >
          {back.label}
        </Button>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={2}>
        <Box>
          <Typography variant="h3" sx={{ color: brand.ink, fontWeight: 800, letterSpacing: '-0.5px', fontSize: fs.pageTitle }}>
            {title}
          </Typography>
          {subtitle && <Typography sx={{ color: brand.muted, mt: 0.75, fontSize: fs.body }}>{subtitle}</Typography>}
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
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mb: 2 }}>{children}</Box>;
}

// ---------------------------------------------------------------- Thanh bộ lọc dùng chung
// Kiểu thống nhất theo trang Khuyến mãi: nhãn nhỏ phía trên mỗi ô, ô cao 44px, viền be nhạt, hover/focus viền đen (tông trầm).
const FILTER = { text: brand.ink, border: brand.line, accent: brand.ink, surface: brand.surface };

export const filterLabelSx = { display: 'block', fontSize: 13, fontWeight: 600, color: FILTER.text, mb: 0.75, whiteSpace: 'nowrap' };

export const filterInputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: FILTER.surface,
    borderRadius: '10px',
    height: 44,
    fontSize: 13.5,
    '& fieldset': { borderColor: FILTER.border },
    '&:hover fieldset': { borderColor: FILTER.accent },
    '&.Mui-focused fieldset': { borderColor: FILTER.accent }
  }
};

/** Một ô trong thanh lọc: nhãn phía trên + ô nhập/chọn bên dưới. */
export function FilterField({ label, children, sx }) {
  return (
    <Box sx={{ minWidth: 0, ...sx }}>
      {label && <Typography sx={filterLabelSx}>{label}</Typography>}
      {children}
    </Box>
  );
}

/** title: nhãn hiện phía trên ô (kiểu trang Khuyến mãi). */
export function SearchField({ placeholder, value, onChange, title }) {
  const field = (
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
              <SearchOutlined style={{ color: '#94A3B8', fontSize: 16 }} />
            </InputAdornment>
          )
        },
        htmlInput: { 'aria-label': title || placeholder }
      }}
      sx={filterInputSx}
    />
  );
  return title ? <FilterField label={title}>{field}</FilterField> : field;
}

/** label: tên ô (dùng làm nhãn phía trên và aria-label). hideLabel: chỉ dùng làm aria-label. */
export function FilterSelect({ value, onChange, options, label, minWidth = 150, hideLabel = false }) {
  return (
    <FilterField label={hideLabel ? undefined : label}>
      <TextField
        select
        size="small"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': label } }}
        sx={{ minWidth, width: '100%', ...filterInputSx }}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value} sx={{ fontSize: 13.5 }}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
    </FilterField>
  );
}

/** Nút "Bỏ lọc" ở cuối thanh lọc, cùng chiều cao với các ô lọc. */
export function ResetFilterButton({ onClick, disabled }) {
  return (
    <Button
      variant="outlined"
      onClick={onClick}
      disabled={disabled}
      disableRipple
      sx={{
        height: 44,
        px: 1.75,
        minWidth: 'unset',
        flexShrink: 0,
        borderRadius: '10px',
        textTransform: 'none',
        fontSize: 13,
        fontWeight: 600,
        borderColor: FILTER.border,
        bgcolor: FILTER.surface,
        color: FILTER.text,
        whiteSpace: 'nowrap',
        boxShadow: 'none',
        '&:hover': { bgcolor: FILTER.surface, borderColor: FILTER.accent, boxShadow: 'none' }
      }}
    >
      Bỏ lọc
    </Button>
  );
}

/** Thanh lọc: các ô xếp hàng ngang, canh đáy (vì có nhãn phía trên), tự xuống dòng khi hẹp. */
export function Toolbar({ children, sx }) {
  return <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: { xs: 1.5, lg: 2 }, mb: 3, ...sx }}>{children}</Box>;
}

export const FilterBar = Toolbar;

export const headCellSx = {
  color: brand.muted,
  fontSize: fs.caption,
  fontWeight: 600,
  py: 1.5,
  bgcolor: '#FAF8F5',
  borderBottom: `1px solid ${brand.line}`
};

export const bodyCellSx = { py: 1.5, borderBottom: `1px solid ${brand.line}` };

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
      <Stack direction="row" spacing={1} alignItems="center">
        <OutlineButton size="small" disabled={page <= 0} onClick={() => onPage(page - 1)}>
          Trước
        </OutlineButton>
        {pageItems(page, Math.max(totalPages, 1)).map((index) =>
          typeof index === 'string' ? (
            <Typography key={index} sx={{ color: brand.muted, px: 0.5 }}>
              …
            </Typography>
          ) : (
          <Button
            key={index}
            size="small"
            onClick={() => onPage(index)}
            aria-current={index === page ? 'page' : undefined}
            sx={{
              minWidth: 36,
              borderRadius: '10px',
              fontWeight: 600,
              fontSize: fs.caption,
              color: index === page ? brand.inkOnCyan : brand.ink,
              bgcolor: index === page ? brand.cyan : 'transparent'
            }}
          >
            {index + 1}
          </Button>
          )
        )}
        <OutlineButton size="small" disabled={page + 1 >= totalPages} onClick={() => onPage(page + 1)}>
          Sau
        </OutlineButton>
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