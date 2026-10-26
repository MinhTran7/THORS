import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from 'services/http';

/**
 * Nút giỏ hàng trên header: biểu tượng giỏ + huy hiệu số sản phẩm.
 * Tự tải số lượng từ GET /api/cart, và cập nhật lại khi có sự kiện 'thors:cart-changed'
 * (CartPage và nút "Thêm vào giỏ" phát sự kiện này sau khi thay đổi giỏ).
 */
export default function CartButton({ to = '/cart' }) {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const data = await api('/cart');
      setCount((data.items || []).length);
    } catch {
      setCount(0); // lỗi mạng hoặc chưa đăng nhập: ẩn huy hiệu
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('thors:cart-changed', refresh);
    return () => window.removeEventListener('thors:cart-changed', refresh);
  }, [refresh]);

  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      aria-label={count > 0 ? `Giỏ hàng, ${count} sản phẩm` : 'Giỏ hàng'}
      title="Giỏ hàng"
      style={{
        position: 'relative',
        display: 'inline-grid',
        placeItems: 'center',
        width: 36,
        height: 36,
        border: 0,
        borderRadius: '50%',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer'
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.1L20 8H6.2" />
        <circle cx="9.5" cy="20" r="1.3" />
        <circle cx="17" cy="20" r="1.3" />
      </svg>
      {count > 0 && (
        <span
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            minWidth: 17,
            height: 17,
            padding: '0 4px',
            borderRadius: 999,
            background: '#d6453d',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            lineHeight: '17px',
            textAlign: 'center'
          }}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
