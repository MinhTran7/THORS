import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Snackbar } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import { post } from 'services/http';
import { CHECKOUT_PATH, takePending } from './pendingCart';

/**
 * Chạy ngay sau khi khách đăng nhập/đăng ký xong:
 *  - "Thêm vào giỏ hàng": thêm sản phẩm đã chọn rồi báo "Đã thêm vào giỏ hàng".
 *  - "Mua ngay": thêm sản phẩm rồi chuyển thẳng tới trang đặt hàng.
 * Tự kiểm tra tài khoản CUSTOMER, nên chỉ cần đặt <PendingCartHandler /> ở bất kỳ trang nào
 * mà khách đăng nhập xong sẽ vào (ví dụ layout hoặc trang /workspace).
 */
export default function PendingCartHandler() {
  const navigate = useNavigate();
  const auth = useAuth();
  const role = auth?.account?.role;
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (role !== 'CUSTOMER') return;
    const pending = takePending();
    if (!pending) return;
    (async () => {
      try {
        await post('/cart/items', { detailId: pending.detailId, quantity: pending.quantity });
        window.dispatchEvent(new Event('thors:cart-changed'));
        if (pending.buyNow) {
          navigate(CHECKOUT_PATH, { state: { detailIds: [pending.detailId], buyNow: true } });
          return;
        }
        setResult({ ok: true, text: `Đã thêm “${pending.label}” vào giỏ hàng.` });
      } catch (e) {
        setResult({ ok: false, text: `Chưa thêm được vào giỏ hàng: ${e.message}` });
      }
    })();
  }, [role, navigate]);

  return (
    <Snackbar
      open={Boolean(result)}
      autoHideDuration={7000}
      onClose={() => setResult(null)}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      {result ? (
        <Alert
          severity={result.ok ? 'success' : 'error'}
          onClose={() => setResult(null)}
          action={
            result.ok ? (
              <Button color="inherit" size="small" onClick={() => navigate('/cart')}>
                Xem giỏ hàng
              </Button>
            ) : undefined
          }
        >
          {result.text}
        </Alert>
      ) : undefined}
    </Snackbar>
  );
}
