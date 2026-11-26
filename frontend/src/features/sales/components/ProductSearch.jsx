import { useEffect, useState } from 'react';
import { Box, ClickAwayListener, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import { ScanOutlined, SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { C } from '../theme';
import { BARCODE_PATTERN, normalizeCode } from '../utils';

// Ô tìm theo mã sản phẩm (mã vạch biến thể TH…): nhập đúng mã mới hiện sản phẩm; chọn hoặc Enter là thêm thẳng vào hóa đơn
export default function ProductSearch({ codes, onScan, onPrefetch, onOpenCamera }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const keyword = normalizeCode(search);

  const match = keyword ? codes.find((entry) => entry.code === keyword) : null;

  // Vừa gõ đúng mã là tải sẵn giá và tồn, để bấm chọn hoặc Enter là vào hóa đơn ngay
  useEffect(() => {
    if (match) onPrefetch(match.code, match.productId);
  }, [match, onPrefetch]);

  async function add(code) {
    const result = await onScan(code);
    if (result.ok) {
      setSearch('');
      setOpen(false);
    }
  }

  // Enter: mã có trong danh sách, hoặc mã đầy đủ dạng TH… (máy quét / mã vừa tạo chưa tải về)
  function onEnter(e) {
    if (e.key !== 'Enter' || !(match || BARCODE_PATTERN.test(keyword))) return;
    e.preventDefault();
    add(keyword);
  }

  return (
    <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
      <ClickAwayListener onClickAway={() => setOpen(false)}>
        <Box sx={{ position: 'relative', flex: 1 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Nhập hoặc quét mã sản phẩm, ví dụ TH000051"
            value={search}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
            }}
            onKeyDown={onEnter}
            slotProps={{
              htmlInput: { maxLength: 40, autoComplete: 'off', spellCheck: false },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined style={{ color: C.subtle, fontSize: 16 }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label="Quét mã bằng camera"
                      title="Có máy quét: cứ bóp cò là thêm vào hóa đơn. Không có máy quét: bấm để quét bằng camera."
                      onClick={onOpenCamera}
                    >
                      <ScanOutlined style={{ color: C.muted, fontSize: 18 }} />
                    </IconButton>
                  </InputAdornment>
                )
              }
            }}
            sx={{
              bgcolor: C.surface,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2.5,
                height: 42,
                '& fieldset, &:hover fieldset': { borderColor: C.border },
                '&.Mui-focused fieldset': { borderColor: C.cyan }
              }
            }}
          />

          {open && match && (
            <Box
              sx={{
                position: 'absolute',
                top: 48,
                left: 0,
                right: 0,
                zIndex: 20,
                bgcolor: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 2.5,
                boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
                py: 0.5
              }}
            >
              <CodeOption entry={match} onClick={() => add(match.code)} />
            </Box>
          )}
        </Box>
      </ClickAwayListener>
    </Box>
  );
}

// Sản phẩm của mã vừa nhập: ảnh, tên, mã · màu · size, số có thể bán
function CodeOption({ entry, onClick }) {
  const isOut = entry.stock <= 0;

  return (
    <Box
      onClick={onClick}
      sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 1, cursor: 'pointer', opacity: isOut ? 0.55 : 1 }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 1.5,
          bgcolor: C.bg,
          border: `1px solid ${C.border}`,
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {entry.image ? (
          <Box component="img" src={entry.image} alt={entry.productName} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <ShoppingCartOutlined style={{ fontSize: 16, color: C.faint }} />
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {entry.productName}
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: C.subtle }}>
          <Box component="span" sx={{ fontFamily: 'monospace', color: C.body, fontWeight: 600 }}>
            {entry.code}
          </Box>
          {[entry.color, entry.size].filter(Boolean).map((part) => ` · ${part}`)}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: 11.5, color: isOut ? C.error : C.muted, flexShrink: 0 }}>
        {isOut ? 'Hết hàng' : `Tồn: ${entry.stock}`}
      </Typography>
    </Box>
  );
}
