import { useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Box, Popover } from '@mui/material';
import { DownOutlined } from '@ant-design/icons';
import { categoryTree } from 'features/shop/ShopCommon';

/**
 * Ô lọc danh mục dạng cây, cùng cách dùng với ô danh mục ở thanh tìm kiếm trang khách (StoreSearch):
 *  - Bấm tên danh mục để chọn (chọn danh mục cha = lọc cả nhánh con, cháu).
 *  - Bấm mũi tên bên phải để xem / thu gọn danh mục con.
 *  - Mở lại ô thì tự xổ sẵn các danh mục cha của mục đang chọn.
 * categories: [{ categoryId, categoryName, parentId, status? }]; value: id đang chọn, '' = tất cả.
 */

const ACCENT = '#0891B2';
const INK = '#0F172A';
const MUTED = '#64748B';

// Đường đi từ gốc tới danh mục id (các nút cha + chính nó)
function pathTo(nodes, id, trail = []) {
  for (const n of nodes) {
    const next = [...trail, n];
    if (String(n.categoryId) === String(id)) return next;
    const found = pathTo(n.children, id, next);
    if (found.length) return found;
  }
  return [];
}

const rowSx = (depth, selected) => ({
  flex: 1,
  minWidth: 0,
  py: 0.9,
  pl: 2 + depth * 2.25,
  pr: 1,
  border: 0,
  bgcolor: 'transparent',
  textAlign: 'left',
  font: 'inherit',
  fontSize: 13.5,
  fontWeight: depth === 0 ? 600 : 400,
  color: selected ? ACCENT : depth === 0 ? INK : MUTED,
  cursor: 'pointer',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  '&:hover': { color: ACCENT },
  '&:focus-visible': { outline: `2px solid ${ACCENT}`, outlineOffset: -2 }
});

const nameOf = (node) => `${node.categoryName}${node.status && node.status !== 'ACTIVE' ? ' (Đã ngưng)' : ''}`;

function CategoryRow({ node, depth, selectedId, expanded, onToggle, onPick }) {
  const hasKids = node.children.length > 0;
  const open = expanded.has(node.categoryId);
  const selected = String(selectedId) === String(node.categoryId);
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', pr: 1, bgcolor: selected ? '#ECFEFF' : 'transparent' }}>
        <Box
          component="button"
          type="button"
          aria-current={selected || undefined}
          onClick={() => onPick(node.categoryId)}
          sx={rowSx(depth, selected)}
        >
          {nameOf(node)}
        </Box>
        {hasKids && (
          <Box
            component="button"
            type="button"
            aria-label={`${open ? 'Thu gọn' : 'Xem'} danh mục con của ${node.categoryName}`}
            aria-expanded={open}
            onClick={() => onToggle(node.categoryId)}
            sx={{
              width: 30,
              height: 30,
              p: 0,
              border: 0,
              borderRadius: 1,
              bgcolor: 'transparent',
              color: MUTED,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              '&:hover': { color: INK, bgcolor: '#F1F5F9' },
              '&:focus-visible': { outline: `2px solid ${ACCENT}` }
            }}
          >
            <DownOutlined style={{ fontSize: 11, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
          </Box>
        )}
      </Box>
      {hasKids && open && (
        <Box component="ul" sx={{ m: 0, p: 0 }}>
          {node.children.map((child) => (
            <CategoryRow
              key={child.categoryId}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onPick={onPick}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

CategoryRow.propTypes = {
  node: PropTypes.object.isRequired,
  depth: PropTypes.number.isRequired,
  selectedId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  expanded: PropTypes.instanceOf(Set).isRequired,
  onToggle: PropTypes.func.isRequired,
  onPick: PropTypes.func.isRequired
};

export default function CategoryTreeSelect({
  categories,
  value,
  onChange,
  allLabel = 'Tất cả danh mục',
  ariaLabel = 'Lọc theo danh mục',
  disabled,
  height = 40,
  sx
}) {
  const tree = useMemo(() => categoryTree(categories || []), [categories]);
  const anchor = useRef(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const path = useMemo(() => (value ? pathTo(tree, value) : []), [tree, value]);
  // Danh mục con hiện kèm tên cha để phân biệt, vd "Nữ › Áo"
  const label = path.length ? path.map((n) => n.categoryName).join(' › ') : allLabel;

  const show = () => {
    if (path.length > 1) setExpanded((prev) => new Set([...prev, ...path.slice(0, -1).map((n) => n.categoryId)]));
    setOpen(true);
  };
  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pick = (id) => {
    onChange(id === '' ? '' : String(id));
    setOpen(false);
  };

  return (
    <>
      <Box
        ref={anchor}
        component="button"
        type="button"
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${ariaLabel}: ${label}`}
        title={label}
        onClick={() => (open ? setOpen(false) : show())}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          height,
          minWidth: 180,
          px: 1.75,
          border: '1px solid',
          borderColor: open ? ACCENT : '#CBD5E1',
          borderRadius: 2,
          bgcolor: '#FFFFFF',
          font: 'inherit',
          fontSize: 13.5,
          color: value ? INK : '#334155',
          textAlign: 'left',
          cursor: 'pointer',
          '&:hover': { borderColor: ACCENT },
          '&:focus-visible': { outline: 'none', borderColor: ACCENT, boxShadow: `0 0 0 1px ${ACCENT}` },
          '&:disabled': { cursor: 'default', opacity: 0.6 },
          ...sx
        }}
      >
        <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </Box>
        <DownOutlined style={{ fontSize: 11, color: MUTED, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </Box>

      <Popover
        open={open}
        anchorEl={anchor.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.75,
              width: Math.max(280, anchor.current?.offsetWidth || 0),
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: 'min(440px, 60vh)',
              overflowY: 'auto',
              py: 0.75,
              borderRadius: 2,
              border: '1px solid #E2E8F0',
              boxShadow: '0 12px 32px rgba(15,23,42,.12)'
            }
          }
        }}
      >
        <Box sx={{ display: 'flex', pr: 1, bgcolor: !value ? '#ECFEFF' : 'transparent' }}>
          <Box
            component="button"
            type="button"
            aria-current={!value || undefined}
            onClick={() => pick('')}
            sx={{ ...rowSx(0, !value), fontWeight: 400, color: !value ? ACCENT : INK }}
          >
            {allLabel}
          </Box>
        </Box>
        <Box component="ul" sx={{ m: 0, p: 0 }}>
          {tree.map((node) => (
            <CategoryRow
              key={node.categoryId}
              node={node}
              depth={0}
              selectedId={value}
              expanded={expanded}
              onToggle={toggle}
              onPick={pick}
            />
          ))}
        </Box>
        {!tree.length && <Box sx={{ px: 2, py: 1.25, fontSize: 13, color: MUTED }}>Chưa có danh mục.</Box>}
      </Popover>
    </>
  );
}

CategoryTreeSelect.propTypes = {
  categories: PropTypes.array,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func.isRequired,
  allLabel: PropTypes.string,
  ariaLabel: PropTypes.string,
  disabled: PropTypes.bool,
  height: PropTypes.number,
  sx: PropTypes.object
};
