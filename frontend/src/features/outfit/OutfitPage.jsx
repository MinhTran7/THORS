import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Chip, CircularProgress, InputAdornment, TextField, Typography } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import { useCrumbs } from 'layouts/crumbs';
import { post } from 'services/http';
import { money } from 'features/shop/ShopCommon';
import { C, SERIF } from 'features/shop/storeTheme';
import { getOutfitOptions, suggestOutfits } from './api';
import { getBodyProfile } from 'features/fitting/api';
import { colorHex } from 'features/fitting/avatar/colorNames';

// Hình 3D chỉ tải khi có bộ đồ để xem (thư viện 3D khá nặng)
const AvatarViewer = lazy(() => import('features/fitting/avatar/AvatarViewer'));
// Chưa có số đo: dáng tham khảo theo giới tính
const DEFAULT_BODY = { FEMALE: { heightCm: 160, weightKg: 52 }, MALE: { heightCm: 170, weightKg: 65 } };

const BUDGET_PRESETS = [500000, 1000000, 2000000, 3000000];
const GENDERS = [
  ['FEMALE', 'Nữ'],
  ['MALE', 'Nam']
];

const chipSx = (on) => ({
  fontWeight: 600,
  borderRadius: '10px',
  border: `1px solid ${on ? C.ink : C.line}`,
  bgcolor: on ? C.ink : '#fff',
  color: on ? '#fff' : C.ink,
  '&:hover': { bgcolor: on ? C.ink : C.sand }
});

const digits = (text) => String(text).replace(/\D/g, '').slice(0, 9);
const formatMoneyInput = (text) => (digits(text) ? Number(digits(text)).toLocaleString('vi-VN') : '');

/**
 * "Phối đồ cho bạn": khách chọn dịp + ngân sách (+ phong cách, màu tránh) -> hệ thống ghép bộ áo + quần / đầm + giày
 * vừa size, còn hàng, trong ngân sách. Đổi từng món, xem bộ khác, tìm bộ rẻ hơn, thêm cả bộ vào giỏ.
 */
