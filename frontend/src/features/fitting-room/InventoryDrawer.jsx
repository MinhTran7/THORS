import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Switch, Typography } from '@mui/material';
import { money } from 'features/shop/ShopCommon';
import { C } from 'features/shop/storeTheme';
import { primaryButtonSx } from 'features/customer/theme';
import { fitSummary } from 'features/fitting/fitText';
import { DRAG_TYPE, fitOf, loadSizeAdvice, loadVariants, sizeSupported, variantFor } from './wardrobeData';

const chipSx = (on) => ({
  fontWeight: 600,
  borderRadius: '10px',
  border: `1px solid ${on ? C.primary : C.line}`,
  bgcolor: on ? C.primary : '#fff',
  color: on ? '#fff' : C.ink,
  '&:hover': { bgcolor: on ? C.primaryDark : C.sand }
});

/** Size mặc định: M nếu có mô hình, không thì size đầu tiên có mô hình (món chưa có 3D: size đầu tiên). */
const defaultSize = (variants, model) => {
  const sizes = [...new Set(variants.map((v) => v.size))];
  const ok = model ? sizes.filter((s) => sizeSupported(model, s)) : sizes;
  return ok.find((s) => String(s).toUpperCase() === 'M') ?? ok[0] ?? '';
};

/**
 * Kho đồ của một ô trang bị (mở khi bấm ô): lưới thẻ sản phẩm (ảnh, tên, giá, size có 3D, đang mặc).
 * Mặc định chỉ món có mô hình 3D đúng người mẫu; công tắc hiện thêm món chưa có 3D (ghi rõ, không mặc giả).
 * Bấm thẻ -> chọn size / màu (size gợi ý theo số đo chọn sẵn) -> Mặc thử. Kéo thẻ thả lên người mẫu cũng được.
 */
