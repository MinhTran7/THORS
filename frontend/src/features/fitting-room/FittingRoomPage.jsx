import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useCrumbs } from 'layouts/crumbs';
import { useAuth } from 'features/auth/AuthProvider';
import { C, SERIF } from 'features/shop/storeTheme';
import { getBodyProfile } from 'features/fitting/api';
import { fittingRoomReducer, initialState, wornItems } from './fittingRoomReducer';
import BodyProfilePanel from './BodyProfilePanel';
import AvatarStudio from './AvatarStudio';
import CurrentOutfitPanel from './CurrentOutfitPanel';
import EquipmentSlots, { EQUIP_SLOTS } from './EquipmentSlots';
import InventoryDrawer from './InventoryDrawer';
import OutfitRecommendationPanel from './OutfitRecommendationPanel';
import OutfitActions from './OutfitActions';
import SwapDialog from 'features/outfit/SwapDialog';
import { suggestOutfits } from 'features/outfit/api';
import { loadWardrobe, toWear, toWornItems } from './wardrobeData';

// Nhớ số đo đang thử + đồ đang mặc trong phiên (rời trang rồi quay lại vẫn còn), riêng từng tài khoản
const STORE_KEY = 'thors.fittingRoom';
const readStored = (owner) => {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
    return s && s.owner === owner ? s : null;
  } catch {
    return null;
  }
};

const MEASURE_KEYS = ['gender', 'heightCm', 'weightKg', 'chestCm', 'waistCm', 'hipCm'];

// Hồ sơ số đo (API body-profile) -> số đo của người mẫu; chưa có -> người mẫu nữ dáng chuẩn
const fromProfile = (p) =>
  p
    ? Object.fromEntries(MEASURE_KEYS.map((k) => [k, p[k] ?? '']))
    : { gender: 'FEMALE', heightCm: '', weightKg: '', chestCm: '', waistCm: '', hipCm: '' };

/**
 * Phòng thử đồ 3D (/fitting-room): người mẫu theo số đo của khách, mặc thử từng món / cả bộ.
 * Đã có: người mẫu + chỉnh dáng, tủ đồ (sản phẩm có mô hình 3D), mặc nhiều món, đổi size / màu, hoàn tác / làm lại.
 * Gợi ý size theo số đo (GĐ3), gợi ý bộ đồ + Đổi món (GĐ4). Thêm cả bộ vào giỏ + ảnh AI (GĐ5). Chọn dáng, áo cử động theo người, kéo thả, nhớ bộ đang mặc (GĐ6).
 */
