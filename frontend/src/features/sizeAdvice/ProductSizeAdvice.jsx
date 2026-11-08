import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import useSWR from 'swr';
import { Box, Button, Collapse } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import { C } from 'features/shop/storeTheme';
import { CONFIDENCE_LABEL, sizeAdviceApi } from './api';

const boxSx = { border: `1px solid ${C.line}`, borderRadius: '14px', p: 2, fontSize: 14, lineHeight: 1.55 };
const linkSx = { color: C.ink, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px' };

function FitBar({ stats }) {
  const total = stats.tight + stats.fit + stats.loose;
  if (!total) return null;
  const parts = [
    { label: 'Chật', value: stats.tight, color: '#E0559A' },
    { label: 'Vừa', value: stats.fit, color: '#2F6B3F' },
    { label: 'Rộng', value: stats.loose, color: '#C9A227' }
  ];
  return (
    <Box sx={{ mt: 1.5 }}>
      <Box sx={{ fontSize: 12, color: C.muted, mb: 0.75 }}>{total} khách đã đánh giá form mẫu này</Box>
      <Box sx={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', bgcolor: C.line }}>
        {parts.map((p) => p.value > 0 && <Box key={p.label} sx={{ width: `${(p.value / total) * 100}%`, bgcolor: p.color }} />)}
      </Box>
      <Box sx={{ display: 'flex', gap: 2, mt: 0.75, fontSize: 12, color: C.muted }}>
        {parts.map((p) => (
          <span key={p.label}>
            {p.label} {Math.round((p.value / total) * 100)}%
          </span>
        ))}
      </Box>
    </Box>
  );
}

/**
 * Gợi ý size cho một sản phẩm, đặt cạnh phần chọn size ở trang sản phẩm:
 *
 *   <ProductSizeAdvice productId={product.id} onSelectSize={(size) => setSelectedSize(size)} />
 *
 * - Chưa đăng nhập, không phải khách hàng, túi xách / phụ kiện, hoặc API lỗi (vd database chưa chạy
 *   migration gợi ý size): không hiện gì, trang sản phẩm trông như trước khi có tính năng.
 * - Hồ sơ thiếu số đo: nhắc vào Hồ sơ để nhập.
 * - onSelectSize (tùy chọn): hiện nút "Chọn size …" để chọn nhanh size gợi ý.
 */
export default function ProductSizeAdvice({ productId, onSelectSize, sx }) {
  const { account } = useAuth();
  const isCustomer = account?.role === 'CUSTOMER';
  const [open, setOpen] = useState(false);
  const { data, error } = useSWR(isCustomer && productId ? ['size-advice', productId] : null, () => sizeAdviceApi.product(productId), {
    revalidateOnFocus: false
  });

  // Chưa đăng nhập / không phải khách / túi xách / API lỗi (kể cả DB chưa chạy migration): không hiện gì
  if (!isCustomer || error || !data || data.sizeType === 'NONE') return null;

  if (!data.size)
    return (
      <Box sx={{ ...boxSx, ...sx }}>
        {data.missing === 'FOOT' ? 'Thêm chiều dài bàn chân' : 'Thêm chiều cao, cân nặng'} trong{' '}
        <Box component={RouterLink} to="/profile" sx={linkSx}>
          Hồ sơ
        </Box>{' '}
        để nhận gợi ý size cho mẫu này.
      </Box>
    );

  return (
    <Box sx={{ ...boxSx, bgcolor: C.sand, borderColor: '#F2E3B0', ...sx }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
        <Box>
          <Box sx={{ fontSize: 12, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Size gợi ý cho bạn</Box>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Box sx={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2 }}>{data.size}</Box>
            <Box sx={{ fontSize: 12, color: C.muted }}>{CONFIDENCE_LABEL[data.confidence]}</Box>
          </Box>
        </Box>
        {onSelectSize && data.inStock && (
          <Button variant="outlined" size="small" onClick={() => onSelectSize(data.size)} sx={{ textTransform: 'none' }}>
            Chọn size {data.size}
          </Button>
        )}
      </Box>

      {!data.inStock && <Box sx={{ mt: 1, color: '#B42318', fontSize: 13 }}>Size {data.size} của mẫu này đang tạm hết hàng.</Box>}

      {data.reasons?.length > 0 && (
        <>
          <Box
            component="button"
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            sx={{ ...linkSx, mt: 1, p: 0, border: 0, bgcolor: 'transparent', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}
          >
            {open ? 'Ẩn lý do' : 'Vì sao là size này?'}
          </Box>
          <Collapse in={open}>
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5, fontSize: 13, color: C.ink }}>
              {data.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </Box>
          </Collapse>
        </>
      )}

      {data.productFit && <FitBar stats={data.productFit} />}
    </Box>
  );
}