export default function InventoryDrawer({ slot, label, products, gender, measurements, worn, onWear, onClose, openRequest }) {
  const [showAll, setShowAll] = useState(false);
  const [group, setGroup] = useState('ALL');
  const [picking, setPicking] = useState(null); // { product, variants, advice, size, color, loading }
  const [error, setError] = useState('');

  // Đổi ô: về trạng thái đầu
  useEffect(() => {
    setGroup('ALL');
    setPicking(null);
    setError('');
  }, [slot]);

  const inSlot = useMemo(
    () => (products ?? []).filter((p) => p.slot === slot && (p.model ? p.model.gender === gender : showAll)),
    [products, slot, gender, showAll]
  );
  const groups = [...new Set(inSlot.map((p) => p.categoryName).filter(Boolean))];
  const shown = inSlot.filter((p) => group === 'ALL' || p.categoryName === group);
  const without3d = (products ?? []).filter((p) => p.slot === slot && !p.model).length;

  const open = async (product) => {
    setPicking({ product, variants: [], size: '', color: '', loading: true });
    try {
      const [variants, advice] = await Promise.all([loadVariants(product.productId), loadSizeAdvice(product.productId, measurements)]);
      const rec = advice?.recommendedSize;
      const ok = (s) => !product.model || sizeSupported(product.model, s);
      const size = rec && ok(rec) && variants.some((v) => v.size === rec) ? rec : defaultSize(variants, product.model);
      setPicking({ product, variants, advice, size, color: variants.find((v) => v.size === size)?.color ?? '', loading: false });
    } catch (e) {
      setPicking(null);
      setError(e.message || 'Không tải được size / màu của sản phẩm.');
    }
  };

  const wear = () => {
    const { product, variants, advice, size, color } = picking;
    const v = variantFor(variants, size, color);
    if (!v) return;
    onWear({
      slot: product.slot,
      productId: product.productId,
      productName: product.productName,
      imageUrl: product.imageUrl,
      price: v.price,
      detailId: v.detailId,
      size: v.size,
      color: v.color,
      stock: v.stock,
      has3d: Boolean(product.model),
      model: product.model,
      variants,
      advice
    });
    setPicking(null);
  };

  // Món được kéo thả lên người mẫu -> mở chọn size / màu của món đó
  useEffect(() => {
    const p = openRequest && (products ?? []).find((x) => x.productId === openRequest.productId);
    if (p) open(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  const pickedVariant = picking && !picking.loading ? variantFor(picking.variants, picking.size, picking.color) : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ fontWeight: 800 }}>{label}</Typography>
        <Button color="inherit" size="small" onClick={onClose} sx={{ textTransform: 'none', color: C.muted, fontWeight: 600, minWidth: 0 }}>
          Đóng ✕
        </Button>
      </Box>

      {groups.length > 1 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
          {['ALL', ...groups].map((g) => (
            <Chip key={g} size="small" label={g === 'ALL' ? 'Tất cả' : g} clickable onClick={() => setGroup(g)} sx={chipSx(group === g)} />
          ))}
        </Box>
      )}
      {without3d > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
          <Switch size="small" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          <Typography sx={{ fontSize: 12.5, color: C.muted }}>Hiện cả món chưa có 3D ({without3d})</Typography>
        </Box>
      )}
      {error && <Typography sx={{ color: C.accent, fontSize: 12.5, mb: 1 }}>{error}</Typography>}

      {/* Lưới thẻ */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 0.5 }}>
        {products === null ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} sx={{ color: C.primary }} />
          </Box>
        ) : shown.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: C.muted }}>
            Chưa có món nào có mô hình 3D ở ô này cho người mẫu {gender === 'MALE' ? 'nam' : 'nữ'}.
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 1 }}>
            {shown.map((p) => {
              const on = worn.includes(p.productId);
              const active = picking?.product.productId === p.productId;
              const sizes = p.model ? Object.keys(p.model.sizes ?? {}) : [];
              return (
                <Box
                  key={p.productId}
                  component="button"
                  type="button"
                  onClick={() => open(p)}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, String(p.productId))}
                  aria-pressed={on}
                  title={p.productName}
                  sx={{
                    position: 'relative',
                    p: 0,
                    border: `1.5px solid ${active || on ? C.primary : C.line}`,
                    borderRadius: '12px',
                    overflow: 'hidden',
                    bgcolor: '#fff',
                    cursor: 'grab',
                    textAlign: 'left',
                    font: 'inherit',
                    opacity: p.model ? 1 : 0.75,
                    boxShadow: active ? '0 0 0 2px rgba(138,43,43,0.25)' : 'none'
                  }}
                >
                  <Box sx={{ aspectRatio: '3 / 4', bgcolor: C.photo }}>
                    {p.imageUrl && (
                      <Box
                        component="img"
                        src={p.imageUrl}
                        alt={p.productName}
                        draggable={false}
                        sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    )}
                  </Box>
                  {on && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        px: 0.75,
                        borderRadius: '6px',
                        bgcolor: C.primary,
                        color: '#fff',
                        fontSize: 10.5,
                        fontWeight: 700
                      }}
                    >
                      Đang mặc
                    </Box>
                  )}
                  <Box sx={{ px: 0.75, py: 0.5 }}>
                    <Typography noWrap sx={{ fontSize: 12, fontWeight: 700 }}>
                      {p.productName}
                    </Typography>
                    <Typography sx={{ fontSize: 11.5, fontWeight: 700 }}>{p.minPrice != null ? money(p.minPrice) : ''}</Typography>
                    <Typography noWrap sx={{ fontSize: 11, color: p.model ? C.muted : C.accent }}>
                      {p.model ? sizes.join(' · ') : 'Chưa có 3D'}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Chọn size / màu của món vừa bấm */}
      {picking && (
        <Box sx={{ mt: 1, pt: 1, borderTop: `1px solid ${C.line}` }}>
          <Typography noWrap sx={{ fontWeight: 700, fontSize: 13.5 }}>
            {picking.product.productName}
          </Typography>
          {picking.loading ? (
            <CircularProgress size={18} sx={{ color: C.primary, mt: 1 }} />
          ) : (
            <>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.75 }}>
                {[...new Set(picking.variants.map((v) => v.size))].map((s) => {
                  const ok = !picking.product.model || sizeSupported(picking.product.model, s);
                  return (
                    <Chip
                      key={s}
                      size="small"
                      label={!ok ? `${s} (chưa có 3D)` : picking.advice?.recommendedSize === s ? `${s} · gợi ý` : s}
                      clickable={ok}
                      disabled={!ok}
                      onClick={() => ok && setPicking((p) => ({ ...p, size: s, color: variantFor(p.variants, s, p.color)?.color ?? '' }))}
                      sx={chipSx(picking.size === s)}
                    />
                  );
                })}
              </Box>
              {fitOf(picking.advice, picking.size, fitSummary) && (
                <Typography sx={{ fontSize: 12, color: C.muted, mt: 0.5 }}>{fitOf(picking.advice, picking.size, fitSummary)}</Typography>
              )}
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.75 }}>
                {picking.variants
                  .filter((v) => v.size === picking.size)
                  .map((v) => (
                    <Chip
                      key={v.detailId}
                      size="small"
                      label={v.stock > 0 ? v.color : `${v.color} (hết hàng)`}
                      clickable
                      onClick={() => setPicking((p) => ({ ...p, color: v.color }))}
                      sx={chipSx(picking.color === v.color)}
                    />
                  ))}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
                <Typography sx={{ fontWeight: 800 }}>{pickedVariant?.price != null ? money(pickedVariant.price) : ''}</Typography>
                <Button color="inherit" onClick={wear} disabled={!pickedVariant} sx={{ ...primaryButtonSx, height: 36, fontSize: 13 }}>
                  {picking.product.model ? 'Mặc thử' : 'Thêm vào bộ'}
                </Button>
              </Box>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
