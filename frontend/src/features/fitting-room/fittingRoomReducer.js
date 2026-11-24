// State của Phòng thử đồ (useReducer): số đo đang xem, các ô đồ đang mặc, món đang chọn, hoàn tác / làm lại.
// Hàm thuần, không gọi API, không đụng giao diện -> kiểm thử độc lập được.

/** Ô đồ trên người, theo thứ tự từ ngoài vào trong / trên xuống dưới. */
export const SLOTS = ['OUTER', 'TOP', 'DRESS', 'BOTTOM', 'SHOES'];
export const SLOT_LABELS = { OUTER: 'Áo khoác', TOP: 'Áo', DRESS: 'Đầm / váy liền', BOTTOM: 'Quần / chân váy', SHOES: 'Giày' };

const EMPTY_SLOTS = Object.freeze(Object.fromEntries(SLOTS.map((s) => [s, null])));
// Số bước hoàn tác tối đa (đủ dùng, không giữ lịch sử vô hạn trong bộ nhớ)
export const HISTORY_LIMIT = 30;

/**
 * measurements: { gender, heightCm, weightKg, chestCm, waistCm, hipCm } (chuỗi hoặc số, '' = chưa có).
 * saved: số đo đã lưu ở "Số đo của tôi" (để nút "Về số đo đã lưu").
 * slots: { OUTER|TOP|DRESS|BOTTOM|SHOES: Worn | null }
 *   Worn = { slot, productId, productName, imageUrl, price, detailId, size, color, has3d }
 * lastKey: khóa của lần sửa trước - gõ / kéo liên tục cùng một ô số đo chỉ tính 1 bước hoàn tác.
 */
export function initialState(measurements = {}) {
  return {
    measurements,
    saved: measurements,
    slots: EMPTY_SLOTS,
    selected: null,
    history: { past: [], future: [] },
    lastKey: null
  };
}

const snapshot = (s) => ({ measurements: s.measurements, slots: s.slots });

// Ghi một bước có thể hoàn tác. Cùng key với bước trước (vd đang kéo thanh "Vòng eo") thì gộp làm một.
function commit(state, next, key = null) {
  const merge = key !== null && key === state.lastKey;
  const past = merge ? state.history.past : [...state.history.past, snapshot(state)].slice(-HISTORY_LIMIT);
  return { ...state, ...next, history: { past, future: [] }, lastKey: key };
}

/**
 * Mặc một món vào đúng ô. Luật xếp lớp:
 * - Đầm / váy liền chiếm cả phần áo và quần -> cởi Áo + Quần.
 * - Mặc Áo hoặc Quần -> cởi Đầm.
 * - Áo khoác mặc ngoài Áo / Đầm, giày độc lập.
 */
export function wearInSlots(slots, item) {
  if (!item || !SLOTS.includes(item.slot)) return slots;
  const next = { ...slots };
  if (item.slot === 'DRESS') {
    next.TOP = null;
    next.BOTTOM = null;
  }
  if (item.slot === 'TOP' || item.slot === 'BOTTOM') next.DRESS = null;
  next[item.slot] = item;
  return next;
}

export function fittingRoomReducer(state, action) {
  switch (action.type) {
    // Tải số đo đã lưu: bắt đầu lại từ đầu (xóa lịch sử)
    case 'LOAD_PROFILE':
      return initialState(action.measurements ?? {});

    // Khôi phục số đo + đồ đang mặc đã lưu trong phiên (rời trang rồi quay lại); saved vẫn là số đo đã lưu ở hồ sơ
    case 'RESTORE': {
      const slots = Object.fromEntries(SLOTS.map((k) => [k, action.slots?.[k] ?? null]));
      return { ...initialState(state.saved), measurements: { ...state.saved, ...action.measurements }, slots };
    }

    case 'SET_MEASUREMENT': {
      const { key, value } = action;
      if (state.measurements[key] === value) return state;
      const measurements = { ...state.measurements, [key]: value };
      // Đổi giới tính: đồ đang mặc là của người mẫu kia -> cởi hết
      const slots = key === 'gender' ? EMPTY_SLOTS : state.slots;
      return commit(state, { measurements, slots, selected: key === 'gender' ? null : state.selected }, `m:${key}`);
    }

    case 'RESET_MEASUREMENTS':
      return commit(state, { measurements: state.saved });

    case 'WEAR': {
      const slots = wearInSlots(state.slots, action.item);
      if (slots === state.slots) return state;
      return commit(state, { slots, selected: action.item.slot });
    }

    // Mặc cả bộ: bỏ hết đồ cũ rồi mặc lần lượt (1 bước hoàn tác)
    case 'WEAR_OUTFIT': {
      const slots = (action.items ?? []).reduce(wearInSlots, EMPTY_SLOTS);
      return commit(state, { slots, selected: null });
    }

    case 'REMOVE': {
      if (!state.slots[action.slot]) return state;
      return commit(state, {
        slots: { ...state.slots, [action.slot]: null },
        selected: state.selected === action.slot ? null : state.selected
      });
    }

    // Đổi biến thể (size / màu) của món đang mặc: patch = { detailId, size, color, price }
    case 'UPDATE_ITEM': {
      const current = state.slots[action.slot];
      if (!current || !action.patch) return state;
      const next = { ...current, ...action.patch };
      if (Object.keys(action.patch).every((k) => current[k] === next[k])) return state;
      return commit(state, { slots: { ...state.slots, [action.slot]: next } });
    }

    case 'CLEAR_ALL':
      if (SLOTS.every((s) => !state.slots[s])) return state;
      return commit(state, { slots: EMPTY_SLOTS, selected: null });

    // Chọn món để đổi size / màu - không phải thay đổi trên người mẫu, không ghi lịch sử
    case 'SELECT':
      return { ...state, selected: action.slot ?? null };

    case 'UNDO': {
      const { past, future } = state.history;
      if (past.length === 0) return state;
      const prev = past[past.length - 1];
      return { ...state, ...prev, history: { past: past.slice(0, -1), future: [snapshot(state), ...future] }, lastKey: null };
    }

    case 'REDO': {
      const { past, future } = state.history;
      if (future.length === 0) return state;
      const [next, ...rest] = future;
      return { ...state, ...next, history: { past: [...past, snapshot(state)].slice(-HISTORY_LIMIT), future: rest }, lastKey: null };
    }

    default:
      return state;
  }
}

/** Đang mặc món nào (theo thứ tự ô). */
export const wornItems = (slots) => SLOTS.map((s) => slots[s]).filter(Boolean);
