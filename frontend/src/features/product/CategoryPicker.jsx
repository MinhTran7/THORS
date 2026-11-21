import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import { SearchOutlined } from '@ant-design/icons';

import { categoryFullName, targetGroupLabel } from '../../services/categoryService';
import { C } from '../customer/theme';

// Màu nhãn đối tượng (cùng màu với trang Danh mục)
const TARGET_TONE = {
  MEN: { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  WOMEN: { bg: '#FDF2F8', color: '#BE185D', border: '#FBCFE8' },
  KIDS: { bg: '#FFF7AE', color: '#713F12', border: '#FDE047' },
  UNISEX: { bg: '#F0FCFE', color: '#0E7490', border: '#8EECF5' }
};

// Bỏ dấu để gõ "giay nu" vẫn ra "Giày nữ"
const fold = (value) =>
  (value || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

function TargetChip({ value }) {
  const label = targetGroupLabel(value);
  if (!label) return null;
  const tone = TARGET_TONE[value];
  return (
    <Box
      component="span"
      sx={{
        ml: 'auto',
        px: 1,
        py: 0.1,
        borderRadius: 99,
        fontSize: 11.5,
        fontWeight: 700,
        bgcolor: tone.bg,
        color: tone.color,
        border: `1px solid ${tone.border}`,
        flexShrink: 0
      }}
    >
      {label}
    </Box>
  );
}

TargetChip.propTypes = { value: PropTypes.string };

/**
 * Ô chọn danh mục cho sản phẩm: gõ để tìm (không dấu cũng được), danh mục con gom dưới đường dẫn danh mục cha,
 * kèm nhãn đối tượng Nam / Nữ / Trẻ em. categories: danh sách đã lọc (chỉ danh mục gắn được sản phẩm),
 * đã sắp theo cây (sortCategoriesAsTree) để các danh mục con cùng cha nằm liền nhau.
 */
// Tên nhóm của một lựa chọn = đường dẫn danh mục cha, vd "Giày › Giày nữ" ('' = danh mục gốc)
const groupOf = (option) => {
  const path = option.pathName || '';
  const cut = path.lastIndexOf(' › ');
  return cut > 0 ? path.slice(0, cut) : option.parentName || '';
};

export default function CategoryPicker({ categories, value, onChange, disabled, error, inputSx }) {
  const selected = categories.find((item) => String(item.categoryId) === String(value)) || null;

  // Gom các danh mục cùng cha liền nhau (cây nhiều cấp sau khi lọc có thể bị xen kẽ), giữ thứ tự nhóm xuất hiện đầu tiên
  const options = useMemo(() => {
    const order = new Map();
    categories.forEach((item) => {
      const group = groupOf(item);
      if (!order.has(group)) order.set(group, order.size);
    });
    return [...categories].sort((a, b) => order.get(groupOf(a)) - order.get(groupOf(b)));
  }, [categories]);

  return (
    <Autocomplete
      options={options}
      value={selected}
      disabled={disabled}
      onChange={(_, option) => onChange(option ? String(option.categoryId) : '')}
      getOptionLabel={(option) => categoryFullName(option)}
      isOptionEqualToValue={(option, current) => option.categoryId === current.categoryId}
      groupBy={groupOf}
      filterOptions={(options, state) => {
        const keyword = fold(state.inputValue);
        if (!keyword) return options;
        return options.filter((option) =>
          fold(`${categoryFullName(option)} ${targetGroupLabel(option.targetGroup)}`).includes(keyword)
        );
      }}
      noOptionsText="Không tìm thấy danh mục phù hợp"
      renderGroup={(params) =>
        params.group ? (
          <li key={params.key}>
            <Typography
              sx={{
                px: 2,
                pt: 1.25,
                pb: 0.5,
                fontSize: 11.5,
                fontWeight: 800,
                color: C.muted,
                textTransform: 'uppercase',
                letterSpacing: 0.5
              }}
            >
              {params.group}
            </Typography>
            <Box component="ul" sx={{ p: 0 }}>
              {params.children}
            </Box>
          </li>
        ) : (
          <li key={params.key}>
            <Box component="ul" sx={{ p: 0 }}>
              {params.children}
            </Box>
          </li>
        )
      }
      renderOption={(props, option) => {
        const { key, ...rest } = props;
        return (
          <Box
            component="li"
            key={key}
            {...rest}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13.5, pl: option.parentId ? '32px !important' : undefined }}
          >
            <span>{option.categoryName}</span>
            <TargetChip value={option.targetGroup} />
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          placeholder="Gõ để tìm danh mục (ví dụ: giày nữ)..."
          error={error}
          sx={inputSx}
        />
      )}
      popupIcon={<SearchOutlined style={{ fontSize: 14 }} />}
      sx={{ '& .MuiAutocomplete-popupIndicator': { transform: 'none' } }}
    />
  );
}

CategoryPicker.propTypes = {
  categories: PropTypes.array.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  error: PropTypes.bool,
  inputSx: PropTypes.object
};
