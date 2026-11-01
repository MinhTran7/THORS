import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, IconButton } from '@mui/material';
import { ShoppingCartOutlined } from '@ant-design/icons';
import { api } from 'services/http';

/**
 * Nút giỏ hàng ở header: hiện số sản phẩm trong giỏ và mở trang giỏ hàng khi bấm.
 * Tự cập nhật số lượng khi có sự kiện 'thors:cart-changed'.
 */
export default function CartButton({ to = '/cart' }) {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const data = await api('/cart');
      setCount((data.items || []).length);
    } catch {
      // Không lấy được giỏ hàng thì giữ nguyên số hiện tại
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('thors:cart-changed', refresh);
    return () => window.removeEventListener('thors:cart-changed', refresh);
  }, [refresh]);

  return (
    <IconButton
      size="small"
      onClick={() => navigate(to)}
      aria-label={count > 0 ? `Giỏ hàng, ${count} sản phẩm` : 'Giỏ hàng'}
    >
      <Badge badgeContent={count} color="primary" max={99}>
        <ShoppingCartOutlined />
      </Badge>
    </IconButton>
  );
}
