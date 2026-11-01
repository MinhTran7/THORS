import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, IconButton, InputBase, Tooltip, Typography } from '@mui/material';
import { SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { brand } from 'features/account/tokens';
import ThorsMark from 'layouts/ThorsMark';
import CartButton from 'components/CartButton';

// Phần dùng chung cho trang danh sách (ShopPage) và trang chi tiết (ShopProductPage)

export const money = (n) => `${Number(n).toLocaleString('vi-VN')} ₫`;
export const priceText = (a, b) => (Number(a) === Number(b) ? money(a) : `${money(a)} - ${money(b)}`);

export function Photo({ src, name, sx }) {
  return (
    <Box sx={{ bgcolor: brand.cyanSoft, display: 'grid', placeItems: 'center', overflow: 'hidden', ...sx }}>
      {src ? (
        <Box component="img" src={src} alt={name} loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Typography sx={{ fontSize: 32, fontWeight: 700, color: brand.ink }}>{name.charAt(0)}</Typography>
      )}
    </Box>
  );
}

export function ShopHeader({ account, initialQuery = '', onSearch }) {
  const [input, setInput] = useState(initialQuery);
  useEffect(() => setInput(initialQuery), [initialQuery]);

  const submit = (e) => {
    e.preventDefault();
    onSearch(input.trim());
  };

  return (
    <Box component="header" sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: brand.surface, borderBottom: `1px solid ${brand.line}` }}>
      <Box sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2, md: 4 }, height: 64, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box component={RouterLink} to="/" sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none' }}>
          <ThorsMark />
          <Typography sx={{ fontSize: 22, fontWeight: 700, letterSpacing: 1.5, color: brand.ink, display: { xs: 'none', sm: 'block' } }}>
            THORS
          </Typography>
        </Box>

        <Box
          component="form"
          onSubmit={submit}
          sx={{ flexGrow: 1, maxWidth: 600, display: 'flex', alignItems: 'center', border: `1.5px solid ${brand.cyan}`, borderRadius: '10px', bgcolor: '#fff', pl: 1.5 }}
        >
          <InputBase fullWidth placeholder="Tìm sản phẩm..." value={input} onChange={(e) => setInput(e.target.value)} inputProps={{ 'aria-label': 'Tìm sản phẩm' }} />
          <IconButton type="submit" aria-label="Tìm kiếm">
            <SearchOutlined />
          </IconButton>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
          {!account ? (
            <>
              <Tooltip title="Đăng nhập để xem giỏ hàng">
                <IconButton component={RouterLink} to="/login" size="small" aria-label="Giỏ hàng">
                  <ShoppingCartOutlined />
                </IconButton>
              </Tooltip>
              <Button component={RouterLink} to="/login">
                Đăng nhập
              </Button>
              <Button component={RouterLink} to="/register" variant="contained">
                Đăng ký
              </Button>
            </>
          ) : (
            <>
              {account.role === 'CUSTOMER' && <CartButton />}
              <Button component={RouterLink} to="/workspace" variant="outlined">
                Tài khoản
              </Button>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
