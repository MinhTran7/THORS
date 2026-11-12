import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Pagination,
  TextField,
  Typography
} from '@mui/material';
import { SearchOutlined, UndoOutlined } from '@ant-design/icons';

import { C, outlineButtonSx, primaryButtonSx } from '../customer/theme';
import { CATEGORY_ICONS, ICON_GROUPS, findCategoryIcon } from './categoryIcons';

const PAGE_SIZE = 24;

// Bỏ dấu để gõ "tui xach" vẫn ra "Túi xách"
const fold = (value) =>
  (value || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

const chipSx = (active) => ({
  textTransform: 'none',
  fontSize: 12.5,
  fontWeight: 700,
  borderRadius: 99,
  px: 1.5,
  py: 0.4,
  minWidth: 0,
  color: active ? '#0F172A' : C.muted,
  bgcolor: active ? C.cyan : '#F1F5F9',
  '&:hover': { bgcolor: active ? C.cyanHover : '#E2E8F0' }
});

/**
 * Chọn icon cho danh mục: ô xem trước + nút mở bảng icon (tìm kiếm, lọc theo nhóm, chia trang).
 * value: khóa icon ('' = mặc định). defaultPreview: icon mặc định đang dùng khi chưa chọn.
 */
export default function CategoryIconPicker({ value, onChange, defaultPreview, disabled }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [keyword, setKeyword] = useState('');
  const [group, setGroup] = useState('ALL');
  const [page, setPage] = useState(1);

  const current = findCategoryIcon(value);

  const filtered = useMemo(() => {
    const text = fold(keyword);
    return CATEGORY_ICONS.filter(
      (item) =>
        (group === 'ALL' || item.group === group) &&
        (!text || fold(`${item.label} ${item.keywords} ${item.key}`).includes(text))
    );
  }, [keyword, group]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const shown = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function openDialog() {
    setDraft(value || '');
    setKeyword('');
    setGroup('ALL');
    setPage(1);
    setOpen(true);
  }

  function confirm() {
    onChange(draft);
    setOpen(false);
  }

  const tile = (selected) => ({
    width: 44,
    height: 44,
    borderRadius: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    border: `1.5px solid ${selected ? C.cyanHover : C.border}`,
    bgcolor: selected ? '#E3FAFD' : C.surface,
    color: selected ? '#0E7490' : '#334155'
  });

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={tile(Boolean(current))}>{current ? <current.Icon /> : defaultPreview}</Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>
            {current ? current.label : 'Icon mặc định'}
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.muted }}>
            {current ? 'Hiện ở bảng danh mục' : 'Tự chọn theo cấp và đối tượng'}
          </Typography>
        </Box>
        {current && (
          <Button size="small" disabled={disabled} onClick={() => onChange('')} sx={{ textTransform: 'none', color: C.muted }}>
            Bỏ chọn
          </Button>
        )}
        <Button disabled={disabled} onClick={openDialog} sx={{ ...outlineButtonSx, height: 38 }}>
          Chọn icon
        </Button>
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { borderRadius: 4 } } }}>
        <DialogTitle sx={{ fontWeight: 800, fontSize: 18, pb: 1 }}>Chọn icon danh mục</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            size="small"
            autoFocus
            placeholder="Tìm icon (ví dụ: túi xách, đồng hồ, sale)..."
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined style={{ color: C.muted }} />
                  </InputAdornment>
                )
              }
            }}
            sx={{ mt: 0.5, '& .MuiOutlinedInput-root': { borderRadius: 2.5 } }}
          />

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
            {['ALL', ...ICON_GROUPS].map((item) => (
              <Button
                key={item}
                size="small"
                onClick={() => {
                  setGroup(item);
                  setPage(1);
                }}
                sx={chipSx(group === item)}
              >
                {item === 'ALL' ? 'Tất cả' : item}
              </Button>
            ))}
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(6, 1fr)' },
              gap: 1,
              mt: 2,
              minHeight: 200
            }}
          >
            {/* Ô đầu: về icon mặc định */}
            {currentPage === 1 && !keyword && group === 'ALL' && (
              <Box
                component="button"
                type="button"
                onClick={() => setDraft('')}
                sx={iconCellSx(draft === '')}
              >
                <Box sx={{ fontSize: 20, color: C.muted }}>
                  <UndoOutlined />
                </Box>
                <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: C.muted }}>Mặc định</Typography>
              </Box>
            )}
            {shown.map((item) => (
              <Box
                key={item.key}
                component="button"
                type="button"
                title={item.label}
                onClick={() => setDraft(item.key)}
                onDoubleClick={() => {
                  onChange(item.key);
                  setOpen(false);
                }}
                sx={iconCellSx(draft === item.key)}
              >
                <Box sx={{ fontSize: 20 }}>
                  <item.Icon />
                </Box>
                <Typography
                  sx={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}
                >
                  {item.label}
                </Typography>
              </Box>
            ))}
            {shown.length === 0 && (
              <Typography sx={{ gridColumn: '1 / -1', textAlign: 'center', color: C.muted, fontSize: 13, py: 6 }}>
                Không tìm thấy icon phù hợp.
              </Typography>
            )}
          </Box>

          {pageCount > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Pagination
                count={pageCount}
                page={currentPage}
                onChange={(_, next) => setPage(next)}
                size="small"
                shape="rounded"
                sx={{ '& .Mui-selected': { bgcolor: `${C.cyan} !important`, color: C.text, fontWeight: 700 } }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Typography sx={{ fontSize: 12, color: C.muted, mr: 'auto' }}>
            {filtered.length} icon · nhấp đúp để chọn nhanh
          </Typography>
          <Button onClick={() => setOpen(false)} sx={outlineButtonSx}>
            Hủy
          </Button>
          <Button onClick={confirm} sx={primaryButtonSx}>
            Dùng icon này
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

const iconCellSx = (selected) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 0.5,
  height: 72,
  px: 0.5,
  borderRadius: 2.5,
  cursor: 'pointer',
  font: 'inherit',
  color: selected ? '#0E7490' : '#334155',
  bgcolor: selected ? '#E3FAFD' : '#FFFFFF',
  border: `1.5px solid ${selected ? C.cyanHover : C.border}`,
  transition: 'border-color .15s, background-color .15s',
  '&:hover': { borderColor: C.cyan, bgcolor: '#F5FDFE' }
});

CategoryIconPicker.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  defaultPreview: PropTypes.node,
  disabled: PropTypes.bool
};
