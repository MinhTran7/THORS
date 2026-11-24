import { useEffect, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Typography } from '@mui/material';
import { money } from 'features/shop/ShopCommon';
import { C } from 'features/shop/storeTheme';
import { cardSx, primaryButtonSx } from 'features/customer/theme';
import { getOutfitOptions, suggestOutfits } from 'features/outfit/api';

const BUDGETS = [500000, 1000000, 2000000, 3000000];
const chipSx = (on) => ({
  fontWeight: 600,
  borderRadius: '10px',
  border: `1px solid ${on ? C.primary : C.line}`,
  bgcolor: on ? C.primary : '#fff',
  color: on ? '#fff' : C.ink,
  '&:hover': { bgcolor: on ? C.primaryDark : C.sand }
});

/**
 * Gợi ý bộ đồ (API outfit có sẵn): chọn dịp + ngân sách -> các bộ vừa size, còn hàng, trong ngân sách -> "Mặc cả bộ".
 * onWearOutfit(items, request): items là OutfitItem của bộ; request để "Đổi món" dùng lại điều kiện.
 */
export default function OutfitRecommendationPanel({ gender, onWearOutfit }) {
  const [options, setOptions] = useState(null);
  const [occasion, setOccasion] = useState('');
  const [budget, setBudget] = useState(1000000);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [wearing, setWearing] = useState(-1);
  const [error, setError] = useState('');

  useEffect(() => {
    getOutfitOptions()
      .then(setOptions)
      .catch(() => setOptions({ occasions: {}, styles: {} }));
  }, []);

  // Đổi người mẫu nam / nữ: bộ cũ không còn hợp
  useEffect(() => setResult(null), [gender]);

  const request = { occasion, budget, gender: gender || null, styles: [], avoidColors: [] };

  const suggest = async () => {
    setLoading(true);
    setError('');
    try {
      setResult(await suggestOutfits(request));
    } catch (e) {
      setError(e.message || 'Không gợi ý được bộ đồ.');
    } finally {
      setLoading(false);
    }
  };

  const wear = async (outfit, i) => {
    setWearing(i);
    try {
      await onWearOutfit(outfit.items, request);
      setResult(null); // mặc xong thì thu danh sách lại (bấm Gợi ý bộ đồ để xem lại)
    } catch (e) {
      setError(e.message || 'Không mặc được bộ này.');
    } finally {
      setWearing(-1);
    }
  };

  return (
    <Box sx={{ ...cardSx, p: 2.5 }}>
      <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Gợi ý bộ đồ</Typography>
      <Typography sx={{ fontSize: 13, color: C.muted, mb: 1.5 }}>Chọn dịp và ngân sách, THORS ghép sẵn bộ vừa size của bạn.</Typography>

      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.25 }}>
        {Object.entries(options?.occasions ?? {}).map(([code, label]) => (
          <Chip key={code} size="small" label={label} clickable onClick={() => setOccasion(code)} sx={chipSx(occasion === code)} />
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
        {BUDGETS.map((b) => (
          <Chip key={b} size="small" label={money(b)} clickable onClick={() => setBudget(b)} sx={chipSx(budget === b)} />
        ))}
      </Box>
      <Button color="inherit" onClick={suggest} disabled={!occasion || loading} sx={{ ...primaryButtonSx, height: 38, fontSize: 13.5 }}>
        {loading ? 'Đang ghép…' : 'Gợi ý bộ đồ'}
      </Button>

      {error && <Typography sx={{ color: C.accent, fontSize: 13, mt: 1 }}>{error}</Typography>}
      {result && result.outfits?.length === 0 && (
        <Typography sx={{ fontSize: 13, color: C.muted, mt: 1.5 }}>{result.message || 'Chưa ghép được bộ nào.'}</Typography>
      )}
      {result?.outfits?.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}>
          <Typography sx={{ fontSize: 13, color: C.muted }}>{result.outfits.length} bộ gợi ý</Typography>
          <Button
            color="inherit"
            size="small"
            onClick={() => setResult(null)}
            sx={{ textTransform: 'none', color: C.muted, fontWeight: 600 }}
          >
            Đóng gợi ý
          </Button>
        </Box>
      )}
      {(result?.outfits ?? []).map((o, i) => (
        <Box key={i} sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${C.line}` }}>
          <Box sx={{ display: 'flex', gap: 0.75, mb: 1 }}>
            {o.items.map((it) => (
              <Box
                key={it.detailId}
                title={it.productName}
                sx={{ width: 52, height: 66, borderRadius: '8px', overflow: 'hidden', bgcolor: C.photo }}
              >
                {it.imageUrl && (
                  <Box component="img" src={it.imageUrl} alt={it.productName} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </Box>
            ))}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontWeight: 800 }}>{money(o.total)}</Typography>
            <Button
              color="inherit"
              onClick={() => wear(o, i)}
              disabled={wearing >= 0}
              sx={{ ...primaryButtonSx, height: 34, fontSize: 13 }}
            >
              {wearing === i ? 'Đang mặc…' : 'Mặc cả bộ'}
            </Button>
          </Box>
        </Box>
      ))}
      {loading && <CircularProgress size={20} sx={{ color: C.primary, mt: 1 }} />}
    </Box>
  );
}
