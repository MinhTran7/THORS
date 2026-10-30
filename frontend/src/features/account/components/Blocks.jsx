import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, InputAdornment, MenuItem, TableCell, TableRow, TextField, Typography } from '@mui/material';
import { Stack } from './Flex';
import { ArrowLeftOutlined, InfoCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { brand, cardSx } from '../tokens';
import { OutlineButton } from './Brand';

export function PageHeader({ back, title, subtitle, action }) {
  return (
    <Box sx={{ mb: 3 }}>
      {back && (
        <Button
          component={RouterLink}
          to={back.to}
          startIcon={<ArrowLeftOutlined style={{ fontSize: 11 }} />}
          sx={{ color: brand.muted, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', p: 0, mb: 1, minWidth: 0 }}
        >
          {back.label}
        </Button>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={2}>
        <Box>
          <Typography variant="h3" sx={{ color: brand.ink, fontWeight: 500 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography sx={{ color: brand.muted, mt: 0.75 }} variant="body2">
              {subtitle}
            </Typography>
          )}
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
      <Box sx={{ color: brand.ink, pt: '2px' }}>{icon}</Box>
      <Box>
        {title && (
          <Typography variant="subtitle2" sx={{ color: brand.ink, fontWeight: 700 }}>
            {title}
          </Typography>
        )}
        <Typography variant="caption" sx={{ color: brand.muted, display: 'block' }}>
          {children}
        </Typography>
      </Box>
    </Box>
  );
}

export function StatCard({ label, value, caption, icon, warning = false, loading = false }) {
  return (
    <Box
      sx={{ ...cardSx, p: 2.5, bgcolor: warning ? brand.yellowSoft : brand.surface, borderColor: warning ? brand.yellowLine : brand.line }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="body2" sx={{ color: brand.muted }}>
          {label}
        </Typography>
        <Box sx={{ color: brand.ink, fontSize: 18 }}>{icon}</Box>
      </Stack>
      <Typography sx={{ fontSize: 34, lineHeight: 1.2, fontWeight: 500, color: brand.ink, my: 0.5 }}>{loading ? '—' : value}</Typography>
      <Typography variant="caption" sx={{ color: brand.muted }}>
        {caption}
      </Typography>
    </Box>
  );
}

export function StatRow({ children }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>{children}</Box>;
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
      sx={{ '& .MuiOutlinedInput-root': { bgcolor: brand.surface, borderRadius: '10px', '& fieldset': { borderColor: brand.line } } }}
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
      slotProps={{ htmlInput: { 'aria-label': label } }}
      sx={{
        minWidth,
        '& .MuiOutlinedInput-root': { bgcolor: brand.surface, borderRadius: '10px', '& fieldset': { borderColor: brand.line } }
      }}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

export function Toolbar({ children }) {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
      {children}
    </Stack>
  );
}

export const headCellSx = {
  color: brand.muted,
  fontSize: 12,
  fontWeight: 600,
  py: 1.5,
  bgcolor: '#FAFAF6',
  borderBottom: `1px solid ${brand.line}`
};

export const bodyCellSx = { py: 1.5, borderBottom: `1px solid ${brand.line}` };

function pageNumbers(page, totalPages) {
  const start = Math.max(0, Math.min(page - 2, totalPages - 5));
  const end = Math.min(totalPages, start + 5);
  return Array.from({ length: end - start }, (_, index) => start + index);
}

export function Pager({ page, totalPages, total, size, noun, onPage }) {
  const from = total === 0 ? 0 : page * size + 1;
  const to = Math.min(total, (page + 1) * size);
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5} sx={{ p: 2 }}>
      <Typography variant="caption" sx={{ color: brand.muted }}>
        {`Showing ${from}–${to} of ${total} ${noun}`}
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        <OutlineButton size="small" disabled={page <= 0} onClick={() => onPage(page - 1)}>
          Previous
        </OutlineButton>
        {pageNumbers(page, Math.max(totalPages, 1)).map((index) => (
          <Button
            key={index}
            size="small"
            onClick={() => onPage(index)}
            aria-current={index === page ? 'page' : undefined}
            sx={{
              minWidth: 36,
              borderRadius: '10px',
              fontWeight: 600,
              color: index === page ? brand.inkOnCyan : brand.ink,
              bgcolor: index === page ? brand.cyan : 'transparent'
            }}
          >
            {index + 1}
          </Button>
        ))}
        <OutlineButton size="small" disabled={page + 1 >= totalPages} onClick={() => onPage(page + 1)}>
          Next
        </OutlineButton>
      </Stack>
    </Stack>
  );
}

export function EmptyRow({ colSpan, children }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} sx={{ py: 6, textAlign: 'center', color: brand.muted, borderBottom: 'none' }}>
        {children}
      </TableCell>
    </TableRow>
  );
}