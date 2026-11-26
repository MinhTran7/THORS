import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCategories, sortCategoriesAsTree } from 'services/categoryService';
import { getProducts } from 'services/productService';
import {
  changePromotionStatus,
  deletePromotion,
  endPromotion,
  getPromotionById,
  getPromotionOrder,
  getPromotions,
  getVouchers
} from 'services/promotionService';
import { editBlockedMessage, isActive, KIND, kindOf, rowsOf, toggleBlockedMessage } from './utils';

// Tải dữ liệu mỗi khi hàm load đổi (bọc bằng useCallback) hoặc gọi reload; bỏ kết quả về muộn của lần tải cũ
function useLoad(load) {
  const [state, setState] = useState({ data: null, error: '' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    load()
      .then((data) => alive && setState({ data, error: '' }))
      .catch((err) => alive && setState((s) => ({ ...s, error: err.message || 'Không thể tải dữ liệu.' })));
    return () => {
      alive = false;
    };
  }, [load, version]);

  return {
    ...state,
    loading: state.data === null && !state.error,
    reload: useCallback(() => setVersion((v) => v + 1), []),
    clearError: () => setState((s) => ({ ...s, error: '' }))
  };
}

// Danh sách khuyến mãi của một loại (Owner)
export function usePromotions(kind) {
  const { data, ...rest } = useLoad(getPromotions);
  return { promotions: (data || []).filter((p) => kindOf(p) === kind), ...rest };
}

// Chi tiết khuyến mãi; mở nhầm loại thì chuyển sang đường dẫn đúng loại (suffix: '' hoặc '/edit')
export function usePromotion(promotionId, kind, suffix = '') {
  const navigate = useNavigate();
  const { data, error, reload } = useLoad(useCallback(() => getPromotionById(promotionId), [promotionId]));
  const wrongKind = data && kindOf(data) !== kind;

  useEffect(() => {
    if (wrongKind) navigate(`${KIND[kindOf(data)].base}/${promotionId}${suffix}`, { replace: true });
  }, [wrongKind, data, promotionId, suffix, navigate]);

  return { promotion: wrongKind ? null : data, error, reload };
}

// Toàn bộ sản phẩm (chỉ khuyến mãi sản phẩm cần); lỗi thì coi như rỗng
export function useProducts(enabled) {
  const { data, loading } = useLoad(useCallback(() => (enabled ? getProducts().then(rowsOf, () => []) : Promise.resolve([])), [enabled]));
  return { products: data || [], loading };
}

const loadCategories = () =>
  getCategories().then(
    (res) => sortCategoriesAsTree(rowsOf(res).filter(isActive)),
    () => []
  );

export const useCategories = () => useLoad(loadCategories).data || [];

// Các khuyến mãi sản phẩm đang bật khác, để báo sản phẩm bị trùng thời gian
export function useOtherProductPromotions(promotionId, enabled) {
  const load = useCallback(
    () =>
      enabled
        ? getPromotions().then(
            (list) => list.filter((p) => String(p.promotionId) !== String(promotionId) && isActive(p) && kindOf(p) === 'PRODUCT'),
            () => []
          )
        : Promise.resolve([]),
    [promotionId, enabled]
  );
  return useLoad(load).data || [];
}

// Báo cáo trên trang chi tiết (load bọc bằng useCallback)
export const useReport = (load) => useLoad(load).data;

// Một đơn xem trong popup của báo cáo
export function usePromotionOrder(promotionId, orderId) {
  const { data, error } = useLoad(useCallback(() => getPromotionOrder(promotionId, orderId), [promotionId, orderId]));
  return { order: data, error };
}

// Kho voucher của khách: tải lại khi quay lại tab
export function useVouchers() {
  const { data, loading, reload } = useLoad(getVouchers);
  useEffect(() => {
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [reload]);
  return { vouchers: data || [], loading };
}

// Bật/tắt, kết thúc sớm, xóa, mở trang sửa. Quyền thao tác (canEnable, canDelete...) do backend tính sẵn
// confirm: { promotion, title, message, warning, deletes, run } cho ConfirmDialog; notice: lý do bị chặn cho NoticeDialog
export function usePromotionActions(onDone) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(null);
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);

  const toggle = (p) => {
    const turningOff = isActive(p);
    if (!(turningOff ? p.canDisable : p.canEnable)) return setNotice(toggleBlockedMessage(p));
    setConfirm({
      promotion: p,
      title: turningOff ? 'Tắt khuyến mãi?' : 'Bật khuyến mãi?',
      message: `Bạn có chắc muốn ${turningOff ? 'tắt' : 'bật'} chương trình`,
      run: () => changePromotionStatus(p.promotionId, turningOff ? 'INACTIVE' : 'ACTIVE')
    });
  };

  const endEarly = (p) =>
    setConfirm({
      promotion: p,
      title: 'Kết thúc sớm?',
      message: 'Kết thúc ngay chương trình',
      warning:
        kindOf(p) === 'ORDER'
          ? `Khách đã thấy mã sẽ không dùng được nữa. Đã có ${p.usedCount || 0} đơn dùng mã, các đơn này vẫn giữ mức giảm. Chỉ dùng khi nhập sai.`
          : 'Giá sản phẩm trở về giá gốc ngay. Các đơn đã đặt vẫn giữ mức giảm. Chỉ dùng khi nhập sai.',
      run: () => endPromotion(p.promotionId)
    });

  const remove = (p) =>
    setConfirm({
      promotion: p,
      title: 'Xóa khuyến mãi?',
      message: 'Xóa vĩnh viễn chương trình',
      deletes: true,
      run: () => deletePromotion(p.promotionId)
    });

  const edit = (p) => {
    if (p.canEdit || p.canAdjust) navigate(`${KIND[kindOf(p)].base}/${p.promotionId}/edit`);
    else setNotice(editBlockedMessage(p));
  };

  // Lỗi từ backend hiện bằng NoticeDialog
  const run = async () => {
    setWorking(true);
    try {
      await confirm.run();
      await onDone(confirm);
    } catch (err) {
      setNotice(err.message || 'Không thể thực hiện thao tác.');
    } finally {
      setConfirm(null);
      setWorking(false);
    }
  };

  return {
    toggle,
    endEarly,
    remove,
    edit,
    dialogs: {
      confirm,
      working,
      notice,
      onCancel: () => setConfirm(null),
      onConfirm: run,
      onCloseNotice: () => setNotice('')
    }
  };
}
