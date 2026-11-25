import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { C } from 'features/shop/storeTheme';
import { getSizeGuide } from './api';
import { fitSummary } from './fitText';

const MEASURES = [
  { key: 'height', label: 'Chiều cao', unit: 'cm' },
  { key: 'weight', label: 'Cân nặng', unit: 'kg' },
  { key: 'chest', label: 'Ngực', unit: 'cm' },
  { key: 'waist', label: 'Eo', unit: 'cm' },
  { key: 'hip', label: 'Hông', unit: 'cm' },
  { key: 'foot', label: 'Bàn chân', unit: 'cm' }
];

const range = (min, max) => (min == null ? '–' : `${Number(min)}–${Number(max)}`);

/**
 * Khung "Gợi ý size" trên trang sản phẩm của cửa hàng.
 * Không hiện gì khi sản phẩm chưa có bảng size. onChoose(size) = chọn sẵn size đó trong ô chọn size.
 */
export default function SizeAdvisor({ productId, selectedSize, onChoose, isCustomer, isLoggedIn }) {
  const [guide, setGuide] = useState(null);
  const [showChart, setShowChart] = useState(false);

  useEffect(() => {
    let alive = true;
    getSizeGuide(productId)
      .then((g) => alive && setGuide(g))
      .catch(() => alive && setGuide(null)); // lỗi gợi ý size không được làm hỏng trang sản phẩm
    return () => {
      alive = false;
    };
  }, [productId]);

  const shoes = guide?.kind === 'SHOES';
  // Giày dép không quy đổi được size (vd. dép S / M / L) và chưa có bảng size -> chỉ nhắc nhẹ
  if (shoes && !guide?.chart?.length) {
    return (
      <Typography sx={{ fontSize: 13, color: C.muted, mt: -1, mb: 2 }}>
        Mẹo: chọn đúng size giày bạn thường đi. Chân bè hoặc mu bàn chân cao thì nên tăng 1 size.
      </Typography>
    );
  }
  if (!guide?.chart?.length) return null;

  const rec = guide.recommendation;
  const best = rec?.sizes?.[0];
  const alt = rec?.alternativeSize ? rec.sizes.find((s) => s.size === rec.alternativeSize) : null;
  const usedMeasures = MEASURES.filter((m) => guide.chart.some((r) => r[`${m.key}Min`] != null));

  const chooseButton = (size) => (
    <Button
      size="small"
      variant={selectedSize === size ? 'contained' : 'outlined'}
      disableElevation
      onClick={() => onChoose(size)}
      sx={{
        textTransform: 'none',
        fontWeight: 700,
        borderRadius: '10px',
        borderColor: C.ink,
        color: selectedSize === size ? '#fff' : C.ink,
        bgcolor: selectedSize === size ? C.ink : 'transparent'
      }}
    >
      {selectedSize === size ? `Đã chọn size ${size}` : `Chọn size ${size}`}
    </Button>
  );

  return (
    <Box sx={{ border: `1px solid ${C.line}`, borderRadius: '14px', p: 2, mb: 2, bgcolor: '#FBFAF8' }}>
      {rec?.recommendedSize ? (
        <>
          <Typography sx={{ fontWeight: 700, fontSize: 15 }}>
            Gợi ý cho bạn: size {rec.recommendedSize}
            {rec.confidence === 'HIGH' && ' (vừa với số đo của bạn)'}
          </Typography>
          {guide.standard && (
            <Typography sx={{ fontSize: 12.5, color: C.muted }}>
              Ước lượng theo bảng size chuẩn, mẫu này có thể rộng hoặc chật hơn một chút.
            </Typography>
          )}
          {best && <Typography sx={{ fontSize: 13.5, color: C.muted, mt: 0.5 }}>{fitSummary(best.details)}</Typography>}
          {rec.confidence === 'LOW' && (
            <Typography sx={{ fontSize: 13, color: C.accent, mt: 0.5 }}>
              Số đo của bạn khá lệch so với bảng size của sản phẩm này, bạn nên xem kỹ bảng size.
            </Typography>
          )}
          {!rec.inStock && (
            <Typography sx={{ fontSize: 13.5, color: C.accent, mt: 1 }}>
              Size {rec.recommendedSize} đang hết hàng.
              {alt ? ` Size ${alt.size} còn hàng (${fitSummary(alt.details)}).` : ' Hiện chưa có size thay thế còn hàng.'}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
            {rec.inStock && chooseButton(rec.recommendedSize)}
            {alt && chooseButton(alt.size)}
          </Box>
        </>
      ) : rec && shoes && isCustomer ? (
        // Đã có số đo nhưng chưa có chiều dài bàn chân
        <Typography sx={{ fontSize: 14 }}>
          <Link component={RouterLink} to="/body-profile" sx={{ color: C.accent, fontWeight: 700 }}>
            Thêm chiều dài bàn chân
          </Link>{' '}
          để được gợi ý size giày vừa với bạn.
        </Typography>
      ) : rec ? (
        <Typography sx={{ fontSize: 14 }}>Bảng size của sản phẩm này không có số đo giống số đo bạn đã lưu, hãy xem bảng size.</Typography>
      ) : (
        <Typography sx={{ fontSize: 14 }}>
          {isCustomer ? (
            <>
              <Link component={RouterLink} to="/body-profile" sx={{ color: C.accent, fontWeight: 700 }}>
                Nhập số đo
              </Link>{' '}
              để được gợi ý size vừa với bạn.
            </>
          ) : isLoggedIn ? (
            'Gợi ý size theo số đo dành cho tài khoản khách hàng.'
          ) : (
            'Đăng nhập và nhập số đo để được gợi ý size vừa với bạn.'
          )}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 2, mt: 1.5, fontSize: 13 }}>
        <Link component="button" type="button" onClick={() => setShowChart(true)} sx={{ color: C.ink, fontSize: 13 }}>
          Xem bảng size
        </Link>
        {rec && isCustomer && (
          <Link component={RouterLink} to="/body-profile" sx={{ color: C.muted, fontSize: 13 }}>
            Cập nhật số đo
          </Link>
        )}
      </Box>

      <Dialog open={showChart} onClose={() => setShowChart(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Bảng size</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: C.muted, mb: 1.5 }}>
            Số đo cơ thể phù hợp với từng size{guide.standard ? ' (bảng size chuẩn tham khảo)' : ''}.
          </Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Size</TableCell>
                  {usedMeasures.map((m) => (
                    <TableCell key={m.key} align="center" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {m.label} ({m.unit})
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {guide.chart.map((r) => (
                  <TableRow key={r.sizeLabel} selected={r.sizeLabel === rec?.recommendedSize}>
                    <TableCell sx={{ fontWeight: 700 }}>{r.sizeLabel}</TableCell>
                    {usedMeasures.map((m) => (
                      <TableCell key={m.key} align="center">
                        {range(r[`${m.key}Min`], r[`${m.key}Max`])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