export default function OutfitPage() {
  useCrumbs(['Phối đồ cho bạn']);
  const account = useAuth()?.account;
  const isCustomer = account?.role === 'CUSTOMER';

  const [options, setOptions] = useState(null);
  const [bodyProfile, setBodyProfile] = useState(null); // số đo đã lưu (dáng 3D)
  const [occasion, setOccasion] = useState('');
  const [budgetText, setBudgetText] = useState('1.000.000');
  const [styles, setStyles] = useState([]);
  const [avoidText, setAvoidText] = useState('');
  const [gender, setGender] = useState('');

  const [result, setResult] = useState(null); // { outfits, message, usedBodyProfile }
  const [index, setIndex] = useState(0);
  const [excluded, setExcluded] = useState([]); // sản phẩm khách đã bấm "Đổi món"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cartMessage, setCartMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (isCustomer) {
      getBodyProfile()
        .then((p) => {
          setBodyProfile(p);
          if (p?.gender) setGender((g) => g || p.gender);
        })
        .catch(() => {});
    }
    getOutfitOptions()
      .then(setOptions)
      .catch(() => setOptions({ occasions: {}, styles: {}, failed: true }));
  }, [isCustomer]);

  const budget = Number(digits(budgetText)) || 0;
  const outfit = result?.outfits?.[index];
  // Người mẫu 3D: theo số đo đã lưu (cùng giới tính), không có thì dáng tham khảo
  const avatarProfile = useMemo(
    () => (bodyProfile && bodyProfile.gender === gender ? bodyProfile : { gender, ...DEFAULT_BODY[gender] }),
    [bodyProfile, gender]
  );
  // Cả bộ lên người mẫu: mỗi món tô đúng màu biến thể; quần short / chân váy chỉ tới gối
  const avatarOutfit = useMemo(
    () =>
      outfit?.items.map((i) => ({
        role: i.role,
        color: colorHex(i.color),
        short: /short|chân váy|ngắn/i.test(i.productName)
      })),
    [outfit]
  );

  // Gọi API phối đồ; overrides dùng cho "Đổi món" / "Rẻ hơn"
  const run = async (overrides = {}) => {
    if (!occasion) return setError('Hãy chọn dịp mặc.');
    if (!gender) return setError('Hãy chọn phối đồ nam hay nữ.');
    if (budget < 50000) return setError('Ngân sách tối thiểu 50.000 ₫.');
    setLoading(true);
    setError('');
    setCartMessage({ type: '', text: '' });
    try {
      const body = {
        occasion,
        budget,
        gender: gender || null,
        styles,
        avoidColors: avoidText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        keepDetailIds: [],
        excludeProductIds: excluded,
        ...overrides
      };
      const data = await suggestOutfits(body);
      setResult(data);
      setIndex(0);
    } catch (e) {
      setError(e.message || 'Không phối được đồ.');
    } finally {
      setLoading(false);
    }
  };

  const start = () => {
    setExcluded([]);
    run({ excludeProductIds: [] });
  };

  // Đổi một món: giữ các món còn lại, bỏ sản phẩm này
  const swap = (item) => {
    const nextExcluded = [...excluded, item.productId];
    setExcluded(nextExcluded);
    run({
      keepDetailIds: outfit.items.filter((i) => i.detailId !== item.detailId).map((i) => i.detailId),
      excludeProductIds: nextExcluded
    });
  };

  // Rẻ hơn: ngân sách = tổng bộ hiện tại - 1.000 ₫
  const cheaper = () => run({ budget: Math.max(50000, outfit.total - 1000) });

  const addAll = async () => {
    setCartMessage({ type: '', text: '' });
    try {
      for (const item of outfit.items) await post('/cart/items', { detailId: item.detailId, quantity: 1 });
      window.dispatchEvent(new Event('thors:cart-changed'));
      setCartMessage({ type: 'success', text: `Đã thêm ${outfit.items.length} món vào giỏ hàng.` });
    } catch (e) {
      setCartMessage({ type: 'error', text: e.message || 'Không thêm được vào giỏ hàng.' });
    }
  };

  const toggleStyle = (code) => setStyles((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]));

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto', px: { xs: 2, md: 4 }, py: { xs: 3, md: 5 } }}>
      <Typography sx={{ fontFamily: SERIF, fontSize: { xs: 28, md: 36 }, mb: 0.5 }}>Phối đồ cho bạn</Typography>
      <Typography sx={{ color: C.muted, mb: 3 }}>
        Chọn dịp và ngân sách, THORS ghép sẵn một bộ vừa size, còn hàng và không vượt ngân sách của bạn.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '360px 1fr' }, gap: 3, alignItems: 'start' }}>
        {/* ----- Bộ lọc ----- */}
        <Box sx={{ border: `1px solid ${C.line}`, borderRadius: '16px', p: 2.5, bgcolor: '#fff' }}>
          <Typography sx={{ fontWeight: 700, mb: 1 }}>Bạn mặc đi đâu?</Typography>
          {options?.failed && (
            <Typography sx={{ color: C.accent, fontSize: 13.5, mb: 2 }}>
              Không tải được danh sách dịp mặc. Hãy tải lại trang sau ít phút.
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2.5 }}>
            {Object.entries(options?.occasions ?? {}).map(([code, label]) => (
              <Chip key={code} label={label} clickable onClick={() => setOccasion(code)} sx={chipSx(occasion === code)} />
            ))}
          </Box>

          <Typography sx={{ fontWeight: 700, mb: 1 }}>Ngân sách cho cả bộ</Typography>
          <TextField
            fullWidth
            size="small"
            value={budgetText}
            onChange={(e) => setBudgetText(formatMoneyInput(e.target.value))}
            autoComplete="off"
            slotProps={{ htmlInput: { inputMode: 'numeric' }, input: { endAdornment: <InputAdornment position="end">₫</InputAdornment> } }}
          />
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1, mb: 2.5 }}>
            {BUDGET_PRESETS.map((v) => (
              <Chip
                key={v}
                size="small"
                label={money(v)}
                clickable
                onClick={() => setBudgetText(formatMoneyInput(v))}
                sx={chipSx(budget === v)}
              />
            ))}
          </Box>

          {/* Bắt buộc chọn để không trộn đồ nam / nữ; khách đã lưu số đo thì chọn sẵn */}
          <>
            <Typography sx={{ fontWeight: 700, mb: 1 }}>Đồ dành cho</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2.5 }}>
              {GENDERS.map(([code, label]) => (
                <Chip key={code} label={label} clickable onClick={() => setGender(code)} sx={chipSx(gender === code)} />
              ))}
            </Box>
          </>

          <Typography sx={{ fontWeight: 700, mb: 1 }}>Phong cách (không bắt buộc)</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2.5 }}>
            {Object.entries(options?.styles ?? {}).map(([code, label]) => (
              <Chip key={code} label={label} clickable onClick={() => toggleStyle(code)} sx={chipSx(styles.includes(code))} />
            ))}
          </Box>

          <Typography sx={{ fontWeight: 700, mb: 1 }}>Màu muốn tránh (không bắt buộc)</Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="vd: đỏ, vàng"
            value={avoidText}
            onChange={(e) => setAvoidText(e.target.value)}
            autoComplete="off"
          />
          {isCustomer && (
            <Typography sx={{ fontSize: 12.5, color: C.muted, mt: 1 }}>
              Bỏ trống phong cách / màu tránh thì dùng hồ sơ phong cách bạn đã lưu ở{' '}
              <Box component={RouterLink} to="/body-profile" sx={{ color: C.accent }}>
                Số đo của tôi
              </Box>
              .
            </Typography>
          )}

          {error && <Typography sx={{ color: C.accent, fontSize: 13.5, mt: 2 }}>{error}</Typography>}
          <Button
            fullWidth
            onClick={start}
            disabled={loading}
            sx={{
              mt: 2.5,
              py: 1.2,
              borderRadius: '12px',
              textTransform: 'none',
              fontWeight: 700,
              bgcolor: C.ink,
              color: '#fff',
              '&:hover': { bgcolor: '#333' }
            }}
          >
            {loading ? 'Đang phối đồ…' : 'Phối đồ'}
          </Button>
        </Box>

        {/* ----- Kết quả ----- */}
        <Box>
          {loading && !result && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
              <CircularProgress size={32} sx={{ color: C.ink }} />
            </Box>
          )}
          {!result && !loading && (
            <Box sx={{ border: `1px dashed ${C.line}`, borderRadius: '16px', p: 5, textAlign: 'center', color: C.muted }}>
              Chọn dịp mặc và ngân sách rồi bấm <strong>Phối đồ</strong>.
            </Box>
          )}
          {result && !outfit && (
            <Box sx={{ border: `1px solid ${C.line}`, borderRadius: '16px', p: 4, textAlign: 'center' }}>{result.message}</Box>
          )}
          {outfit && (
            <Box
              sx={{ border: `1px solid ${C.line}`, borderRadius: '16px', p: { xs: 2, md: 3 }, bgcolor: '#fff', opacity: loading ? 0.5 : 1 }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 18 }}>
                  Bộ {index + 1}/{result.outfits.length}
                </Typography>
                <Typography sx={{ fontSize: 22, fontWeight: 700 }}>{money(outfit.total)}</Typography>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '300px 1fr' }, gap: 3, alignItems: 'start' }}>
                {/* Mặc thử cả bộ trên dáng 3D của khách */}
                <Box>
                  <Box
                    sx={{
                      height: { xs: 380, md: 440 },
                      borderRadius: '14px',
                      overflow: 'hidden',
                      background: 'linear-gradient(180deg, #F7F5F2 0%, #ECE8E2 100%)'
                    }}
                  >
                    <Suspense fallback={null}>
                      <AvatarViewer profile={avatarProfile} outfit={avatarOutfit} />
                    </Suspense>
                  </Box>
                  <Typography sx={{ fontSize: 12, color: C.muted, mt: 1, textAlign: 'center' }}>
                    {bodyProfile && bodyProfile.gender === gender
                      ? 'Mặc thử trên dáng theo số đo của bạn · kéo để xoay'
                      : 'Dáng tham khảo · lưu số đo để xem trên dáng của bạn'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: `repeat(${outfit.items.length}, 1fr)` }, gap: 2 }}>
                  {outfit.items.map((item) => (
                    <Box key={item.detailId}>
                      <Box
                        component={RouterLink}
                        to={`/shop/products/${item.productId}`}
                        sx={{ display: 'block', aspectRatio: '3 / 4', borderRadius: '12px', overflow: 'hidden', bgcolor: C.photo }}
                      >
                        {item.imageUrl && (
                          <Box
                            component="img"
                            src={item.imageUrl}
                            alt={item.productName}
                            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        )}
                      </Box>
                      <Typography sx={{ fontSize: 12, color: C.muted, mt: 1 }}>{item.roleLabel}</Typography>
                      <Typography sx={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{item.productName}</Typography>
                      <Typography sx={{ fontSize: 13, color: C.muted }}>
                        {item.color} · {item.sizeNote}
                      </Typography>
                      <Typography sx={{ fontWeight: 700, fontSize: 14, mt: 0.5 }}>{money(item.price)}</Typography>
                      <Button
                        size="small"
                        disabled={loading}
                        onClick={() => swap(item)}
                        sx={{ mt: 0.5, px: 0, textTransform: 'none', fontWeight: 700, color: C.accent }}
                      >
                        Đổi món này
                      </Button>
                    </Box>
                  ))}
                </Box>
              </Box>
              <Box component="ul" sx={{ m: 0, mt: 2, pl: 2.5, color: C.muted, fontSize: 13.5 }}>
                {outfit.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </Box>

              {cartMessage.text && (
                <Typography sx={{ mt: 1.5, fontSize: 13.5, color: cartMessage.type === 'error' ? C.accent : '#1F7A4D' }}>
                  {cartMessage.text}
                </Typography>
              )}

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2.5 }}>
                {account ? (
                  <Button
                    onClick={addAll}
                    disabled={loading}
                    sx={{
                      borderRadius: '12px',
                      textTransform: 'none',
                      fontWeight: 700,
                      px: 2.5,
                      bgcolor: C.ink,
                      color: '#fff',
                      '&:hover': { bgcolor: '#333' }
                    }}
                  >
                    Thêm cả bộ vào giỏ
                  </Button>
                ) : (
                  <Button
                    component={RouterLink}
                    to="/login"
                    sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, px: 2.5, bgcolor: C.ink, color: '#fff' }}
                  >
                    Đăng nhập để mua cả bộ
                  </Button>
                )}
                <Button
                  disabled={loading || index + 1 >= result.outfits.length}
                  onClick={() => setIndex(index + 1)}
                  sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, border: `1px solid ${C.line}`, color: C.ink }}
                >
                  Phối bộ khác
                </Button>
                <Button
                  disabled={loading}
                  onClick={cheaper}
                  sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, border: `1px solid ${C.line}`, color: C.ink }}
                >
                  Tìm bộ rẻ hơn
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
