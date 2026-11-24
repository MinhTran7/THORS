import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import { post } from 'services/http';
import { C } from 'features/shop/storeTheme';
import { cardSx, outlineButtonSx, primaryButtonSx } from 'features/customer/theme';
import TryOnDialog from 'features/tryon/TryOnDialog';

// Ô đồ -> vai trò của "Mặc thử bằng AI" (áo khoác thử như áo)
const TRYON_ROLE = { OUTER: 'TOP', TOP: 'TOP', BOTTOM: 'BOTTOM', DRESS: 'DRESS', SHOES: 'SHOES' };

/**
 * Hành động với bộ đang mặc (GĐ5): thêm cả bộ vào giỏ (API giỏ hàng có sẵn, đúng biến thể đang chọn, báo riêng từng món)
 * và "Xem ảnh thật bằng AI" (TryOnDialog có sẵn - ảnh 2D trên người mẫu / ảnh của khách).
 */
export default function OutfitActions({ items }) {
  const [adding, setAdding] = useState(false);
  const [results, setResults] = useState([]); // [{ name, ok, message }]
  const [tryOn, setTryOn] = useState(false);

  if (items.length === 0) return null;

  const addAll = async () => {
    setAdding(true);
    const out = [];
    // Lần lượt từng món: món hết hàng / ngừng bán báo riêng, các món khác vẫn vào giỏ
    for (const i of items) {
      try {
        await post('/cart/items', { detailId: i.detailId, quantity: 1 });
        out.push({ name: i.productName, ok: true });
      } catch (e) {
        out.push({ name: i.productName, ok: false, message: e.message || 'Không thêm được.' });
      }
    }
    setResults(out);
    setAdding(false);
    if (out.some((r) => r.ok)) window.dispatchEvent(new Event('thors:cart-changed'));
  };

  return (
    <Box sx={{ ...cardSx, p: 2.5 }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button color="inherit" onClick={addAll} disabled={adding} sx={{ ...primaryButtonSx, height: 40, fontSize: 13.5, flex: 1 }}>
          {adding ? 'Đang thêm…' : `Thêm ${items.length} món vào giỏ`}
        </Button>
        <Button color="inherit" onClick={() => setTryOn(true)} sx={{ ...outlineButtonSx, height: 40, fontSize: 13.5, flex: 1 }}>
          Xem ảnh thật bằng AI
        </Button>
      </Box>

      {results.map((r) => (
        <Typography key={r.name} sx={{ fontSize: 12.5, mt: 0.75, color: r.ok ? '#1F7A4D' : C.accent }}>
          {r.ok ? `✓ ${r.name}` : `✗ ${r.name}: ${r.message}`}
        </Typography>
      ))}
      {results.some((r) => r.ok) && (
        <Button
          color="inherit"
          component={RouterLink}
          to="/cart"
          size="small"
          sx={{ textTransform: 'none', fontWeight: 700, color: C.primary, mt: 0.5, px: 0 }}
        >
          Xem giỏ hàng →
        </Button>
      )}

      {tryOn && (
        <TryOnDialog
          open
          onClose={() => setTryOn(false)}
          items={items.map((i) => ({ productId: i.productId, productName: i.productName, imageUrl: i.imageUrl, role: TRYON_ROLE[i.slot] }))}
        />
      )}
    </Box>
  );
}