export default function FittingRoomPage() {
  useCrumbs(['Phòng thử đồ']);
  const owner = useAuth()?.account?.id ?? null;
  const [state, dispatch] = useReducer(fittingRoomReducer, undefined, () => initialState(fromProfile(null)));
  const [loading, setLoading] = useState(true);
  const [hasSaved, setHasSaved] = useState(false);
  const [error, setError] = useState('');
  const [outfitRequest, setOutfitRequest] = useState(null); // điều kiện của bộ gợi ý gần nhất (để Đổi món)
  const [swapSlot, setSwapSlot] = useState(null);
  const [openRequest, setOpenRequest] = useState(null); // món được kéo thả lên người mẫu
  const [panel, setPanel] = useState(null); // ô trang bị / công cụ đang mở (TOP, BOTTOM..., BODY, SUGGEST)
  const [products, setProducts] = useState(null); // sản phẩm cửa hàng + mô hình 3D (null = đang tải)

  useEffect(() => {
    loadWardrobe()
      .then(setProducts)
      .catch((e) => {
        setProducts([]);
        setError(e.message || 'Không tải được kho đồ.');
      });
  }, []);

  useEffect(() => {
    let alive = true;
    getBodyProfile()
      .then((p) => {
        if (!alive) return;
        setHasSaved(Boolean(p));
        dispatch({ type: 'LOAD_PROFILE', measurements: fromProfile(p) });
        const stored = readStored(owner);
        if (stored) dispatch({ type: 'RESTORE', measurements: stored.measurements, slots: stored.slots });
      })
      .catch((e) => alive && setError(e.message || 'Không tải được số đo của bạn.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [owner]);

  useEffect(() => {
    if (loading) return;
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ owner, measurements: state.measurements, slots: state.slots }));
    } catch {
      // trình duyệt chặn lưu trữ: chỉ mất tính năng nhớ
    }
  }, [loading, owner, state.measurements, state.slots]);

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), []);
  // Chỉ món có mô hình 3D cho đúng size đang chọn mới được vẽ lên người mẫu
  const worn = useMemo(() => wornItems(state.slots), [state.slots]);
  const wear = useMemo(() => worn.map(toWear).filter(Boolean), [worn]);
  // Mặc cả bộ gợi ý (1 bước hoàn tác)
  const wearOutfit = async (items, request) => {
    dispatch({ type: 'WEAR_OUTFIT', items: await toWornItems(items, state.measurements.gender) });
    setOutfitRequest(request);
  };
  // Đổi một món của bộ: giữ các món còn lại
  const swapItem = swapSlot ? state.slots[swapSlot] : null;
  const swapRequest = swapItem && { ...outfitRequest, keepDetailIds: worn.filter((i) => i !== swapItem).map((i) => i.detailId) };
  const replace = async (outfitItem) => {
    setSwapSlot(null);
    if (!outfitItem) return;
    const [item] = await toWornItems([outfitItem], state.measurements.gender);
    dispatch({ type: 'REMOVE', slot: swapSlot });
    dispatch({ type: 'WEAR', item });
  };
  const autoSwap = async () => {
    try {
      const res = await suggestOutfits({ ...swapRequest, excludeProductIds: [swapItem.productId] });
      await replace(res?.outfits?.[0]?.items.find((i) => i.role === swapItem.role));
    } catch (e) {
      setSwapSlot(null);
      setError(e.message || 'Không tìm được món khác.');
    }
  };
  const changed = MEASURE_KEYS.some((k) => String(state.measurements[k] ?? '') !== String(state.saved[k] ?? ''));
  const togglePanel = (id) => setPanel((cur) => (cur === id ? null : id));
  // Thả món lên người mẫu: mở ô của món đó và hộp chọn size / màu
  const dropProduct = (productId) => {
    const p = (products ?? []).find((x) => x.productId === productId);
    if (!p?.slot) return;
    setPanel(p.slot);
    setOpenRequest({ productId, at: Date.now() });
  };
  const slotLabel = Object.fromEntries(EQUIP_SLOTS);
  const drawer =
    panel === 'BODY' ? (
      <Box sx={{ overflowY: 'auto', mx: -1.75, my: -1.75 }}>
        <BodyProfilePanel
          measurements={state.measurements}
          hasSaved={hasSaved}
          changed={changed}
          onChange={(key, value) => dispatch({ type: 'SET_MEASUREMENT', key, value })}
          onReset={() => dispatch({ type: 'RESET_MEASUREMENTS' })}
        />
      </Box>
    ) : panel === 'SUGGEST' ? (
      <Box sx={{ overflowY: 'auto', mx: -1.75, my: -1.75 }}>
        <OutfitRecommendationPanel gender={state.measurements.gender} onWearOutfit={wearOutfit} />
      </Box>
    ) : panel ? (
      <InventoryDrawer
        slot={panel}
        label={slotLabel[panel]}
        products={products}
        gender={state.measurements.gender}
        measurements={state.measurements}
        worn={worn.map((i) => i.productId)}
        onWear={(item) => dispatch({ type: 'WEAR', item })}
        onClose={() => setPanel(null)}
        openRequest={openRequest}
      />
    ) : null;

  return (
    <Box sx={{ maxWidth: 1320, mx: 'auto', px: { xs: 2, md: 4 }, py: { xs: 3, md: 5 } }}>
      <Typography sx={{ fontFamily: SERIF, fontSize: { xs: 28, md: 36 }, mb: 0.5 }}>Phòng thử đồ</Typography>
      <Typography sx={{ color: C.muted, mb: 3 }}>Người mẫu 3D theo đúng số đo của bạn. Chọn đồ để mặc thử từng món hoặc cả bộ.</Typography>

      {error && <Typography sx={{ color: C.accent, fontSize: 13.5, mb: 2 }}>{error}</Typography>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress size={36} sx={{ color: C.primary }} />
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '84px minmax(0, 1fr)', lg: '84px minmax(0, 1fr) 340px' },
            gap: { xs: 1.5, md: 2.5 },
            alignItems: 'start'
          }}
        >
          {/* Ô trang bị: cột dọc (desktop) / hàng ngang (mobile) */}
          <EquipmentSlots slots={state.slots} panel={panel} onToggle={togglePanel} />

          <AvatarStudio
            profile={state.measurements}
            wear={wear}
            canUndo={state.history.past.length > 0}
            canRedo={state.history.future.length > 0}
            onUndo={undo}
            onRedo={redo}
            onDropProduct={dropProduct}
            drawer={drawer}
          />

          <Box sx={{ display: 'grid', gap: 2.5, gridColumn: { md: '1 / -1', lg: 'auto' } }}>
            <CurrentOutfitPanel
              slots={state.slots}
              selected={state.selected}
              onSelect={(slot) => dispatch({ type: 'SELECT', slot })}
              onRemove={(slot) => dispatch({ type: 'REMOVE', slot })}
              onClear={() => dispatch({ type: 'CLEAR_ALL' })}
              onChangeVariant={(slot, patch) => dispatch({ type: 'UPDATE_ITEM', slot, patch })}
              onSwap={outfitRequest ? setSwapSlot : null}
            />
            <OutfitActions items={worn} />
          </Box>
        </Box>
      )}

      {swapItem && (
        <SwapDialog
          item={swapItem}
          request={swapRequest}
          budget={outfitRequest.budget}
          onClose={() => setSwapSlot(null)}
          onChoose={(chosen) => replace(chosen?.item ?? chosen)}
          onAuto={autoSwap}
        />
      )}
    </Box>
  );
}
