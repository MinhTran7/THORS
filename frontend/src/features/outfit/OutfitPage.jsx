import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Chip, CircularProgress, InputAdornment, TextField, Typography } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import { useCrumbs } from 'layouts/crumbs';
import { post } from 'services/http';
import { money } from 'features/shop/ShopCommon';
import { C, SERIF } from 'features/shop/storeTheme';
import { getOutfitOptions, suggestOutfits } from './api';
import { getBodyProfile } from 'features/fitting/api';
import TryOnDialog from 'features/tryon/TryOnDialog';
import SwapDialog from './SwapDialog';

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

// Lưu tạm trạng thái trang trong phiên trình duyệt (tiện cho khách, không bắt buộc - lỗi lưu trữ thì bỏ qua)
const SAVED_KEY = 'thors.outfit.page';
const readSaved = () => {
  try {
    return JSON.parse(sessionStorage.getItem(SAVED_KEY) || 'null');
  } catch {
    return null;
  }
};
const writeSaved = (state) => {
  try {
    sessionStorage.setItem(SAVED_KEY, JSON.stringify(state));
  } catch {
    /* trình duyệt chặn lưu trữ: bỏ qua */
  }
};
const formatMoneyInput = (text) => (digits(text) ? Number(digits(text)).toLocaleString('vi-VN') : '');

/**
 * "Phối đồ cho bạn": khách chọn dịp + ngân sách (+ phong cách, màu tránh) -> hệ thống ghép bộ áo + quần / đầm + giày
 * vừa size, còn hàng, trong ngân sách. Đổi từng món, xem bộ khác, tìm bộ rẻ hơn, thêm cả bộ vào giỏ.
 */
export default function OutfitPage() {
  useCrumbs(['Phối đồ cho bạn']);
  const account = useAuth()?.account;
  const isCustomer = account?.role === 'CUSTOMER';

  // Lần phối trước trong phiên này (rời trang rồi quay lại vẫn còn) - chỉ của đúng tài khoản đang đăng nhập
  const [saved] = useState(() => {
    const s = readSaved();
    return s && s.owner === (account?.id ?? null) ? s : {};
  });

  const [options, setOptions] = useState(null);
  const [occasion, setOccasion] = useState(saved.occasion ?? '');
  const [budgetText, setBudgetText] = useState(saved.budgetText ?? '1.000.000');
  const [styles, setStyles] = useState(saved.styles ?? []);
  const [avoidText, setAvoidText] = useState(saved.avoidText ?? '');
  const [gender, setGender] = useState(saved.gender ?? '');

  const [result, setResult] = useState(saved.result ?? null); // { outfits, message, usedBodyProfile }
  const [index, setIndex] = useState(saved.index ?? 0);
  const [excluded, setExcluded] = useState(saved.excluded ?? []); // sản phẩm khách đã bấm "Đổi món"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cartMessage, setCartMessage] = useState({ type: '', text: '' });
  const [tryOnOpen, setTryOnOpen] = useState(false); // mặc thử cả bộ bằng AI (ảnh 2D)
  const [swapItem, setSwapItem] = useState(null); // món đang chọn để đổi (mở danh sách món thay thế)

  useEffect(() => {
    if (isCustomer) {
      getBodyProfile()
        // Có số đo đã lưu: chọn sẵn nam / nữ theo số đo
        .then((p) => p?.gender && setGender((g) => g || p.gender))
        .catch(() => {});
    }
    getOutfitOptions()
      .then(setOptions)
      .catch(() => setOptions({ occasions: {}, styles: {}, failed: true }));
  }, [isCustomer]);

  // Ghi nhớ lựa chọn + các bộ đã gợi ý trong phiên (đóng tab trình duyệt là quên)
  useEffect(() => {
    writeSaved({ owner: account?.id ?? null, occasion, budgetText, styles, avoidText, gender, result, index, excluded });
  }, [account?.id, occasion, budgetText, styles, avoidText, gender, result, index, excluded]);

  const budget = Number(digits(budgetText)) || 0;
  const outfit = result?.outfits?.[index];

  // Điều kiện phối đồ đang chọn trên trang (dùng cho gợi ý và cho danh sách "Đổi món")
  const requestBody = (overrides = {}) => ({
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
  });

  // Gọi API phối đồ; overrides dùng cho "Đổi món" / "Rẻ hơn"
  const run = async (overrides = {}) => {
    if (!occasion) return setError('Hãy chọn dịp mặc.');
    if (!gender) return setError('Hãy chọn phối đồ nam hay nữ.');
    if (budget < 50000) return setError('Ngân sách tối thiểu 50.000 ₫.');
    setLoading(true);
    setError('');
    setCartMessage({ type: '', text: '' });
    try {
      const data = await suggestOutfits(requestBody(overrides));
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

  const othersOf = (item) => outfit.items.filter((i) => i.detailId !== item.detailId).map((i) => i.detailId);

  // Đổi một món, để hệ thống tự chọn: giữ các món còn lại, bỏ sản phẩm này
  const swap = (item) => {
    const nextExcluded = [...excluded, item.productId];
    setExcluded(nextExcluded);
    setSwapItem(null);
    run({ keepDetailIds: othersOf(item), excludeProductIds: nextExcluded });
  };

  // Khách tự chọn món thay thế: giữ các món còn lại + đúng món vừa chọn
  const swapTo = (item, chosen) => {
    setSwapItem(null);
    run({ keepDetailIds: [...othersOf(item), chosen.detailId] });
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
                      onClick={() => setSwapItem(item)}
                      sx={{ mt: 0.5, px: 0, textTransform: 'none', fontWeight: 700, color: C.accent }}
                    >
                      Đổi món này
                    </Button>
                  </Box>
                ))}
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
                {account && (
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
                )}
                {isCustomer && (
                  <Button
                    onClick={() => setTryOnOpen(true)}
                    disabled={loading}
                    sx={{
                      borderRadius: '12px',
                      textTransform: 'none',
                      fontWeight: 700,
                      px: 2.5,
                      border: `1.5px solid ${C.ink}`,
                      color: C.ink
                    }}
                  >
                    Mặc thử bộ này
                  </Button>
                )}
                {!account && (
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

      {/* Đổi món: khách tự chọn món thay thế, hoặc để hệ thống tự chọn */}
      {swapItem && outfit && (
        <SwapDialog
          item={swapItem}
          request={requestBody({ keepDetailIds: othersOf(swapItem) })}
          budget={budget}
          onClose={() => setSwapItem(null)}
          onChoose={(chosen) => swapTo(swapItem, chosen)}
          onAuto={() => swap(swapItem)}
        />
      )}

      {/* Mặc thử cả bộ đang xem (giày dép backend tự bỏ qua và báo lại) */}
      {isCustomer && outfit && (
        <TryOnDialog
          open={tryOnOpen}
          onClose={() => setTryOnOpen(false)}
          items={outfit.items.map((i) => ({ productId: i.productId, productName: i.productName, imageUrl: i.imageUrl, role: i.role }))}
          extraActions={
            <Button
              onClick={addAll}
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
          }
        />
      )}
    </Box>
  );
}
