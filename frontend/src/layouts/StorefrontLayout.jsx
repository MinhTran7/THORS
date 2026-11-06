import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Box } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import { api } from 'services/http';
import { C, SANS, StoreFooter, StoreHeader, container, useStoreFonts } from 'features/shop/storefront';

/**
 * Khung giao diện cửa hàng cho các trang của khách (vd. đơn hàng): header + footer giống trang chủ shop,
 * không có sidebar quản trị. Nội dung trang vẽ bằng <Outlet />.
 * Các liên kết trên header (danh mục, hàng mới, sale, tìm kiếm) đưa khách về trang chủ shop.
 */
export default function StorefrontLayout() {
  useStoreFonts();
  const { account } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api('/shop/categories')
      .then((d) => setCategories(d.items || []))
      .catch(() => setCategories([]));
  }, []);

  const onSearch = (text) => navigate(text ? `/?q=${encodeURIComponent(text)}` : '/');
  const onPickCategory = (categoryId) => navigate('/', { state: { categoryId } });
  const onScrollTo = (id) => navigate('/', { state: { scrollTo: id } });

  return (
    <Box
      sx={{
        fontFamily: SANS,
        color: C.ink,
        bgcolor: '#FFFFFF',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        '& *, & *::before, & *::after': { boxSizing: 'border-box' },
        // Chữ của các component MUI trong trang cũng dùng font của shop
        '& .MuiTypography-root, & .MuiButton-root, & .MuiInputBase-root, & .MuiTab-root, & .MuiAlert-root': { fontFamily: 'inherit' }
      }}
    >
      <StoreHeader
        account={account}
        categories={categories}
        query=""
        onSearch={onSearch}
        onPickCategory={onPickCategory}
        onScrollTo={onScrollTo}
      />
      <Box component="main" sx={{ ...container, width: '100%', flexGrow: 1, pt: { xs: 4, sm: 6 }, pb: { xs: 8, sm: 12 } }}>
        <Outlet />
      </Box>
      <StoreFooter categories={categories} onPickCategory={onPickCategory} onScrollTo={onScrollTo} />
    </Box>
  );
}
